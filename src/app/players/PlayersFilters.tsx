'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, Loader2 } from 'lucide-react';

export default function PlayersFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [status, setStatus] = useState(searchParams.get('status') || 'all');
  const [sort, setSort] = useState(searchParams.get('sort') || 'position');

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      updateUrl(search, status, sort);
    }, 400);

    return () => clearTimeout(handler);
  }, [search]);

  const updateUrl = (searchVal: string, statusVal: string, sortVal: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', '1'); // Reset to page 1 on filter change

    if (searchVal) {
      params.set('search', searchVal);
    } else {
      params.delete('search');
    }

    if (statusVal && statusVal !== 'all') {
      params.set('status', statusVal);
    } else {
      params.delete('status');
    }

    if (sortVal && sortVal !== 'position') {
      params.set('sort', sortVal);
    } else {
      params.delete('sort');
    }

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setStatus(val);
    updateUrl(search, val, sort);
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSort(val);
    updateUrl(search, status, val);
  };

  return (
    <div className="bg-[#101017]/80 border border-[#1e1e26] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-wider text-[#a78bfa] flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Filtros y Búsqueda
        </h3>
        {isPending && (
          <div className="flex items-center space-x-1.5 text-zinc-500 text-xs font-semibold">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Actualizando...</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Search */}
        <div className="relative">
          <label className="block text-[10px] font-extrabold uppercase text-zinc-500 tracking-wider mb-1.5">
            Buscar jugador
          </label>
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Escribe un nombre de usuario..."
              className="w-full bg-[#161622] border border-[#272737] rounded-xl pl-9.5 pr-4 py-2.5 text-xs font-bold text-white placeholder-zinc-500 focus:outline-none focus:border-[#6d28d9] transition-colors"
            />
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
          </div>
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-[10px] font-extrabold uppercase text-zinc-500 tracking-wider mb-1.5">
            Estado de cuenta
          </label>
          <select
            value={status}
            onChange={handleStatusChange}
            className="w-full bg-[#161622] border border-[#272737] rounded-xl px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-[#6d28d9] transition-colors cursor-pointer"
          >
            <option value="all">Todos los jugadores</option>
            <option value="active">Solo Activos</option>
            <option value="inactive">Solo Inactivos</option>
          </select>
        </div>

        {/* Sort */}
        <div>
          <label className="block text-[10px] font-extrabold uppercase text-zinc-500 tracking-wider mb-1.5">
            Ordenar por
          </label>
          <select
            value={sort}
            onChange={handleSortChange}
            className="w-full bg-[#161622] border border-[#272737] rounded-xl px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-[#6d28d9] transition-colors cursor-pointer"
          >
            <option value="position">Posición en tabla</option>
            <option value="points">Puntos acumulados</option>
            <option value="name">Nombre de usuario</option>
            <option value="createdAt">Fecha de registro</option>
          </select>
        </div>
      </div>
    </div>
  );
}
