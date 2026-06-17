import { prisma } from './db';
import { ApiFootballProvider } from './api-football-provider';
import { NormalizedFixture } from './results-provider';
import { recalculateMatchScore } from '../app/actions';

export async function syncTournament(syncType: 'FULL' | 'DAILY' | 'LIVE' | 'MANUAL') {
  const startedAt = new Date();
  
  // 1. Protection against concurrent runs: Check for active syncs in the last 5 minutes
  const activeSync = await prisma.syncLog.findFirst({
    where: {
      status: 'IN_PROGRESS',
      startedAt: {
        gte: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      },
    },
  });

  if (activeSync) {
    return {
      success: false,
      message: `Sync rejected: Another execution (${activeSync.syncType}) is currently in progress.`,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 1,
    };
  }

  // 2. Register sync log in database
  const syncLog = await prisma.syncLog.create({
    data: {
      provider: 'API-Football',
      syncType,
      startedAt,
      status: 'IN_PROGRESS',
    },
  });

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let finalMessage = '';

  try {
    const provider = new ApiFootballProvider();
    let fixtures: NormalizedFixture[] = [];

    if (syncType === 'FULL' || syncType === 'MANUAL') {
      fixtures = await provider.fetchTournamentFixtures();
    } else if (syncType === 'DAILY') {
      const todayStr = new Date().toISOString().split('T')[0];
      fixtures = await provider.fetchFixturesByDate(todayStr);
    } else if (syncType === 'LIVE') {
      fixtures = await provider.fetchLiveFixtures();
    }

    // 3. Process each normalized fixture
    for (const fixture of fixtures) {
      try {
        const resultStatus = await processNormalizedFixture(fixture);
        if (resultStatus === 'CREATED') createdCount++;
        else if (resultStatus === 'UPDATED') updatedCount++;
        else if (resultStatus === 'SKIPPED') skippedCount++;
      } catch (err: any) {
        errorCount++;
        console.error(`Error syncing fixture ${fixture.externalApiId}:`, err);
      }
    }

    const isSuccess = errorCount === 0 || (createdCount > 0 || updatedCount > 0);
    const status = isSuccess ? 'SUCCESS' : 'FAILED';
    finalMessage = `Sincronización finalizada con éxito. Creados: ${createdCount}, Actualizados: ${updatedCount}, Ignorados: ${skippedCount}, Errores: ${errorCount}`;

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        finishedAt: new Date(),
        status,
        createdCount,
        updatedCount,
        skippedCount,
        errorCount,
        message: finalMessage,
      },
    });

    return {
      success: true,
      message: finalMessage,
      createdCount,
      updatedCount,
      skippedCount,
      errorCount,
    };
  } catch (error: any) {
    console.error('Error during synchronization:', error);
    finalMessage = `Error en sincronización: ${error.message || 'Error desconocido'}`;

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        finishedAt: new Date(),
        status: 'FAILED',
        errorCount: 1,
        message: finalMessage,
      },
    });

    return {
      success: false,
      message: finalMessage,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 1,
    };
  }
}

export async function processNormalizedFixture(fixture: NormalizedFixture): Promise<'CREATED' | 'UPDATED' | 'SKIPPED'> {
  // Find match by externalApiId
  const existingMatch = await prisma.match.findUnique({
    where: { externalApiId: fixture.externalApiId },
  });

  if (!existingMatch) {
    // Determine initial resultSource: if API provides goals, it is API. Otherwise NONE.
    const hasResult = fixture.actualHomeScore !== null && fixture.actualAwayScore !== null;
    const resultSource = hasResult ? 'API' : 'NONE';

    await prisma.match.create({
      data: {
        externalApiId: fixture.externalApiId,
        stage: fixture.stage,
        groupName: fixture.groupName,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        kickoffAt: fixture.kickoffAt,
        status: fixture.status,
        actualHomeScore: fixture.actualHomeScore,
        actualAwayScore: fixture.actualAwayScore,
        actualHomePenalties: fixture.actualHomePenalties,
        actualAwayPenalties: fixture.actualAwayPenalties,
        actualWinner: fixture.actualWinner,
        resultSource,
      },
    });
    return 'CREATED';
  }

  // Update logic with manual protection policies
  const source = existingMatch.resultSource;

  if (source === 'MANUAL_REAL') {
    // Rule: MANUAL_REAL results can NEVER be overwritten.
    // However, non-sensitive metadata like kickoff time, group, stage can be updated.
    await prisma.match.update({
      where: { id: existingMatch.id },
      data: {
        kickoffAt: fixture.kickoffAt || existingMatch.kickoffAt,
        stage: fixture.stage,
        groupName: fixture.groupName || existingMatch.groupName,
      },
    });
    return 'SKIPPED';
  }

  if (source === 'MANUAL_SIMULATION') {
    // Rule: Overwrite simulation automatically only when there is a live or finished result.
    const isApiActive = fixture.status === 'FINISHED' || fixture.status === 'IN_PROGRESS';

    if (isApiActive) {
      const hasScoreChanged =
        existingMatch.actualHomeScore !== fixture.actualHomeScore ||
        existingMatch.actualAwayScore !== fixture.actualAwayScore ||
        existingMatch.actualHomePenalties !== fixture.actualHomePenalties ||
        existingMatch.actualAwayPenalties !== fixture.actualAwayPenalties ||
        existingMatch.actualWinner !== fixture.actualWinner ||
        existingMatch.status !== fixture.status;

      await prisma.match.update({
        where: { id: existingMatch.id },
        data: {
          status: fixture.status,
          actualHomeScore: fixture.actualHomeScore,
          actualAwayScore: fixture.actualAwayScore,
          actualHomePenalties: fixture.actualHomePenalties,
          actualAwayPenalties: fixture.actualAwayPenalties,
          actualWinner: fixture.actualWinner,
          resultSource: 'API',
          kickoffAt: fixture.kickoffAt || existingMatch.kickoffAt,
          stage: fixture.stage,
          groupName: fixture.groupName || existingMatch.groupName,
        },
      });

      if (hasScoreChanged) {
        await recalculateMatchScore(existingMatch.id);
      }
      return 'UPDATED';
    } else {
      // Keep simulation, just update kickoff time/metadata
      await prisma.match.update({
        where: { id: existingMatch.id },
        data: {
          kickoffAt: fixture.kickoffAt || existingMatch.kickoffAt,
        },
      });
      return 'SKIPPED';
    }
  }

  // API or NONE: overwrite always
  const hasScoreChanged =
    existingMatch.actualHomeScore !== fixture.actualHomeScore ||
    existingMatch.actualAwayScore !== fixture.actualAwayScore ||
    existingMatch.actualHomePenalties !== fixture.actualHomePenalties ||
    existingMatch.actualAwayPenalties !== fixture.actualAwayPenalties ||
    existingMatch.actualWinner !== fixture.actualWinner ||
    existingMatch.status !== fixture.status ||
    existingMatch.homeTeam !== fixture.homeTeam ||
    existingMatch.awayTeam !== fixture.awayTeam;

  const hasResult = fixture.actualHomeScore !== null && fixture.actualAwayScore !== null;
  const resultSource = hasResult ? 'API' : 'NONE';

  await prisma.match.update({
    where: { id: existingMatch.id },
    data: {
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      kickoffAt: fixture.kickoffAt,
      stage: fixture.stage,
      groupName: fixture.groupName,
      status: fixture.status,
      actualHomeScore: fixture.actualHomeScore,
      actualAwayScore: fixture.actualAwayScore,
      actualHomePenalties: fixture.actualHomePenalties,
      actualAwayPenalties: fixture.actualAwayPenalties,
      actualWinner: fixture.actualWinner,
      resultSource,
    },
  });

  if (hasScoreChanged) {
    await recalculateMatchScore(existingMatch.id);
  }
  return 'UPDATED';
}
