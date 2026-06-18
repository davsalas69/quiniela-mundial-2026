'use client';

import { useState, useTransition } from 'react';
import { upsertPrediction } from '../actions';
import {
  Search,
  Filter,
  Save,
  Check,
  Clock,
  AlertCircle
} from 'lucide-react';

interface Prediction {
  id: string;
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  predictedHomePenalties: number | null;
  predictedAwayPenalties: number | null;
  predictedWinner: string | null;
}

interface Match {
  id: string;
  stage: string;
  groupName: string | null;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string | Date | null;
  status: string;
  actualHomeScore: number | null;
  actualAwayScore: number | null;
  prediction: Prediction | null;
}

interface DraftState {
  homeScore: string;
  awayScore: string;
  homePenalties: string;
  awayPenalties: string;
  winner: string | null;
  isDirty: boolean;
  isSaved: boolean;
}

export default function PredictionsClient({ initialMatches }: { initialMatches: Match[] }) {
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStage, setSelectedStage] = useState('ALL');
  const [isPending, startTransition] = useTransition();

  // Guarda el estado temporal de los campos de entrada de forma local
  // Clave: matchId, Valor: los inputs de goles y penaltis
  const [drafts, setDrafts] = useState<Record<string, DraftState>>(() => {
    const initialDrafts: Record<string, DraftState> = {};
    initialMatches.forEach((m) => {
      initialDrafts[m.id] = {
        homeScore: m.prediction?.predictedHomeScore?.toString() ?? '',
        awayScore: m.prediction?.predictedAwayScore?.toString() ?? '',
        homePenalties: m.prediction?.predictedHomePenalties?.toString() ?? '',
        awayPenalties: m.prediction?.predictedAwayPenalties?.toString() ?? '',
        winner: m.prediction?.predictedWinner ?? null,
        isDirty: false,
        isSaved: false,
      };
    });
    return initialDrafts;
  });

  const handleScoreChange = (matchId: string, team: 'home' | 'away', value: string) => {
    const draft = drafts[matchId];
    const newHomeScore = team === 'home' ? value : draft.homeScore;
    const newAwayScore = team === 'away' ? value : draft.awayScore;

    // Si deja de ser empate, limpiamos ganador y penaltis
    let newWinner = draft.winner;
    let newHomePen = draft.homePenalties;
    let newAwayPen = draft.awayPenalties;

    if (newHomeScore !== newAwayScore) {
      newWinner = null;
      newHomePen = '';
      newAwayPen = '';
    }

    setDrafts((prev) => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        homeScore: newHomeScore,
        awayScore: newAwayScore,
        winner: newWinner,
        homePenalties: newHomePen,
        awayPenalties: newAwayPen,
        isDirty: true,
        isSaved: false,
      },
    }));
  };

  const handlePenaltiesChange = (matchId: string, team: 'home' | 'away', value: string) => {
    const draft = drafts[matchId];
    const newHomePen = team === 'home' ? value : draft.homePenalties;
    const newAwayPen = team === 'away' ? value : draft.awayPenalties;

    // Selecciona automáticamente un ganador de penales provisorio basado en el marcador de penales
    let newWinner = draft.winner;
    const homeVal = parseInt(newHomePen, 10);
    const awayVal = parseInt(newAwayPen, 10);
    const match = matches.find(m => m.id === matchId);

    if (match) {
      if (!isNaN(homeVal) && !isNaN(awayVal)) {
        if (homeVal > awayVal) {
          newWinner = match.homeTeam;
        } else if (awayVal > homeVal) {
          newWinner = match.awayTeam;
        }
      }
    }

    setDrafts((prev) => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        homePenalties: newHomePen,
        awayPenalties: newAwayPen,
        winner: newWinner,
        isDirty: true,
        isSaved: false,
      },
    }));
  };

  const handleWinnerSelect = (matchId: string, teamName: string) => {
    setDrafts((prev) => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        winner: teamName,
        isDirty: true,
        isSaved: false,
      },
    }));
  };

  const savePredictionHandler = async (matchId: string) => {
    const draft = drafts[matchId];
    const homeScoreVal = draft.homeScore === '' ? null : parseInt(draft.homeScore, 10);
    const awayScoreVal = draft.awayScore === '' ? null : parseInt(draft.awayScore, 10);

    let homePenaltiesVal = draft.homePenalties === '' ? null : parseInt(draft.homePenalties, 10);
    let awayPenaltiesVal = draft.awayPenalties === '' ? null : parseInt(draft.awayPenalties, 10);
    let winnerVal = draft.winner;

    // Validación básica: si uno es número y otro no
    if ((homeScoreVal === null && awayScoreVal !== null) || (homeScoreVal !== null && awayScoreVal === null)) {
      alert('Debes ingresar goles para ambos equipos.');
      return;
    }

    const match = matches.find(m => m.id === matchId);

    // Para fases de eliminación si hay empate
    if (match && match.stage !== 'GROUP_STAGE' && homeScoreVal !== null && awayScoreVal !== null) {
      if (homeScoreVal === awayScoreVal) {
        if (winnerVal === null) {
          alert('Para fases eliminatorias con empate, debes seleccionar qué equipo avanza (Ganador).');
          return;
        }
      }
    }

    if (match && (match.status === 'FINISHED' || match.status === 'MANUAL_PROJECTION')) {
      const confirmSave = window.confirm(
        'Este partido ya comenzó o finalizó. ¿Confirmas que deseas guardar/corregir este pronóstico como administrador?'
      );
      if (!confirmSave) return;
    }


    startTransition(async () => {
      try {
        await upsertPrediction(matchId, {
          predictedHomeScore: homeScoreVal,
          predictedAwayScore: awayScoreVal,
          predictedHomePenalties: homePenaltiesVal,
          predictedAwayPenalties: awayPenaltiesVal,
          predictedWinner: winnerVal,
        });

        // Actualizar estado local guardado
        setDrafts((prev) => ({
          ...prev,
          [matchId]: {
            ...prev[matchId],
            isDirty: false,
            isSaved: true,
          },
        }));

        // Ocultar check de guardado tras 3 segundos
        setTimeout(() => {
          setDrafts((prev) => {
            if (!prev[matchId]) return prev;
            return {
              ...prev,
              [matchId]: {
                ...prev[matchId],
                isSaved: false,
              },
            };
          });
        }, 3000);

      } catch (error) {
        console.error(error);
        alert('Error al guardar el pronóstico.');
      }
    });
  };

  // Filtrado de partidos
  const filteredMatches = matches.filter((m) => {
    const matchesSearch =
      m.homeTeam.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.awayTeam.toLowerCase().includes(searchTerm.toLowerCase());

    if (selectedStage === 'ALL') return matchesSearch;
    if (selectedStage === 'GROUP_STAGE') return m.stage === 'GROUP_STAGE' && matchesSearch;
    return m.stage !== 'GROUP_STAGE' && matchesSearch; // Final stages
  });

  const stagesList = [
    { value: 'ALL', label: 'Todos los Partidos' },
    { value: 'GROUP_STAGE', label: 'Fase de Grupos' },
    { value: 'FINAL_STAGE', label: 'Fase Final (Eliminación)' },
  ];

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

        {/* Tab Filters */}
        <div className="flex space-x-1.5 p-1 bg-[#13131a] rounded-lg border border-[#1e1e24] self-start md:self-auto overflow-x-auto">
          {stagesList.map((stg) => (
            <button
              key={stg.value}
              onClick={() => setSelectedStage(stg.value)}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all duration-200 whitespace-nowrap ${
                selectedStage === stg.value
                  ? 'bg-[#6d28d9] text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {stg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Matches */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredMatches.length === 0 ? (
          <div className="col-span-full p-12 text-center rounded-2xl border border-dashed border-[#1e1e24] text-zinc-500 font-semibold text-sm">
            No se encontraron partidos coincidentes.
          </div>
        ) : (
          filteredMatches.map((m) => {
            const draft = drafts[m.id] || {
              homeScore: '',
              awayScore: '',
              homePenalties: '',
              awayPenalties: '',
              winner: null,
              isDirty: false,
              isSaved: false,
            };

            const isFinalStage = m.stage !== 'GROUP_STAGE';
            const isDraw = draft.homeScore !== '' && draft.awayScore !== '' && draft.homeScore === draft.awayScore;
            const isCompleted = draft.homeScore !== '' && draft.awayScore !== '';

            const isHistorical = m.status === 'FINISHED' || m.status === 'MANUAL_PROJECTION';

            return (
              <div
                key={m.id}
                className={`p-5 rounded-2xl bg-[#0f0f15]/85 border transition-all duration-300 flex flex-col justify-between ${
                  draft.isDirty
                    ? 'border-[#6d28d9]/60 shadow-lg shadow-[#6d28d9]/5'
                    : 'border-[#1e1e24] hover:border-zinc-800'
                }`}
              >
                <div>
                  {/* Match stage and date */}
                  <div className="flex justify-between items-center text-[10px] text-zinc-500 font-bold uppercase mb-4 tracking-wider">
                    <span>
                      {m.stage.replace('_', ' ')} {m.groupName ? `• ${m.groupName}` : ''}
                    </span>
                    <span className="flex items-center space-x-1">
                      {isHistorical ? (
                        <span className="text-emerald-500 font-semibold flex items-center space-x-1">
                          <Check className="h-3 w-3 shrink-0" />
                          <span>Finalizado</span>
                        </span>
                      ) : (
                        <span className="text-zinc-500 flex items-center space-x-1">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>
                            {m.kickoffAt
                              ? new Date(m.kickoffAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                              : 'Fecha pendiente'
                            }
                          </span>
                        </span>
                      )}
                    </span>
                  </div>

                  {isHistorical && (
                    <div className="mb-4 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-500 font-bold flex items-center space-x-1 uppercase tracking-wider animate-fade-in">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>Pronóstico Histórico (Edición Administrativa)</span>
                    </div>
                  )}

                  {/* Teams and Score inputs */}
                  <div className="flex items-center justify-between space-x-4">
                    {/* Home Team */}
                    <div className="flex-1 flex flex-col items-center text-center">
                      <span className="font-extrabold text-sm text-zinc-200 truncate w-28 md:w-36">
                        {m.homeTeam}
                      </span>
                    </div>

                    {/* Prediction Inputs */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <input
                        type="number"
                        min="0"
                        placeholder="-"
                        value={draft.homeScore}
                        onChange={(e) => handleScoreChange(m.id, 'home', e.target.value)}
                        className="w-12 h-12 rounded-xl bg-[#13131a] border border-[#1e1e24] text-center text-lg font-black text-white focus:outline-none focus:border-[#6d28d9] focus:ring-1 focus:ring-[#6d28d9]"
                      />
                      <span className="text-zinc-600 font-bold text-xs">VS</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="-"
                        value={draft.awayScore}
                        onChange={(e) => handleScoreChange(m.id, 'away', e.target.value)}
                        className="w-12 h-12 rounded-xl bg-[#13131a] border border-[#1e1e24] text-center text-lg font-black text-white focus:outline-none focus:border-[#6d28d9] focus:ring-1 focus:ring-[#6d28d9]"
                      />
                    </div>

                    {/* Away Team */}
                    <div className="flex-1 flex flex-col items-center text-center">
                      <span className="font-extrabold text-sm text-zinc-200 truncate w-28 md:w-36">
                        {m.awayTeam}
                      </span>
                    </div>
                  </div>

                  {/* Knockout stage sub-form for draws */}
                  {isFinalStage && isDraw && isCompleted && (
                    <div className="mt-5 p-4 rounded-xl bg-[#13131a] border border-dashed border-[#272733] space-y-4 animate-fade-in">
                      <div className="text-center text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                        Desempate Requerido (Fase Final)
                      </div>

                      {/* Select Winner Toggle */}
                      <div className="flex flex-col items-center space-y-2">
                        <span className="text-[10px] text-zinc-500 font-bold">¿QUIÊN CLASIFICA?</span>
                        <div className="flex bg-[#0f0f15] rounded-lg p-0.5 border border-[#1e1e24] w-full">
                          <button
                            type="button"
                            onClick={() => handleWinnerSelect(m.id, m.homeTeam)}
                            className={`flex-1 py-1.5 px-3 rounded text-xs font-bold transition-all duration-200 truncate ${
                              draft.winner === m.homeTeam
                                ? 'bg-[#6d28d9] text-white shadow'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            {m.homeTeam}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleWinnerSelect(m.id, m.awayTeam)}
                            className={`flex-1 py-1.5 px-3 rounded text-xs font-bold transition-all duration-200 truncate ${
                              draft.winner === m.awayTeam
                                ? 'bg-[#6d28d9] text-white shadow'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            {m.awayTeam}
                          </button>
                        </div>
                      </div>

                      {/* Penalty inputs */}
                      <div className="flex flex-col items-center space-y-2">
                        <span className="text-[10px] text-zinc-500 font-bold">MARCADOR PENALTIS</span>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            min="0"
                            placeholder="Pen"
                            value={draft.homePenalties}
                            onChange={(e) => handlePenaltiesChange(m.id, 'home', e.target.value)}
                            className="w-12 h-9 rounded-lg bg-[#0f0f15] border border-[#1e1e24] text-center text-xs font-bold text-white focus:outline-none focus:border-[#6d28d9]"
                          />
                          <span className="text-zinc-600 font-black text-[10px]">-</span>
                          <input
                            type="number"
                            min="0"
                            placeholder="Pen"
                            value={draft.awayPenalties}
                            onChange={(e) => handlePenaltiesChange(m.id, 'away', e.target.value)}
                            className="w-12 h-9 rounded-lg bg-[#0f0f15] border border-[#1e1e24] text-center text-xs font-bold text-white focus:outline-none focus:border-[#6d28d9]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Real Score Result display (if match finished) */}
                  {isHistorical && (
                    <div className="mt-4 p-3 rounded-xl bg-zinc-950 border border-zinc-900 flex justify-between items-center text-xs text-zinc-400">
                      <span>Resultado real: <span className="font-bold text-white">{m.actualHomeScore} - {m.actualAwayScore}</span></span>
                      {m.stage !== 'GROUP_STAGE' && m.actualHomeScore === m.actualAwayScore && (
                        <span>Pen: <span className="font-bold text-white">{m.prediction?.predictedHomePenalties ?? '-'} - {m.prediction?.predictedAwayPenalties ?? '-'}</span></span>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer Save Button */}
                <div className="mt-5 border-t border-[#1e1e24]/60 pt-4 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 font-semibold">
                    {draft.isDirty ? (
                      <span className="text-amber-500 flex items-center space-x-1">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>Cambios sin guardar</span>
                      </span>
                    ) : (
                      <span className="text-zinc-600">Al día</span>
                    )}
                  </span>

                  <button
                    type="button"
                    disabled={!draft.isDirty || isPending}
                    onClick={() => savePredictionHandler(m.id)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all duration-200 ${
                      draft.isDirty
                        ? 'bg-[#6d28d9] hover:bg-[#5b21b6] text-white hover:scale-[1.02] cursor-pointer'
                        : draft.isSaved
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-zinc-800/40 text-zinc-600 cursor-not-allowed'
                    }`}
                  >
                    {draft.isSaved ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Guardado</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-3.5 w-3.5" />
                        <span>Guardar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

