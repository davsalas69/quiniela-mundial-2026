import { prisma } from './db';

export interface PlayerStats {
  id: string;
  username: string;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  totalPoints: number;
  exactNormal: number;
  exactPenalties: number;
  exacts: number;
  tendencyPlusTotal: number;
  tendency: number;
  totalGoals: number;
  scoredCount: number;
  pendingCount: number;
  validPredictionsCount: number;
  position: number;
}

/**
 * Sorts players based on the tie-breaker rules:
 * 1. total points descending
 * 2. exacts descending (6 points + 8 points)
 * 3. tendency + total descending (5 points)
 * 4. tendency descending (4 points)
 * 5. valid predictions descending
 * 6. createdAt ascending
 */
export function sortPlayers(a: PlayerStats, b: PlayerStats): number {
  if (b.totalPoints !== a.totalPoints) {
    return b.totalPoints - a.totalPoints;
  }
  if (b.exacts !== a.exacts) {
    return b.exacts - a.exacts;
  }
  if (b.tendencyPlusTotal !== a.tendencyPlusTotal) {
    return b.tendencyPlusTotal - a.tendencyPlusTotal;
  }
  if (b.tendency !== a.tendency) {
    return b.tendency - a.tendency;
  }
  if (b.validPredictionsCount !== a.validPredictionsCount) {
    return b.validPredictionsCount - a.validPredictionsCount;
  }
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

/**
 * Fetches all users (role === 'USER') and calculates their stats in a single pass to avoid N+1 queries.
 */
export async function getLeaderboardData(): Promise<PlayerStats[]> {
  const matches = await prisma.match.findMany({
    select: { id: true, status: true },
  });
  
  const finishedMatchIds = new Set(
    matches
      .filter((m) => m.status === 'FINISHED' || m.status === 'MANUAL_PROJECTION')
      .map((m) => m.id)
  );

  const users = await prisma.user.findMany({
    where: { role: 'USER' },
    select: {
      id: true,
      username: true,
      isActive: true,
      createdAt: true,
    },
  });

  const predictions = await prisma.prediction.findMany({
    select: {
      userId: true,
      matchId: true,
      predictedHomeScore: true,
      predictedAwayScore: true,
    },
  });

  const scores = await prisma.score.findMany({
    select: {
      userId: true,
      matchId: true,
      points: true,
    },
  });

  const sessions = await prisma.session.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      userId: true,
      createdAt: true,
    },
  });

  // Group predictions by user
  const predictionsByUser = new Map<string, typeof predictions>();
  for (const p of predictions) {
    if (p.userId) {
      if (!predictionsByUser.has(p.userId)) {
        predictionsByUser.set(p.userId, []);
      }
      predictionsByUser.get(p.userId)!.push(p);
    }
  }

  // Group scores by user
  const scoresByUser = new Map<string, typeof scores>();
  for (const s of scores) {
    if (s.userId) {
      if (!scoresByUser.has(s.userId)) {
        scoresByUser.set(s.userId, []);
      }
      scoresByUser.get(s.userId)!.push(s);
    }
  }

  // Find latest session per user
  const latestSessionByUser = new Map<string, Date>();
  for (const sess of sessions) {
    if (!latestSessionByUser.has(sess.userId)) {
      latestSessionByUser.set(sess.userId, sess.createdAt);
    }
  }

  // Calculate statistics for each user
  const players: PlayerStats[] = users.map((user) => {
    const userPredictions = predictionsByUser.get(user.id) || [];
    const userScores = scoresByUser.get(user.id) || [];

    let totalPoints = 0;
    let exactNormal = 0;
    let exactPenalties = 0;
    let tendencyPlusTotal = 0;
    let tendency = 0;
    let totalGoals = 0;

    for (const s of userScores) {
      totalPoints += s.points;
      if (s.points === 8) {
        exactPenalties++;
      } else if (s.points === 6) {
        exactNormal++;
      } else if (s.points === 5) {
        tendencyPlusTotal++;
      } else if (s.points === 4) {
        tendency++;
      } else if (s.points === 1) {
        totalGoals++;
      }
    }

    const exacts = exactNormal + exactPenalties;
    const validPredictionsCount = userPredictions.filter(
      (p) => p.predictedHomeScore !== null && p.predictedAwayScore !== null
    ).length;
    
    const scoredCount = userScores.length;
    const pendingCount = userPredictions.filter(
      (p) => !finishedMatchIds.has(p.matchId)
    ).length;

    const lastLoginAt = latestSessionByUser.get(user.id) || null;

    return {
      id: user.id,
      username: user.username,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLoginAt,
      totalPoints,
      exactNormal,
      exactPenalties,
      exacts,
      tendencyPlusTotal,
      tendency,
      totalGoals,
      scoredCount,
      pendingCount,
      validPredictionsCount,
      position: 0, // Assigned after sorting
    };
  });

  // Sort and assign positions (including ties)
  players.sort(sortPlayers);

  // Assign ranking position
  let currentPos = 1;
  for (let i = 0; i < players.length; i++) {
    if (i > 0 && sortPlayers(players[i], players[i - 1]) === 0) {
      // If tied with previous, copy its position
      players[i].position = players[i - 1].position;
    } else {
      players[i].position = currentPos;
    }
    currentPos++;
  }

  return players;
}
