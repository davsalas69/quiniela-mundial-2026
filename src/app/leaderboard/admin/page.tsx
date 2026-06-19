import React from 'react';
import { getLeaderboardData } from '@/lib/leaderboard';
import { requireAdmin } from '@/lib/auth';
import { Trophy, ShieldAlert, Award, FileSpreadsheet, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import ExportCSVButton from './ExportCSVButton';

export const revalidate = 0; // Disable static caching for real-time scores

export default async function AdminLeaderboardPage() {
  await requireAdmin();
  const players = await getLeaderboardData();

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1e1b4b]/40 to-[#311042]/30 border border-[#2e2667]/40 p-6 md:p-8 backdrop-blur-md">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#6d28d9]/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3.5 bg-amber-500/10 rounded-2xl text-amber-400 border border-amber-500/30 shadow-lg shadow-amber-500/5">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href="/leaderboard"
                  className="text-xs font-bold text-zinc-400 hover:text-white flex items-center gap-1 group transition-colors"
                >
                  <ArrowLeft className="h-3 w-3 group-hover:-translate-x-0.5 transition-transform" />
                  Volver a tabla pública
                </Link>
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white uppercase mt-1">
                Ranking Detallado (Admin)
              </h1>
              <p className="text-sm text-zinc-400 font-medium">
                Panel administrativo de clasificación general y criterios de desempate.
              </p>
            </div>
          </div>
          <ExportCSVButton />
        </div>
      </div>

      {/* Leaderboard Table Container */}
      <div className="bg-[#0f0f15]/80 border border-[#1e1e24] rounded-2xl overflow-hidden backdrop-blur-md shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="border-b border-[#21212c] bg-[#13131a]/60 text-zinc-500 font-extrabold uppercase text-[9px] tracking-wider">
                <th className="py-4 px-4 text-center w-14">Pos</th>
                <th className="py-4 px-4">Jugador</th>
                <th className="py-4 px-4 text-center">Estado</th>
                <th className="py-4 px-4 text-center text-emerald-400 bg-emerald-500/5">Puntos</th>
                <th className="py-4 px-4 text-center">Exactos (Totales)</th>
                <th className="py-4 px-4 text-center text-amber-400">Exactos Penales (8p)</th>
                <th className="py-4 px-4 text-center">Tend + Tot (5p)</th>
                <th className="py-4 px-4 text-center">Tend (4p)</th>
                <th className="py-4 px-4 text-center">Goles (1p)</th>
                <th className="py-4 px-4 text-center">Pred. Válidas</th>
                <th className="py-4 px-4 text-center">Puntuados</th>
                <th className="py-4 px-4 text-center">Pendientes</th>
                <th className="py-4 px-4 text-center">Fecha Registro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e24]/60">
              {players.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-zinc-500 font-bold text-sm">
                    No hay jugadores registrados todavía.
                  </td>
                </tr>
              ) : (
                players.map((p) => {
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
                      className="hover:bg-[#151520]/40 transition-colors duration-150"
                    >
                      <td className="py-4.5 px-4 text-center">
                        {posBadge ? (
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-[10px] font-black ${posBadge}`}>
                            {p.position}
                          </span>
                        ) : (
                          <span className={`text-xs font-extrabold ${posClass}`}>
                            {p.position}
                          </span>
                        )}
                      </td>
                      <td className="py-4.5 px-4">
                        <Link
                          href={`/players/${p.id}`}
                          className="text-xs font-bold text-white hover:text-[#a78bfa] underline decoration-zinc-700 hover:decoration-[#a78bfa] transition-colors"
                        >
                          @{p.username}
                        </Link>
                      </td>
                      <td className="py-4.5 px-4 text-center">
                        {p.isActive ? (
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Activo
                          </span>
                        ) : (
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                            Inactivo
                          </span>
                        )}
                      </td>
                      <td className="py-4.5 px-4 text-center font-black text-emerald-400 bg-emerald-500/[0.02]">
                        {p.totalPoints}
                      </td>
                      <td className="py-4.5 px-4 text-center text-xs font-bold text-zinc-200">
                        {p.exacts}
                      </td>
                      <td className="py-4.5 px-4 text-center text-xs font-bold text-amber-400">
                        {p.exactPenalties}
                      </td>
                      <td className="py-4.5 px-4 text-center text-xs font-semibold text-zinc-400">
                        {p.tendencyPlusTotal}
                      </td>
                      <td className="py-4.5 px-4 text-center text-xs font-semibold text-zinc-400">
                        {p.tendency}
                      </td>
                      <td className="py-4.5 px-4 text-center text-xs font-semibold text-zinc-400">
                        {p.totalGoals}
                      </td>
                      <td className="py-4.5 px-4 text-center text-xs font-semibold text-zinc-400">
                        {p.validPredictionsCount}
                      </td>
                      <td className="py-4.5 px-4 text-center text-xs font-semibold text-zinc-400">
                        {p.scoredCount}
                      </td>
                      <td className="py-4.5 px-4 text-center text-xs font-semibold text-zinc-400">
                        {p.pendingCount}
                      </td>
                      <td className="py-4.5 px-4 text-center text-[10px] font-medium text-zinc-500">
                        {p.createdAt.toISOString().split('T')[0]}
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
