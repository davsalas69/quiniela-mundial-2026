import { prisma } from '@/lib/db';
import { Match, Prediction, Score } from '@prisma/client';
import Link from 'next/link';
import { 
  Award, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  ArrowRight,
  TrendingUp,
  Percent,
  Play
} from 'lucide-react';

export const revalidate = 0; // Disable caching to ensure fresh DB reads on navigations

export type MatchWithData = Match & {
  prediction: Prediction | null;
  score: Score | null;
};

export default async function DashboardPage() {
  const matches: MatchWithData[] = await prisma.match.findMany({
    include: {
      prediction: true,
      score: true,
    },
    orderBy: [
      { kickoffAt: 'asc' },
    ],
  });

  const totalMatches = matches.length;
  const predictedMatches = matches.filter((m: MatchWithData) => m.prediction !== null);
  const totalPredictionsCount = predictedMatches.length;

  const finishedMatches = matches.filter(
    (m: MatchWithData) => m.status === 'FINISHED' || m.status === 'MANUAL_PROJECTION'
  );
  const finishedCount = finishedMatches.length;

  const hasSimulatedResults = matches.some((m: MatchWithData) => m.resultSource === 'MANUAL_SIMULATION');

  let totalPoints = 0;
  let points8 = 0;
  let points6 = 0;
  let points5 = 0;
  let points4 = 0;
  let points1 = 0;
  let points0 = 0;

  for (const m of matches) {
    if (m.score) {
      totalPoints += m.score.points;
      switch (m.score.points) {
        case 8: points8++; break;
        case 6: points6++; break;
        case 5: points5++; break;
        case 4: points4++; break;
        case 1: points1++; break;
        case 0: points0++; break;
      }
    }
  }

  // Tasa de acierto de ganador o empate: puntos >= 4
  const successfulPredictionsCount = matches.filter(
    (m: MatchWithData) => m.score && m.score.points >= 4
  ).length;
  
  const accuracyRate = finishedCount > 0 
    ? Math.round((successfulPredictionsCount / finishedCount) * 100) 
    : 0;

  // Próximos partidos (máximo 4)
  const upcomingMatches = matches
    .filter((m: MatchWithData) => m.status === 'SCHEDULED')
    .slice(0, 4);

  // Últimos resultados (máximo 4)
  const recentMatches = [...finishedMatches]
    .reverse()
    .slice(0, 4);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Simulation Alert Banner */}
      {hasSimulatedResults && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center space-x-3 glow-warning animate-pulse">
          <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0" />
          <div className="text-sm font-medium">
            <span className="font-extrabold uppercase mr-2">[PROYECCIÓN ACTIVA]</span>
            Estás visualizando datos con resultados simulados. El total de puntos ({totalPoints}) refleja puntuaciones de partidos proyectados.
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div>
          <h2 className="text-3xl font-black tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
            DASHBOARD GENERAL
          </h2>
          <p className="text-zinc-400 text-sm font-medium">
            Resumen de tu desempeño y pronósticos para el Mundial 2026.
          </p>
        </div>
        
        <div className="flex space-x-3">
          <Link
            href="/predictions"
            className="px-5 py-2.5 rounded-lg bg-[#6d28d9] hover:bg-[#5b21b6] text-sm font-bold flex items-center space-x-2 transition-colors duration-200 shadow-lg shadow-[#6d28d9]/20"
          >
            <span>Pronosticar Partidos</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* KPI: Total Points */}
        <div className="p-6 rounded-2xl bg-[#0f0f15]/85 border border-[#1e1e24] flex flex-col justify-between hover:border-zinc-700 transition-all duration-300 shadow-md">
          <div className="flex justify-between items-start">
            <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider">
              Puntos Acumulados
            </span>
            <div className="p-2 bg-[#6d28d9]/10 rounded-lg text-[#a78bfa] border border-[#6d28d9]/20 glow-primary">
              <Award className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-4xl font-extrabold text-[#f4f4f5]">{totalPoints}</span>
            <span className="text-xs text-zinc-500 block mt-1">
              De partidos con resultados cargados
            </span>
          </div>
        </div>

        {/* KPI: Accuracy Rate */}
        <div className="p-6 rounded-2xl bg-[#0f0f15]/85 border border-[#1e1e24] flex flex-col justify-between hover:border-zinc-700 transition-all duration-300 shadow-md">
          <div className="flex justify-between items-start">
            <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider">
              Tasa de Acierto
            </span>
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400 border border-emerald-500/20 glow-accent">
              <Percent className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-4xl font-extrabold text-emerald-400">
              {accuracyRate}%
            </span>
            <span className="text-xs text-zinc-500 block mt-1">
              {successfulPredictionsCount} de {finishedCount} partidos resueltos (puntos ≥ 4)
            </span>
          </div>
        </div>

        {/* KPI: Predictions Completeness */}
        <div className="p-6 rounded-2xl bg-[#0f0f15]/85 border border-[#1e1e24] flex flex-col justify-between hover:border-zinc-700 transition-all duration-300 shadow-md">
          <div className="flex justify-between items-start">
            <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider">
              Predicciones
            </span>
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400 border border-blue-500/20">
              <CheckCircle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-4xl font-extrabold text-[#f4f4f5]">
              {totalPredictionsCount} <span className="text-lg text-zinc-500 font-normal">/ {totalMatches}</span>
            </span>
            {/* Progress bar */}
            <div className="w-full bg-[#1e1e24] rounded-full h-1.5 mt-2">
              <div 
                className="bg-[#6d28d9] h-1.5 rounded-full" 
                style={{ width: `${(totalPredictionsCount / totalMatches) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* KPI: Next Kickoff */}
        <div className="p-6 rounded-2xl bg-[#0f0f15]/85 border border-[#1e1e24] flex flex-col justify-between hover:border-zinc-700 transition-all duration-300 shadow-md">
          <div className="flex justify-between items-start">
            <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider">
              Partidos Resueltos
            </span>
            <div className="p-2 bg-zinc-500/10 rounded-lg text-zinc-400 border border-zinc-500/20">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-4xl font-extrabold text-[#f4f4f5]">
              {finishedCount} <span className="text-lg text-zinc-500 font-normal">/ {totalMatches}</span>
            </span>
            <span className="text-xs text-zinc-500 block mt-1">
              Resultados reales o simulados
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Breakdown & Play Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left: Points breakdown by Rule */}
        <div className="lg:col-span-1 p-6 rounded-2xl bg-[#0f0f15]/75 border border-[#1e1e24] space-y-6">
          <div>
            <h3 className="font-extrabold text-lg tracking-tight">Desglose de Puntos</h3>
            <p className="text-xs text-zinc-500 font-medium">Distribución por regla aplicada</p>
          </div>

          <div className="space-y-4">
            {/* 8 Points */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-purple-500/5 border border-purple-500/15">
              <div className="flex items-center space-x-3">
                <span className="px-2 py-1 text-xs font-black bg-purple-500/20 text-purple-400 rounded-md">8 pts</span>
                <span className="text-xs text-zinc-300 font-semibold">Empate + Penaltis exactos</span>
              </div>
              <span className="text-sm font-bold text-purple-400">{points8} veces</span>
            </div>

            {/* 6 Points */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
              <div className="flex items-center space-x-3">
                <span className="px-2 py-1 text-xs font-black bg-emerald-500/20 text-emerald-400 rounded-md">6 pts</span>
                <span className="text-xs text-zinc-300 font-semibold">Resultado exacto</span>
              </div>
              <span className="text-sm font-bold text-emerald-400">{points6} veces</span>
            </div>

            {/* 5 Points */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-teal-500/5 border border-teal-500/15">
              <div className="flex items-center space-x-3">
                <span className="px-2 py-1 text-xs font-black bg-teal-500/20 text-teal-400 rounded-md">5 pts</span>
                <span className="text-xs text-zinc-300 font-semibold">Ganador + Suma de goles</span>
              </div>
              <span className="text-sm font-bold text-teal-400">{points5} veces</span>
            </div>

            {/* 4 Points */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-blue-500/5 border border-blue-500/15">
              <div className="flex items-center space-x-3">
                <span className="px-2 py-1 text-xs font-black bg-blue-500/20 text-blue-400 rounded-md">4 pts</span>
                <span className="text-xs text-zinc-300 font-semibold">Solo ganador correcto</span>
              </div>
              <span className="text-sm font-bold text-blue-400">{points4} veces</span>
            </div>

            {/* 1 Point */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-500/5 border border-zinc-800">
              <div className="flex items-center space-x-3">
                <span className="px-2 py-1 text-xs font-black bg-zinc-500/10 text-zinc-400 rounded-md">1 pt</span>
                <span className="text-xs text-zinc-400 font-semibold">Solo sumatoria goles</span>
              </div>
              <span className="text-sm font-bold text-zinc-400">{points1} veces</span>
            </div>

            {/* 0 Points */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-rose-500/5 border border-rose-500/15">
              <div className="flex items-center space-x-3">
                <span className="px-2 py-1 text-xs font-black bg-rose-500/20 text-rose-400 rounded-md">0 pts</span>
                <span className="text-xs text-rose-400 font-semibold">Sin aciertos</span>
              </div>
              <span className="text-sm font-bold text-rose-400">{points0} veces</span>
            </div>
          </div>
        </div>

        {/* Right: Lists (Recent and Upcoming) */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* List: Recent Results */}
          <div className="p-6 rounded-2xl bg-[#0f0f15]/75 border border-[#1e1e24] flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-extrabold text-base tracking-tight">Últimos Resultados</h3>
                <Link href="/results" className="text-xs text-[#a78bfa] hover:underline font-bold">
                  Ver todos
                </Link>
              </div>

              {recentMatches.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-xs font-semibold">
                  No hay partidos finalizados todavía.
                </div>
              ) : (
                <div className="space-y-4">
                  {recentMatches.map((m) => (
                    <div 
                      key={m.id}
                      className="p-3 rounded-xl bg-[#13131a] border border-[#1e1e24] space-y-2"
                    >
                      <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase">
                        <span>{m.stage.replace('_', ' ')}</span>
                        {m.resultSource === 'MANUAL_SIMULATION' ? (
                          <span className="text-amber-500">[Simulado]</span>
                        ) : (
                          <span className="text-zinc-500">[Real]</span>
                        )}
                      </div>
                      
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-zinc-300 w-24 truncate">{m.homeTeam}</span>
                        <div className="px-2.5 py-0.5 rounded bg-zinc-800 text-white font-black">
                          {m.actualHomeScore} - {m.actualAwayScore}
                        </div>
                        <span className="font-bold text-zinc-300 w-24 text-right truncate">{m.awayTeam}</span>
                      </div>

                      <div className="flex justify-between items-center border-t border-[#1e1e24]/60 pt-2 text-[10px] text-zinc-400">
                        <span>Pred: <span className="font-bold">{m.prediction?.predictedHomeScore ?? '-'} - {m.prediction?.predictedAwayScore ?? '-'}</span></span>
                        <span className={`px-2 py-0.5 rounded-full font-black text-white ${
                          m.score?.points === 8 ? 'bg-purple-600' :
                          m.score?.points === 6 ? 'bg-emerald-600' :
                          m.score?.points === 5 ? 'bg-teal-600' :
                          m.score?.points === 4 ? 'bg-blue-600' :
                          m.score?.points === 1 ? 'bg-zinc-700' : 'bg-rose-950 text-rose-400'
                        }`}>
                          +{m.score?.points ?? 0} pts
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* List: Upcoming Matches */}
          <div className="p-6 rounded-2xl bg-[#0f0f15]/75 border border-[#1e1e24] flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-extrabold text-base tracking-tight">Próximos Partidos</h3>
                <Link href="/predictions" className="text-xs text-[#a78bfa] hover:underline font-bold">
                  Ver todos
                </Link>
              </div>

              {upcomingMatches.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-xs font-semibold">
                  No hay próximos partidos programados.
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingMatches.map((m) => (
                    <div 
                      key={m.id}
                      className="p-3 rounded-xl bg-[#13131a] border border-[#1e1e24] space-y-2 hover:border-[#6d28d9]/40 transition-colors duration-200"
                    >
                      <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase">
                        <span>{m.stage.replace('_', ' ')}</span>
                        <span>
                          {m.kickoffAt 
                            ? new Date(m.kickoffAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
                            : 'Fecha pendiente'
                          }
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-zinc-300 w-24 truncate">{m.homeTeam}</span>
                        <div className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-500 font-semibold text-[10px]">
                          VS
                        </div>
                        <span className="font-bold text-zinc-300 w-24 text-right truncate">{m.awayTeam}</span>
                      </div>

                      <div className="flex justify-between items-center border-t border-[#1e1e24]/60 pt-2 text-[10px] text-zinc-400">
                        {m.prediction ? (
                          <span className="text-emerald-400 font-bold">
                            Tu predicción: {m.prediction.predictedHomeScore} - {m.prediction.predictedAwayScore}
                          </span>
                        ) : (
                          <span className="text-amber-500 font-bold flex items-center space-x-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span>Falta pronóstico</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
