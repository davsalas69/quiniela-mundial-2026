import React from 'react';
import { getLeaderboardData } from '@/lib/leaderboard';
import { getCurrentUser } from '@/lib/auth';
import { Trophy, ShieldAlert, Award, FileSpreadsheet, Eye } from 'lucide-react';
import Link from 'next/link';

export const revalidate = 0; // Disable static caching for real-time scores

export default async function LeaderboardPage() {
  const user = await getCurrentUser();
  const players = await getLeaderboardData();

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1e1b4b]/40 to-[#311042]/30 border border-[#2e2667]/40 p-6 md:p-8 backdrop-blur-md">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#6d28d9]/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3.5 bg-[#6d28d9]/20 rounded-2xl text-[#a78bfa] border border-[#6d28d9]/30 shadow-lg shadow-[#6d28d9]/10">
              <Trophy className="h-8 w-8 animate-pulse text-[#fbbf24]" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white uppercase">
                Tabla de posiciones
              </h1>
              <p className="text-sm text-zinc-400 font-medium mt-1">
                Clasificación general en tiempo real de todos los participantes.
              </p>
            </div>
          </div>
          {user && user.role === 'ADMIN' && (
            <Link
              href="/leaderboard/admin"
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 text-amber-400 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 shadow-md cursor-pointer"
            >
              <ShieldAlert className="h-4 w-4" />
              <span>Vista Admin Detallada</span>
            </Link>
          )}
        </div>
      </div>

      {/* Rules Notice */}
      <div className="p-4 rounded-xl bg-[#14141d]/80 border border-[#272737] text-zinc-400 text-xs leading-relaxed space-y-2">
        <p className="font-extrabold text-white uppercase tracking-wider text-[10px] flex items-center gap-1.5 text-indigo-400">
          <Award className="h-3.5 w-3.5" />
          Reglas de desempate en la clasificación:
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          <li><strong>Puntos Totales:</strong> Mayor puntuación acumulada.</li>
          <li><strong>Marcadores Exactos:</strong> Cantidad de aciertos exactos de marcador (incluye 6 pts en grupos o final, y 8 pts por empate + penales exactos).</li>
          <li><strong>Tendencia + Goles:</strong> Cantidad de aciertos de ganador/empate + sumatoria de goles exacta (5 pts).</li>
          <li><strong>Tendencia:</strong> Cantidad de aciertos únicamente de ganador/empate (4 pts).</li>
          <li><strong>Pronósticos Válidos:</strong> Mayor cantidad de predicciones completadas (con marcador).</li>
          <li><strong>Fecha de Registro:</strong> Antigüedad de registro en la plataforma (en orden cronológico ascendente).</li>
        </ol>
      </div>

      {/* Leaderboard Table Container */}
      <div className="bg-[#0f0f15]/80 border border-[#1e1e24] rounded-2xl overflow-hidden backdrop-blur-md shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#21212c] bg-[#13131a]/60 text-zinc-500 font-extrabold uppercase text-[10px] tracking-wider">
                <th className="py-4 px-6 text-center w-16">Pos</th>
                <th className="py-4 px-6">Jugador</th>
                <th className="py-4 px-6 text-center">Puntos</th>
                <th className="py-4 px-6 text-center">Exactos</th>
                <th className="py-4 px-6 text-center">Partidos Puntuados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e24]/60">
              {players.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-500 font-bold text-sm">
                    No hay jugadores registrados todavía.
                  </td>
                </tr>
              ) : (
                players.map((p, idx) => {
                  const isCurrentUser = user && user.id === p.id;
                  let posBadge = '';
                  let posClass = 'text-zinc-400';
                  
                  if (p.position === 1) {
                    posBadge = 'bg-amber-500/20 text-amber-400 border-amber-500/40 glow-amber';
                    posClass = 'text-amber-400 font-black';
                  } else if (p.position === 2) {
                    posBadge = 'bg-zinc-400/20 text-zinc-300 border-zinc-400/40';
                    posClass = 'text-zinc-300 font-black';
                  } else if (p.position === 3) {
                    posBadge = 'bg-[#b45309]/20 text-[#fb923c] border-[#b45309]/40';
                    posClass = 'text-[#fb923c] font-black';
                  }

                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors duration-150 ${
                        isCurrentUser
                          ? 'bg-[#6d28d9]/5 hover:bg-[#6d28d9]/10'
                          : 'hover:bg-[#151520]/40'
                      }`}
                    >
                      <td className="py-4.5 px-6 text-center">
                        {posBadge ? (
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border text-xs font-black ${posBadge}`}>
                            {p.position}
                          </span>
                        ) : (
                          <span className={`text-sm font-extrabold ${posClass}`}>
                            {p.position}
                          </span>
                        )}
                      </td>
                      <td className="py-4.5 px-6">
                        <div className="flex items-center space-x-2">
                          <span className={`text-sm font-bold ${isCurrentUser ? 'text-[#a78bfa]' : 'text-white'}`}>
                            {isCurrentUser ? `@${p.username} (Tú)` : `@${p.username}`}
                          </span>
                          {!p.isActive && (
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                              Inactivo
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4.5 px-6 text-center">
                        <span className="text-base font-black text-emerald-400">
                          {p.totalPoints}
                        </span>
                      </td>
                      <td className="py-4.5 px-6 text-center">
                        <span className="text-sm font-bold text-zinc-300">
                          {p.exacts}
                        </span>
                      </td>
                      <td className="py-4.5 px-6 text-center">
                        <span className="text-sm font-medium text-zinc-400">
                          {p.scoredCount}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
