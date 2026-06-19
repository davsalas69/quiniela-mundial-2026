import React from 'react';
import { requireAdmin, getCurrentUser } from '@/lib/auth';
import { getLeaderboardData } from '@/lib/leaderboard';
import { Users, Info, ShieldAlert, FileSpreadsheet, Eye, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import Link from 'next/link';
import PlayersFilters from './PlayersFilters';
import PlayerRowActions from './PlayerRowActions';

export const revalidate = 0; // Disable static caching for real-time dashboard

interface PageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    sort?: string;
    page?: string;
  }>;
}

export default async function PlayersAdminPage({ searchParams }: PageProps) {
  // 1. Authorization
  const currentAdmin = await requireAdmin();
  
  // 2. Fetch all player stats (no N+1 queries)
  const players = await getLeaderboardData();

  // 3. Resolve search, filter, and sort params
  const resolvedParams = await searchParams;
  const searchStr = (resolvedParams.search || '').trim().toLowerCase();
  const statusFilter = resolvedParams.status || 'all';
  const sortVal = resolvedParams.sort || 'position';
  const currentPage = parseInt(resolvedParams.page || '1', 10) || 1;

  // 4. Apply Filters
  let filtered = [...players];

  if (searchStr) {
    filtered = filtered.filter((p) => p.username.toLowerCase().includes(searchStr));
  }

  if (statusFilter === 'active') {
    filtered = filtered.filter((p) => p.isActive);
  } else if (statusFilter === 'inactive') {
    filtered = filtered.filter((p) => !p.isActive);
  }

  // 5. Apply Sorting
  if (sortVal === 'name') {
    filtered.sort((a, b) => a.username.localeCompare(b.username));
  } else if (sortVal === 'points') {
    filtered.sort((a, b) => b.totalPoints - a.totalPoints);
  } else if (sortVal === 'createdAt') {
    filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } else {
    // default: position (sorted by ranking)
    filtered.sort((a, b) => a.position - b.position);
  }

  // 6. Apply Pagination
  const totalCount = filtered.length;
  const pageSize = 25;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const pageIndex = Math.max(1, Math.min(currentPage, totalPages));
  const paginatedPlayers = filtered.slice((pageIndex - 1) * pageSize, pageIndex * pageSize);

  // Helper for generating page links
  const getPageUrl = (pageNum: number) => {
    const params = new URLSearchParams();
    if (searchStr) params.set('search', searchStr);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (sortVal !== 'position') params.set('sort', sortVal);
    params.set('page', pageNum.toString());
    return `/players?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#12121e]/80 to-[#1e142b]/60 border border-[#212133] p-6 md:p-8 backdrop-blur-md">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#6d28d9]/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3.5 bg-[#6d28d9]/20 rounded-2xl text-[#a78bfa] border border-[#6d28d9]/30 shadow-lg shadow-[#6d28d9]/10">
              <Users className="h-8 w-8 text-[#a78bfa]" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white uppercase">
                Gestión de Jugadores
              </h1>
              <p className="text-sm text-zinc-400 font-medium mt-1">
                Panel administrativo para controlar usuarios, estados de cuenta y códigos de acceso.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search Component */}
      <PlayersFilters />

      {/* Main Players Table */}
      <div className="bg-[#0f0f15]/80 border border-[#1e1e24] rounded-2xl overflow-hidden backdrop-blur-md shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-[#21212c] bg-[#13131a]/60 text-zinc-500 font-extrabold uppercase text-[10px] tracking-wider">
                <th className="py-4 px-6 text-center w-14">Pos</th>
                <th className="py-4 px-6">Jugador</th>
                <th className="py-4 px-6 text-center">Estado</th>
                <th className="py-4 px-6 text-center">Puntos</th>
                <th className="py-4 px-6 text-center">Predicciones (Partidos)</th>
                <th className="py-4 px-6 text-center">Último Inicio de Sesión</th>
                <th className="py-4 px-6 text-center">Fecha Registro</th>
                <th className="py-4 px-6 text-center w-40">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e24]/60">
              {paginatedPlayers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-500 font-bold text-sm">
                    No se encontraron jugadores que coincidan con los filtros.
                  </td>
                </tr>
              ) : (
                paginatedPlayers.map((p) => {
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-[#151520]/40 transition-colors duration-150"
                    >
                      {/* Position */}
                      <td className="py-4 px-6 text-center text-sm font-extrabold text-zinc-400">
                        #{p.position}
                      </td>

                      {/* Username */}
                      <td className="py-4 px-6">
                        <div className="font-bold text-white">
                          @{p.username}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-6 text-center">
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

                      {/* Points */}
                      <td className="py-4 px-6 text-center font-black text-emerald-400">
                        {p.totalPoints} pts
                      </td>

                      {/* Preds count */}
                      <td className="py-4 px-6 text-center text-xs font-semibold text-zinc-300">
                        <span className="text-[#a78bfa]" title="Válidas">{p.validPredictionsCount} val</span>
                        <span className="text-zinc-500 mx-1">/</span>
                        <span className="text-zinc-400" title="Puntuados">{p.scoredCount} punt</span>
                        <span className="text-zinc-500 mx-1">/</span>
                        <span className="text-zinc-400" title="Pendientes">{p.pendingCount} pend</span>
                      </td>

                      {/* Last Login */}
                      <td className="py-4 px-6 text-center text-xs font-semibold text-zinc-400">
                        {p.lastLoginAt ? (
                          p.lastLoginAt.toLocaleString('es-ES', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        ) : (
                          <span className="text-zinc-600 italic">Sin información</span>
                        )}
                      </td>

                      {/* Registration Date */}
                      <td className="py-4 px-6 text-center text-xs font-semibold text-zinc-500">
                        {p.createdAt.toISOString().split('T')[0]}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6">
                        <div className="flex items-center space-x-2.5">
                          {/* Ver Quiniela */}
                          <Link
                            href={`/players/${p.id}`}
                            className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 hover:border-indigo-500/40 text-indigo-400 rounded-lg text-xs font-bold transition-all cursor-pointer"
                            title="Ver quiniela individual"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Ver Quiniela</span>
                          </Link>

                          {/* Row Actions Client component */}
                          <PlayerRowActions player={p} currentUserId={currentAdmin.id} />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info/tooltip disclosures */}
        <div className="p-4 border-t border-[#1e1e24]/60 bg-[#12121a]/30 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <div className="flex items-center gap-1.5 leading-normal">
            <Info className="h-3.5 w-3.5 text-[#a78bfa] shrink-0" />
            <span>
              <strong>Nota Técnica:</strong> El "Último inicio de sesión" se calcula a partir del momento de creación de la sesión más reciente. Para un rastreo persistente y preciso, se recomienda añadir una columna dedicada <code>lastLoginAt</code> en el modelo <code>User</code>.
            </span>
          </div>
        </div>
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-zinc-500">
            Mostrando página <strong>{pageIndex}</strong> de <strong>{totalPages}</strong> ({totalCount} jugadores en total)
          </p>
          <div className="flex items-center space-x-2">
            <Link
              href={getPageUrl(pageIndex - 1)}
              className={`p-2 rounded-lg border text-zinc-400 transition-all ${
                pageIndex <= 1
                  ? 'opacity-40 pointer-events-none bg-zinc-900 border-zinc-800 text-zinc-600'
                  : 'bg-zinc-850 hover:bg-zinc-800 border-zinc-700 hover:text-white'
              }`}
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            {Array.from({ length: totalPages }).map((_, idx) => {
              const pageNum = idx + 1;
              const isCurrent = pageNum === pageIndex;
              return (
                <Link
                  key={pageNum}
                  href={getPageUrl(pageNum)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    isCurrent
                      ? 'bg-[#6d28d9] border-[#6d28d9] text-white shadow-md shadow-[#6d28d9]/10'
                      : 'bg-zinc-850 hover:bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                  }`}
                >
                  {pageNum}
                </Link>
              );
            })}
            <Link
              href={getPageUrl(pageIndex + 1)}
              className={`p-2 rounded-lg border text-zinc-400 transition-all ${
                pageIndex >= totalPages
                  ? 'opacity-40 pointer-events-none bg-zinc-900 border-zinc-800 text-zinc-600'
                  : 'bg-zinc-850 hover:bg-zinc-800 border-zinc-700 hover:text-white'
              }`}
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
