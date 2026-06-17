'use strict';

'use server';

import { prisma } from '@/lib/db';
import { calculateMatchScore } from '@/lib/scoring';
import { revalidatePath } from 'next/cache';
import { syncTournament } from '@/lib/sync-service';
import { compareDatabaseWithExcel, importExcelBackup, previewPredictionImport, confirmPredictionImport } from '@/lib/excel-parser';

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (error) {
    // Silently ignore when called outside of Next.js server context (e.g. CLI tests)
  }
}


// Helper: Recalcular e insertar puntaje para un partido individual
export async function recalculateMatchScore(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { prediction: true },
  });

  if (!match) return;

  if (match.actualHomeScore === null || match.actualAwayScore === null) {
    // Si no hay resultado, borramos el puntaje si existe
    await prisma.score.deleteMany({
      where: { matchId },
    });
    return;
  }

  // Calcular puntaje
  const scoreResult = calculateMatchScore(match.prediction, match);

  // Guardar idempotentemente
  await prisma.score.upsert({
    where: { matchId },
    update: {
      points: scoreResult.points,
      reason: scoreResult.reason,
      calculatedAt: new Date(),
    },
    create: {
      matchId,
      points: scoreResult.points,
      reason: scoreResult.reason,
    },
  });
}

// 1. Listar partidos completos con predicción y puntaje
export async function getMatchesWithData() {
  return await prisma.match.findMany({
    include: {
      prediction: true,
      score: true,
    },
    orderBy: [
      { kickoffAt: 'asc' },
      { createdAt: 'asc' },
    ],
  });
}

// 2. Guardar o actualizar una predicción
export async function upsertPrediction(
  matchId: string,
  data: {
    predictedHomeScore: number | null;
    predictedAwayScore: number | null;
    predictedHomePenalties: number | null;
    predictedAwayPenalties: number | null;
    predictedWinner: string | null;
  }
) {
  // Verificar si la predicción está completamente vacía para decidir si guardamos o eliminamos
  const isEmpty = data.predictedHomeScore === null && data.predictedAwayScore === null;

  await prisma.$transaction(async (tx) => {
    if (isEmpty) {
      await tx.prediction.deleteMany({
        where: { matchId },
      });
    } else {
      await tx.prediction.upsert({
        where: { matchId },
        update: {
          predictedHomeScore: data.predictedHomeScore,
          predictedAwayScore: data.predictedAwayScore,
          predictedHomePenalties: data.predictedHomePenalties,
          predictedAwayPenalties: data.predictedAwayPenalties,
          predictedWinner: data.predictedWinner,
        },
        create: {
          matchId,
          predictedHomeScore: data.predictedHomeScore,
          predictedAwayScore: data.predictedAwayScore,
          predictedHomePenalties: data.predictedHomePenalties,
          predictedAwayPenalties: data.predictedAwayPenalties,
          predictedWinner: data.predictedWinner,
        },
      });
    }

    // Recalcular e insertar puntaje para el partido de forma atómica
    const match = await tx.match.findUnique({
      where: { id: matchId },
      include: { prediction: true },
    });

    if (match) {
      if (match.actualHomeScore === null || match.actualAwayScore === null) {
        // Si no hay resultado, borramos el puntaje si existe
        await tx.score.deleteMany({
          where: { matchId },
        });
      } else {
        // Calcular puntaje
        const scoreResult = calculateMatchScore(match.prediction, match);

        // Guardar de forma idempotente
        await tx.score.upsert({
          where: { matchId },
          update: {
            points: scoreResult.points,
            reason: scoreResult.reason,
            calculatedAt: new Date(),
          },
          create: {
            matchId,
            points: scoreResult.points,
            reason: scoreResult.reason,
          },
        });
      }
    }
  });

  safeRevalidatePath('/');
  safeRevalidatePath('/predictions');
  safeRevalidatePath('/results');
  safeRevalidatePath('/scores');
}


// 3. Guardar o actualizar el resultado de un partido
export async function upsertMatchResult(
  matchId: string,
  data: {
    actualHomeScore: number | null;
    actualAwayScore: number | null;
    actualHomePenalties: number | null;
    actualAwayPenalties: number | null;
    actualWinner: string | null;
    status: string; // SCHEDULED, IN_PROGRESS, FINISHED, MANUAL_PROJECTION
    resultSource: string; // NONE, API, MANUAL_REAL, MANUAL_SIMULATION
  }
) {
  await prisma.match.update({
    where: { id: matchId },
    data: {
      actualHomeScore: data.actualHomeScore,
      actualAwayScore: data.actualAwayScore,
      actualHomePenalties: data.actualHomePenalties,
      actualAwayPenalties: data.actualAwayPenalties,
      actualWinner: data.actualWinner,
      status: data.status,
      resultSource: data.resultSource,
    },
  });

  // Recalcular puntaje inmediatamente
  await recalculateMatchScore(matchId);

  safeRevalidatePath('/');
  safeRevalidatePath('/predictions');
  safeRevalidatePath('/results');
  safeRevalidatePath('/scores');
}

// 4. Acción global: Recalcular todos los puntos
export async function recalculateAllScoresAction() {
  const matches = await prisma.match.findMany({
    include: { prediction: true },
  });

  for (const match of matches) {
    if (match.actualHomeScore === null || match.actualAwayScore === null) {
      await prisma.score.deleteMany({
        where: { matchId: match.id },
      });
    } else {
      const scoreResult = calculateMatchScore(match.prediction, match);
      await prisma.score.upsert({
        where: { matchId: match.id },
        update: {
          points: scoreResult.points,
          reason: scoreResult.reason,
          calculatedAt: new Date(),
        },
        create: {
          matchId: match.id,
          points: scoreResult.points,
          reason: scoreResult.reason,
        },
      });
    }
  }

  safeRevalidatePath('/');
  safeRevalidatePath('/predictions');
  safeRevalidatePath('/results');
  safeRevalidatePath('/scores');
  safeRevalidatePath('/settings');
}

// 5. Borrar todos los resultados simulados
export async function clearSimulatedResultsAction() {
  const simulatedMatches = await prisma.match.findMany({
    where: { resultSource: 'MANUAL_SIMULATION' },
  });

  for (const match of simulatedMatches) {
    await prisma.match.update({
      where: { id: match.id },
      data: {
        status: 'SCHEDULED',
        resultSource: 'NONE',
        actualHomeScore: null,
        actualAwayScore: null,
        actualHomePenalties: null,
        actualAwayPenalties: null,
        actualWinner: null,
      },
    });

    await prisma.score.deleteMany({
      where: { matchId: match.id },
    });
  }

  safeRevalidatePath('/');
  safeRevalidatePath('/predictions');
  safeRevalidatePath('/results');
  safeRevalidatePath('/scores');
  safeRevalidatePath('/settings');
}

// 6. CRUD Partidos: Crear Partido
export async function createMatchAction(data: {
  stage: string;
  groupName?: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt?: string; // ISO String
}) {
  const created = await prisma.match.create({
    data: {
      stage: data.stage,
      groupName: data.groupName || null,
      homeTeam: data.homeTeam,
      awayTeam: data.awayTeam,
      kickoffAt: data.kickoffAt ? new Date(data.kickoffAt) : null,
      status: 'SCHEDULED',
      resultSource: 'NONE',
    },
  });

  safeRevalidatePath('/');
  safeRevalidatePath('/predictions');
  safeRevalidatePath('/results');
  safeRevalidatePath('/settings');
  return created;
}

// 7. CRUD Partidos: Editar Partido
export async function updateMatchAction(
  matchId: string,
  data: {
    stage: string;
    groupName?: string;
    homeTeam: string;
    awayTeam: string;
    kickoffAt?: string;
  }
) {
  const updated = await prisma.match.update({
    where: { id: matchId },
    data: {
      stage: data.stage,
      groupName: data.groupName || null,
      homeTeam: data.homeTeam,
      awayTeam: data.awayTeam,
      kickoffAt: data.kickoffAt ? new Date(data.kickoffAt) : null,
    },
  });

  safeRevalidatePath('/');
  safeRevalidatePath('/predictions');
  safeRevalidatePath('/results');
  safeRevalidatePath('/scores');
  safeRevalidatePath('/settings');
  return updated;
}

// 8. CRUD Partidos: Eliminar Partido
export async function deleteMatchAction(matchId: string) {
  const deleted = await prisma.match.delete({
    where: { id: matchId },
  });

  safeRevalidatePath('/');
  safeRevalidatePath('/predictions');
  safeRevalidatePath('/results');
  safeRevalidatePath('/scores');
  safeRevalidatePath('/settings');
  return deleted;
}

// 9. Cargar Semilla Inicial de Partidos de Ejemplo Manualmente
export async function seedMatchesAction() {
  // Llamamos a las operaciones de vaciado y repoblación
  const createdMatches = [];
  
  // Limpiar
  await prisma.score.deleteMany({});
  await prisma.prediction.deleteMany({});
  await prisma.match.deleteMany({});

  const matchesData = [
    {
      stage: 'GROUP_STAGE',
      groupName: 'Grupo A',
      homeTeam: 'México',
      awayTeam: 'Colombia',
      kickoffAt: new Date('2026-06-11T18:00:00Z'),
      status: 'SCHEDULED',
      resultSource: 'NONE',
    },
    {
      stage: 'GROUP_STAGE',
      groupName: 'Grupo B',
      homeTeam: 'USA',
      awayTeam: 'Canadá',
      kickoffAt: new Date('2026-06-12T15:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 2,
      actualAwayScore: 1,
      resultSource: 'MANUAL_REAL',
    },
    {
      stage: 'GROUP_STAGE',
      groupName: 'Grupo C',
      homeTeam: 'Argentina',
      awayTeam: 'España',
      kickoffAt: new Date('2026-06-13T20:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 4,
      actualAwayScore: 0,
      resultSource: 'MANUAL_REAL',
    },
    {
      stage: 'GROUP_STAGE',
      groupName: 'Grupo D',
      homeTeam: 'Brasil',
      awayTeam: 'Uruguay',
      kickoffAt: new Date('2026-06-14T17:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 1,
      actualAwayScore: 0,
      resultSource: 'MANUAL_REAL',
    },
    {
      stage: 'GROUP_STAGE',
      groupName: 'Grupo E',
      homeTeam: 'Alemania',
      awayTeam: 'Japón',
      kickoffAt: new Date('2026-06-15T14:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 1,
      actualAwayScore: 2,
      resultSource: 'MANUAL_REAL',
    },
    {
      stage: 'ROUND_OF_32',
      homeTeam: 'Francia',
      awayTeam: 'Inglaterra',
      kickoffAt: new Date('2026-06-25T19:00:00Z'),
      status: 'MANUAL_PROJECTION',
      actualHomeScore: 2,
      actualAwayScore: 2,
      actualHomePenalties: 4,
      actualAwayPenalties: 3,
      actualWinner: 'Francia',
      resultSource: 'MANUAL_SIMULATION',
    },
    {
      stage: 'ROUND_OF_16',
      homeTeam: 'Portugal',
      awayTeam: 'Países Bajos',
      kickoffAt: new Date('2026-06-29T16:00:00Z'),
      status: 'SCHEDULED',
      resultSource: 'NONE',
    },
    {
      stage: 'QUARTER_FINAL',
      homeTeam: 'Italia',
      awayTeam: 'Bélgica',
      kickoffAt: new Date('2026-07-04T18:00:00Z'),
      status: 'SCHEDULED',
      resultSource: 'NONE',
    },
    {
      stage: 'SEMI_FINAL',
      homeTeam: 'Marruecos',
      awayTeam: 'Croacia',
      kickoffAt: new Date('2026-07-08T20:00:00Z'),
      status: 'SCHEDULED',
      resultSource: 'NONE',
    },
    {
      stage: 'THIRD_PLACE',
      homeTeam: 'Marruecos',
      awayTeam: 'Bélgica',
      kickoffAt: new Date('2026-07-11T16:00:00Z'),
      status: 'SCHEDULED',
      resultSource: 'NONE',
    },
    {
      stage: 'FINAL',
      homeTeam: 'Argentina',
      awayTeam: 'Francia',
      kickoffAt: new Date('2026-07-12T19:00:00Z'),
      status: 'MANUAL_PROJECTION',
      actualHomeScore: 1,
      actualAwayScore: 1,
      actualHomePenalties: 5,
      actualAwayPenalties: 4,
      actualWinner: 'Argentina',
      resultSource: 'MANUAL_SIMULATION',
    },
  ];

  for (const match of matchesData) {
    const created = await prisma.match.create({
      data: match,
    });
    createdMatches.push(created);
  }

  // Crear predicciones iniciales
  const predictionsData = [
    {
      matchIndex: 1,
      predictedHomeScore: 2,
      predictedAwayScore: 1,
    },
    {
      matchIndex: 2,
      predictedHomeScore: 3,
      predictedAwayScore: 1,
      predictedWinner: 'Argentina',
    },
    {
      matchIndex: 3,
      predictedHomeScore: 2,
      predictedAwayScore: 0,
      predictedWinner: 'Brasil',
    },
    {
      matchIndex: 4,
      predictedHomeScore: 2,
      predictedAwayScore: 1,
      predictedWinner: 'Alemania',
    },
    {
      matchIndex: 5,
      predictedHomeScore: 2,
      predictedAwayScore: 2,
      predictedHomePenalties: 4,
      predictedAwayPenalties: 3,
      predictedWinner: 'Francia',
    },
    {
      matchIndex: 6,
      predictedHomeScore: 1,
      predictedAwayScore: 0,
      predictedWinner: 'Portugal',
    },
    {
      matchIndex: 10,
      predictedHomeScore: 1,
      predictedAwayScore: 1,
      predictedHomePenalties: 4,
      predictedAwayPenalties: 3,
      predictedWinner: 'Argentina',
    },
  ];

  for (const pred of predictionsData) {
    const match = createdMatches[pred.matchIndex];
    if (match) {
      await prisma.prediction.create({
        data: {
          matchId: match.id,
          predictedHomeScore: pred.predictedHomeScore,
          predictedAwayScore: pred.predictedAwayScore,
          predictedHomePenalties: pred.predictedHomePenalties ?? null,
          predictedAwayPenalties: pred.predictedAwayPenalties ?? null,
          predictedWinner: pred.predictedWinner ?? null,
        },
      });
      await recalculateMatchScore(match.id);
    }
  }

  safeRevalidatePath('/');
  safeRevalidatePath('/predictions');
  safeRevalidatePath('/results');
  safeRevalidatePath('/scores');
  safeRevalidatePath('/settings');
}

// 10. Exportar todos los datos en formato JSON completo
export async function exportDataAction() {
  const matches = await prisma.match.findMany({
    include: {
      prediction: true,
      score: true,
    },
  });

  return JSON.stringify(matches, null, 2);
}

// 11. Acciones para la integración de API-Football
export async function syncTournamentAction(syncType: 'FULL' | 'DAILY' | 'LIVE' | 'MANUAL') {
  const result = await syncTournament(syncType);
  
  safeRevalidatePath('/');
  safeRevalidatePath('/predictions');
  safeRevalidatePath('/results');
  safeRevalidatePath('/scores');
  safeRevalidatePath('/settings');
  
  return result;
}

export async function getLastSyncLogAction() {
  return await prisma.syncLog.findFirst({
    orderBy: { startedAt: 'desc' }
  });
}

export async function isApiKeyConfiguredAction() {
  const providerType = process.env.FOOTBALL_PROVIDER || 'football-data';
  if (providerType === 'api-football') {
    return !!process.env.API_FOOTBALL_KEY;
  }
  return !!process.env.FOOTBALL_DATA_API_KEY;
}

export async function getActiveProviderAction() {
  const providerType = process.env.FOOTBALL_PROVIDER || 'football-data';
  return providerType === 'api-football' ? 'api-football' : 'football-data';
}

export async function compareExcelBackupAction() {
  try {
    const report = await compareDatabaseWithExcel();
    return {
      success: true,
      report,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Error al procesar el archivo Excel',
    };
  }
}

export async function importExcelBackupAction() {
  try {
    const result = await importExcelBackup();
    
    safeRevalidatePath('/');
    safeRevalidatePath('/predictions');
    safeRevalidatePath('/results');
    safeRevalidatePath('/scores');
    safeRevalidatePath('/settings');
    
    return {
      success: true,
      message: `Importación completada con éxito. Creados: ${result.createdCount}, Actualizados: ${result.updatedCount}`,
      ...result
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Error al importar datos desde Excel',
    };
  }
}

export async function previewPredictionImportAction(formData: FormData) {
  try {
    const file = formData.get('file') as File;
    if (!file) {
      return { success: false, message: 'No se seleccionó ningún archivo' };
    }

    if (file.size > 2 * 1024 * 1024) {
      return { success: false, message: 'El archivo excede el límite máximo de 2 MB' };
    }

    const filename = file.name.toLowerCase();
    if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
      return { success: false, message: 'Formato inválido. Solo se admiten archivos .xlsx o .xls' };
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const report = await previewPredictionImport(buffer);
    return {
      success: true,
      report,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Error al procesar la vista previa del archivo Excel',
    };
  }
}

export async function confirmPredictionImportAction(formData: FormData) {
  try {
    const file = formData.get('file') as File;
    if (!file) {
      return { success: false, message: 'No se seleccionó ningún archivo' };
    }

    if (file.size > 2 * 1024 * 1024) {
      return { success: false, message: 'El archivo excede el límite máximo de 2 MB' };
    }

    const filename = file.name.toLowerCase();
    if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
      return { success: false, message: 'Formato de archivo no admitido' };
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await confirmPredictionImport(buffer);

    safeRevalidatePath('/');
    safeRevalidatePath('/predictions');
    safeRevalidatePath('/results');
    safeRevalidatePath('/scores');
    safeRevalidatePath('/settings');

    return {
      success: true,
      message: result.message,
      result,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Error al confirmar la importación de predicciones',
    };
  }
}

