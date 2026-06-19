import React from 'react';
import { requireAdmin } from '@/lib/auth';
import { getLeaderboardData } from '@/lib/leaderboard';
import { prisma } from '@/lib/db';
import { calculateMatchScore } from '@/lib/scoring';
import { ArrowLeft, Award, Calendar, CheckCircle2, ShieldAlert, Trophy, ShieldCheck, PenTool } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const revalidate = 0; // Disable static caching for real-time player detail

interface PageProps {
  params: Promise<{
    userId: string;
  }>;
}

export default async function PlayerDetailPage({ params }: PageProps) {
  // 1. Authorization
  await requireAdmin();

  // 2. Resolve userId param
  const resolvedParams = await params;
  const userId = resolvedParams.userId;

  // 3. Find the user in database
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!targetUser) {
    return notFound();
  }

  // 4. Get player position and overall stats from leaderboard data
  const players = await getLeaderboardData();
  const playerStats = players.find((p) => p.id === userId);

  // 5. Fetch matches, predictions and scores for this user
  const matches = await prisma.match.findMany({
    orderBy: [
      { stage: 'asc' },
      { kickoffAt: 'asc' },
    ],
  });

  const predictions = await prisma.prediction.findMany({
    where: { userId },
  });

  const scores = await prisma.score.findMany({
    where: { userId },
  });

  // Group matches by Stage for cleaner UI
  const stagesMap: Record<string, string> = {
    'GROUP_STAGE': 'Fase de Grupos',
    'ROUND_OF_32': 'Dieciseisavos de Final',
    'ROUND_OF_16': 'Octavos de Final',
    'QUARTER_FINALS': 'Cuartos de Final',
    'SEMI_FINALS': 'Semifinales',
    'THIRD_PLACE': 'Tercer Puesto',
    'FINAL': 'Gran Final',
  };

  const getStageName = (stage: string) => stagesMap[stage] || stage;

  return (
    <div className="space-y-6">
      {/* Top Navigation / Breadcrumb */}
      <div>
        <Link
          href="/players"
          className="inline-flex items-center space-x-1.5 text-xs font-extrabold text-zinc-400 hover:text-white uppercase tracking-wider transition-colors group"
        >
          <ArrowLeft className="h-4.5 w-4.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Volver a Jugadores</span>
        </Link>
      </div>

      {/* Profile Header Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#12121c] to-[#1e152e] border border-[#232338] p-6 md:p-8 backdrop-blur-md">
        <div className="absolute top-0 right-0 w-72 h-72 bg-[#6d28d9]/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center space-x-4">
            <div className="p-4 bg-[#6d28d9]/20 rounded-2xl text-[#a78bfa] border border-[#6d28d9]/30">
              <Trophy className="h-10 w-10 text-[#a78bfa] animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white uppercase">
                  @{targetUser.username}
                </h1>
                {targetUser.isActive ? (
                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Activo
                  </span>
                ) : (
                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1">
                    <ShieldAlert className="h-3 w-3" />
                    Inactivo
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 font-bold mt-1.5">
                Registrado el {targetUser.createdAt.toLocaleDateString('es-ES')}
              </p>
            </div>
          </div>

          {/* Stats summary badge */}
          {playerStats && (
            <div className="flex items-center gap-4 bg-[#141420]/80 border border-[#212135] rounded-xl p-4">
              <div className="text-center px-2">
                <p className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-wider">Puntos Totales</p>
                <p className="text-2xl font-black text-emerald-400 mt-0.5">{playerStats.totalPoints}</p>
              </div>
              <div className="w-px h-8 bg-zinc-800"></div>
              <div className="text-center px-2">
                <p className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-wider">Clasificación</p>
                <p className="text-2xl font-black text-white mt-0.5">#{playerStats.position}</p>
              </div>
              <div className="w-px h-8 bg-zinc-800"></div>
              <div className="text-center px-2">
                <p className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-wider">Aciertos Exactos</p>
                <p className="text-2xl font-black text-amber-400 mt-0.5">{playerStats.exacts}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Match list with predictions */}
      <div className="space-y-8">
        {Object.keys(stagesMap).map((stageKey) => {
          const stageMatches = matches.filter((m) => m.stage === stageKey);
          if (stageMatches.length === 0) return null;

          return (
            <div key={stageKey} className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400 pl-1 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#a78bfa]" />
                {getStageName(stageKey)}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {stageMatches.map((m) => {
                  const pred = predictions.find((p) => p.matchId === m.id);
                  const score = scores.find((s) => s.matchId === m.id);

                  let pointsDisplay = 'Pendiente';
                  let reasonDisplay = 'Sin predicción';
                  let pointsColor = 'text-zinc-500';
                  let bgCardClass = 'bg-[#0f0f15]/60 border-[#1e1e24]';

                  const isFinished = m.status === 'FINISHED' || m.status === 'MANUAL_PROJECTION';

                  if (isFinished) {
                    if (pred) {
                      const finalScore = score || calculateMatchScore(pred, m);
                      pointsDisplay = `${finalScore.points} pts`;
                      reasonDisplay = finalScore.reason;
                      
                      if (finalScore.points >= 6) {
                        pointsColor = 'text-amber-400';
                        bgCardClass = 'bg-[#fbbf24]/5 border-[#fbbf24]/20';
                      } else if (finalScore.points >= 4) {
                        pointsColor = 'text-indigo-400';
                        bgCardClass = 'bg-[#6d28d9]/5 border-[#6d28d9]/20';
                      } else if (finalScore.points >= 1) {
                        pointsColor = 'text-blue-400';
                        bgCardClass = 'bg-blue-500/[0.02] border-blue-500/15';
                      } else {
                        pointsColor = 'text-red-400';
                        bgCardClass = 'bg-red-500/[0.01] border-red-500/15';
                      }
                    } else {
                      pointsDisplay = '0 pts';
                      reasonDisplay = 'Sin predicción';
                      pointsColor = 'text-zinc-600';
                    }
                  } else {
                    if (pred) {
                      pointsDisplay = 'Guardado';
                      reasonDisplay = 'Predicción enviada';
                      pointsColor = 'text-emerald-400';
                    }
                  }

                  return (
                    <div
                      key={m.id}
                      className={`p-4.5 rounded-xl border backdrop-blur-md flex flex-col justify-between gap-3 transition-all duration-200 ${bgCardClass}`}
                    >
                      {/* Teams & Score */}
                      <div className="flex items-center justify-between">
                        <div className="space-y-1.5 flex-1">
                          {/* Home Team */}
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-extrabold text-white">{m.homeTeam}</span>
                            {isFinished && (
                              <span className="text-xs font-black text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                                {m.actualHomeScore}
                              </span>
                            )}
                          </div>
                          {/* Away Team */}
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-extrabold text-white">{m.awayTeam}</span>
                            {isFinished && (
                              <span className="text-xs font-black text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                                {m.actualAwayScore}
                              </span>
                            )}
                          </div>
                          {/* Penalties display if final and draw */}
                          {isFinished && m.actualWinner && (
                            <p className="text-[10px] text-zinc-500 font-semibold italic">
                              Ganador: {m.actualWinner} {m.actualHomePenalties !== null && `(Pen: ${m.actualHomePenalties}-${m.actualAwayPenalties})`}
                            </p>
                          )}
                        </div>

                        {/* Point Badge */}
                        <div className="text-right flex flex-col items-end shrink-0 pl-4">
                          <span className={`text-base font-black tracking-tight ${pointsColor}`}>
                            {pointsDisplay}
                          </span>
                          <span className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-500 mt-1 block">
                            Puntaje
                          </span>
                        </div>
                      </div>

                      {/* Prediction and outcome category breakdown */}
                      <div className="pt-3 border-t border-zinc-800/40 flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-1.5 text-zinc-400">
                          <PenTool className="h-3.5 w-3.5 text-zinc-500" />
                          <span>Predicción: </span>
                          {pred ? (
                            <strong className="text-zinc-200">
                              {pred.predictedHomeScore} - {pred.predictedAwayScore}
                              {pred.predictedWinner && ` (Gana: ${pred.predictedWinner}${pred.predictedHomePenalties !== null ? `, Pen: ${pred.predictedHomePenalties}-${pred.predictedAwayPenalties}` : ''})`}
                            </strong>
                          ) : (
                            <span className="text-zinc-600 italic">Ninguna</span>
                          )}
                        </div>

                        <div className="flex items-center space-x-1 text-zinc-500">
                          <span className="text-[10px] font-bold bg-[#13131d] px-2 py-1 rounded-md border border-zinc-800 text-zinc-400">
                            {reasonDisplay}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
