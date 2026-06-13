'use client';

import { useState } from 'react';
import { Search, Award, CheckCircle2, XCircle } from 'lucide-react';

interface Prediction {
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  predictedHomePenalties: number | null;
  predictedAwayPenalties: number | null;
  predictedWinner: string | null;
}

interface Score {
  points: number;
  reason: string;
  calculatedAt: string | Date;
}

interface Match {
  id: string;
  stage: string;
  groupName: string | null;
  homeTeam: string;
  awayTeam: string;
  status: string;
  resultSource: string;
  actualHomeScore: number | null;
  actualAwayScore: number | null;
  actualHomePenalties: number | null;
  actualAwayPenalties: number | null;
  actualWinner: string | null;
  prediction: Prediction | null;
  score: Score | null;
}

export default function ScoresClient({ initialMatches }: { initialMatches: Match[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPoints, setFilterPoints] = useState<string>('ALL');

  // Filtrar solo partidos que tienen un puntaje calculado
  const resolvedMatches = initialMatches.filter(m => m.score !== null);

  const filteredMatches = resolvedMatches.filter((m) => {
    const matchesSearch = 
      m.homeTeam.toLowerCase().includes(searchTerm.toLowerCase()) || 
      m.awayTeam.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    const points = m.score?.points ?? 0;
    if (filterPoints === 'ALL') return true;
    if (filterPoints === 'EXACT') return points === 8 || points === 6;
    if (filterPoints === 'WINNER') return points === 5 || points === 4;
    if (filterPoints === 'MINIMAL') return points === 1;
    if (filterPoints === 'ZERO') return points === 0;
    
    return true;
  });

  const getPointsBadgeClass = (points: number) => {
    switch (points) {
      case 8:
        return 'bg-purple-500/10 text-purple-400 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)]';
      case 6:
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]';
      case 5:
        return 'bg-teal-500/10 text-teal-400 border border-teal-500/30';
      case 4:
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/30';
      case 1:
        return 'bg-zinc-500/10 text-zinc-400 border border-zinc-800';
      default:
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters Header */}
      <div className="p-5 rounded-2xl bg-[#0f0f15]/80 border border-[#1e1e24] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar por equipo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-[#13131a] border border-[#1e1e24] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#6d28d9] transition-colors duration-200"
          />
        </div>

        {/* Score Category Filters */}
        <div className="flex space-x-1.5 p-1 bg-[#13131a] rounded-lg border border-[#1e1e24] self-start md:self-auto overflow-x-auto">
          {[
            { value: 'ALL', label: 'Todos' },
            { value: 'EXACT', label: 'Exacto (8/6 pts)' },
            { value: 'WINNER', label: 'Ganador (5/4 pts)' },
            { value: 'MINIMAL', label: 'Mínimo (1 pt)' },
            { value: 'ZERO', label: 'Cero (0 pts)' },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => setFilterPoints(item.value)}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all duration-200 whitespace-nowrap ${
                filterPoints === item.value
                  ? 'bg-[#6d28d9] text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results Detail List */}
      <div className="space-y-4">
        {filteredMatches.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-dashed border-[#1e1e24] text-zinc-500 font-semibold text-sm">
            {resolvedMatches.length === 0 
              ? 'Aún no se ha calculado ningún puntaje. Carga resultados para ver detalles.'
              : 'No se encontraron partidos resueltos con el filtro seleccionado.'
            }
          </div>
        ) : (
          filteredMatches.map((m) => {
            if (!m.score) return null;
            
            const isSimulated = m.resultSource === 'MANUAL_SIMULATION';

            return (
              <div 
                key={m.id}
                className="p-5 rounded-2xl bg-[#0f0f15]/85 border border-[#1e1e24] hover:border-zinc-800 transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                {/* Left Side: Game and prediction comparison */}
                <div className="flex-1 space-y-3">
                  <div className="flex items-center space-x-2 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                    <span>{m.stage.replace('_', ' ')}</span>
                    <span>•</span>
                    {isSimulated ? (
                      <span className="text-amber-500">[Proyección Simulada]</span>
                    ) : (
                      <span className="text-emerald-500">[Marcador Oficial]</span>
                    )}
                  </div>

                  {/* Visual Comparison block */}
                  <div className="grid grid-cols-5 items-center gap-2 max-w-xl">
                    {/* Home Team name */}
                    <div className="col-span-2 text-right font-extrabold text-sm text-zinc-100 truncate">
                      {m.homeTeam}
                    </div>

                    {/* Scores block */}
                    <div className="col-span-1 flex flex-col items-center space-y-1">
                      {/* Real score */}
                      <div className="px-2 py-0.5 rounded bg-[#13131a] text-white font-black text-xs border border-[#1e1e24]">
                        {m.actualHomeScore} - {m.actualAwayScore}
                      </div>
                      
                      {/* Prediction label */}
                      <div className="text-[10px] text-zinc-500 font-medium whitespace-nowrap">
                        Pred: {m.prediction?.predictedHomeScore} - {m.prediction?.predictedAwayScore}
                      </div>
                    </div>

                    {/* Away Team name */}
                    <div className="col-span-2 font-extrabold text-sm text-zinc-100 truncate">
                      {m.awayTeam}
                    </div>
                  </div>

                  {/* Shootout/Penalties detailed display if applicable */}
                  {(m.actualHomeScore === m.actualAwayScore && m.stage !== 'GROUP_STAGE') && (
                    <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-900/60 text-[10px] text-zinc-500 max-w-xl flex justify-between">
                      <span>
                        Ganador Real: <span className="font-bold text-zinc-300">{m.actualWinner}</span> 
                        {m.actualHomePenalties !== null && ` (Pen: ${m.actualHomePenalties}-${m.actualAwayPenalties})`}
                      </span>
                      <span>
                        Pred: <span className="font-bold text-zinc-300">{m.prediction?.predictedWinner ?? '-'}</span> 
                        {m.prediction?.predictedHomePenalties !== null && ` (Pen: ${m.prediction?.predictedHomePenalties}-${m.prediction?.predictedAwayPenalties})`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Right Side: Points details */}
                <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center border-t md:border-t-0 md:border-l border-[#1e1e24]/60 pt-4 md:pt-0 md:pl-6 shrink-0 gap-4">
                  <div className="text-left md:text-right">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">
                      Causa / Regla
                    </span>
                    <span className="text-xs font-bold text-zinc-300">
                      {m.score.reason}
                    </span>
                  </div>

                  <div className={`px-4 py-2.5 rounded-xl text-center flex items-center space-x-2 ${getPointsBadgeClass(m.score.points)}`}>
                    <Award className="h-4 w-4" />
                    <span className="text-lg font-black tracking-tight">+{m.score.points} pts</span>
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
