'use client';

import { useState, useTransition } from 'react';
import { upsertMatchResult } from '../actions';
import {
  Search,
  Save,
  Check,
  Trash2,
  Clock,
  AlertTriangle
} from 'lucide-react';

interface Prediction {
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
}

interface Match {
  id: string;
  stage: string;
  groupName: string | null;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string | Date | null;
  status: string;
  resultSource: string;
  actualHomeScore: number | null;
  actualAwayScore: number | null;
  actualHomePenalties: number | null;
  actualAwayPenalties: number | null;
  actualWinner: string | null;
  prediction: Prediction | null;
}

interface ResultDraftState {
  homeScore: string;
  awayScore: string;
  homePenalties: string;
  awayPenalties: string;
  winner: string | null;
  isSimulated: boolean;
  isDirty: boolean;
  isSaved: boolean;
}

export default function ResultsClient({ initialMatches }: { initialMatches: Match[] }) {
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStage, setSelectedStage] = useState('ALL');
  const [isPending, startTransition] = useTransition();

  // Borradores locales para la carga de resultados
  const [drafts, setDrafts] = useState<Record<string, ResultDraftState>>(() => {
    const initialDrafts: Record<string, ResultDraftState> = {};
    initialMatches.forEach((m) => {
      initialDrafts[m.id] = {
        homeScore: m.actualHomeScore?.toString() ?? '',
        awayScore: m.actualAwayScore?.toString() ?? '',
        homePenalties: m.actualHomePenalties?.toString() ?? '',
        awayPenalties: m.actualAwayPenalties?.toString() ?? '',
        winner: m.actualWinner ?? null,
        isSimulated: m.resultSource === 'MANUAL_SIMULATION',
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

  const handleSourceToggle = (matchId: string, isSimulated: boolean) => {
    setDrafts((prev) => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        isSimulated,
        isDirty: true,
        isSaved: false,
      },
    }));
  };

  const saveResultHandler = async (matchId: string) => {
    const draft = drafts[matchId];
    const homeScoreVal = draft.homeScore === '' ? null : parseInt(draft.homeScore, 10);
    const awayScoreVal = draft.awayScore === '' ? null : parseInt(draft.awayScore, 10);

    if (homeScoreVal === null || awayScoreVal === null) {
      alert('Debes definir ambos marcadores para guardar el resultado.');
      return;
    }

    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const isKnockout = match.stage !== 'GROUP_STAGE';
    let winnerVal = draft.winner;
    let homePenVal = draft.homePenalties === '' ? null : parseInt(draft.homePenalties, 10);
    let awayPenVal = draft.awayPenalties === '' ? null : parseInt(draft.awayPenalties, 10);

    if (isKnockout && homeScoreVal === awayScoreVal) {
      if (winnerVal === null) {
        alert('Para partidos eliminatorios empatados, debes ingresar el ganador de la tanda de penales.');
        return;
      }
    }

    // Configurar estado y origen
    const status = draft.isSimulated ? 'MANUAL_PROJECTION' : 'FINISHED';
    const resultSource = draft.isSimulated ? 'MANUAL_SIMULATION' : 'MANUAL_REAL';

    startTransition(async () => {
      try {
        await upsertMatchResult(matchId, {
          actualHomeScore: homeScoreVal,
          actualAwayScore: awayScoreVal,
          actualHomePenalties: homePenVal,
          actualAwayPenalties: awayPenVal,
          actualWinner: winnerVal,
          status,
          resultSource,
        });

        setDrafts((prev) => ({
          ...prev,
          [matchId]: {
            ...prev[matchId],
            isDirty: false,
            isSaved: true,
          },
        }));

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
        alert('Error al guardar el resultado.');
      }
    });
  };

  const clearResultHandler = async (matchId: string) => {
    if (!confirm('¿Seguro que deseas eliminar el resultado de este partido? Esto reiniciará el partido a PROGRAMADO y borrará sus puntos.')) {
      return;
    }

    startTransition(async () => {
      try {
        await upsertMatchResult(matchId, {
          actualHomeScore: null,
          actualAwayScore: null,
          actualHomePenalties: null,
          actualAwayPenalties: null,
          actualWinner: null,
          status: 'SCHEDULED',
          resultSource: 'NONE',
        });

        // Limpiar inputs locales
        setDrafts((prev) => ({
          ...prev,
          [matchId]: {
            homeScore: '',
            awayScore: '',
            homePenalties: '',
            awayPenalties: '',
            winner: null,
            isSimulated: false,
            isDirty: false,
            isSaved: false,
          },
        }));

      } catch (error) {
        console.error(error);
        alert('Error al limpiar el resultado.');
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
    return m.stage !== 'GROUP_STAGE' && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="p-5 rounded-2xl bg-[#0f0f15]/80 border border-[#1e1e24] flex flex-col md:flex-row md:items-center md:justify-between gap-4">

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar partido por equipo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-[#13131a] border border-[#1e1e24] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#6d28d9] transition-colors duration-200"
          />
        </div>

        {/* Stage selection */}
        <div className="flex space-x-1.5 p-1 bg-[#13131a] rounded-lg border border-[#1e1e24] self-start md:self-auto overflow-x-auto">
          {['ALL', 'GROUP_STAGE', 'FINAL_STAGE'].map((stg) => (
            <button
              key={stg}
              onClick={() => setSelectedStage(stg)}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all duration-200 whitespace-nowrap ${
                selectedStage === stg
                  ? 'bg-[#6d28d9] text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {stg === 'ALL' ? 'Todos los Partidos' : stg === 'GROUP_STAGE' ? 'Fase de Grupos' : 'Fase Final'}
            </button>
          ))}
        </div>
      </div>

      {/* Matches editor list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredMatches.length === 0 ? (
          <div className="col-span-full p-12 text-center rounded-2xl border border-dashed border-[#1e1e24] text-zinc-500 font-semibold text-sm">
            No se encontraron partidos.
          </div>
        ) : (
          filteredMatches.map((m) => {
            const draft = drafts[m.id] || {
              homeScore: '',
              awayScore: '',
              homePenalties: '',
              awayPenalties: '',
              winner: null,
              isSimulated: false,
              isDirty: false,
              isSaved: false,
            };

            const isKnockout = m.stage !== 'GROUP_STAGE';
            const isDraw = draft.homeScore !== '' && draft.awayScore !== '' && draft.homeScore === draft.awayScore;
            const isFilled = m.actualHomeScore !== null && m.actualAwayScore !== null;

            return (
              <div
                key={m.id}
                className={`p-5 rounded-2xl bg-[#0f0f15]/85 border transition-all duration-300 flex flex-col justify-between ${
                  draft.isDirty
                    ? 'border-[#6d28d9]/60 shadow-lg shadow-[#6d28d9]/5'
                    : isFilled
                    ? 'border-[#1e1e24] hover:border-zinc-800'
                    : 'border-[#1e1e24]/60 hover:border-zinc-800'
                }`}
              >
                <div>
                  {/* Status header */}
                  <div className="flex justify-between items-center text-[10px] text-zinc-500 font-bold uppercase mb-4 tracking-wider">
                    <span>
                      {m.stage.replace('_', ' ')} {m.groupName ? `• ${m.groupName}` : ''}
                    </span>
                    <span className="flex items-center space-x-1">
                      {m.resultSource === 'MANUAL_SIMULATION' ? (
                        <span className="text-amber-400 font-bold flex items-center space-x-1">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span>Simulado / Proyección</span>
                        </span>
                      ) : m.resultSource === 'MANUAL_REAL' ? (
                        <span className="text-emerald-400 font-bold flex items-center space-x-1">
                          <Check className="h-3 w-3 shrink-0" />
                          <span>Resultado Real</span>
                        </span>
                      ) : (
                        <span className="text-zinc-500 flex items-center space-x-1">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>Programado</span>
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Team input scores */}
                  <div className="flex items-center justify-between space-x-4">
                    <div className="flex-1 flex flex-col items-center text-center">
                      <span className="font-extrabold text-sm text-zinc-200 truncate w-28 md:w-36">
                        {m.homeTeam}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <input
                        type="number"
                        min="0"
                        placeholder="-"
                        value={draft.homeScore}
                        onChange={(e) => handleScoreChange(m.id, 'home', e.target.value)}
                        className="w-12 h-12 rounded-xl bg-[#13131a] border border-[#1e1e24] text-center text-lg font-black text-white focus:outline-none focus:border-[#6d28d9]"
                      />
                      <span className="text-zinc-600 font-bold text-xs">VS</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="-"
                        value={draft.awayScore}
                        onChange={(e) => handleScoreChange(m.id, 'away', e.target.value)}
                        className="w-12 h-12 rounded-xl bg-[#13131a] border border-[#1e1e24] text-center text-lg font-black text-white focus:outline-none focus:border-[#6d28d9]"
                      />
                    </div>

                    <div className="flex-1 flex flex-col items-center text-center">
                      <span className="font-extrabold text-sm text-zinc-200 truncate w-28 md:w-36">
                        {m.awayTeam}
                      </span>
                    </div>
                  </div>

                  {/* Penalty Shootout and Winner Selector for Knockouts */}
                  {isKnockout && isDraw && (
                    <div className="mt-5 p-4 rounded-xl bg-[#13131a] border border-dashed border-[#272733] space-y-4 animate-fade-in">
                      <div className="text-center text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                        Desempate Real / Simulado (Penales)
                      </div>

                      <div className="flex flex-col items-center space-y-2">
                        <span className="text-[10px] text-zinc-500 font-bold">¿QUIÉN GANÓ?</span>
                        <div className="flex bg-[#0f0f15] rounded-lg p-0.5 border border-[#1e1e24] w-full">
                          <button
                            type="button"
                            onClick={() => handleWinnerSelect(m.id, m.homeTeam)}
                            className={`flex-1 py-1.5 px-3 rounded text-xs font-bold transition-all duration-200 truncate ${
                              draft.winner === m.homeTeam
                                ? 'bg-[#6d28d9] text-white'
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
                                ? 'bg-[#6d28d9] text-white'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            {m.awayTeam}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col items-center space-y-2">
                        <span className="text-[10px] text-zinc-500 font-bold">PUNTOS DE PENALES</span>
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

                  {/* Real/Simulated toggle */}
                  {draft.homeScore !== '' && draft.awayScore !== '' && (
                    <div className="mt-5 p-3 rounded-xl bg-[#13131a] border border-[#1e1e24] flex items-center justify-between">
                      <span className="text-[10px] text-zinc-400 font-bold">TIPO DE RESULTADO</span>
                      <div className="flex bg-[#0f0f15] rounded-lg p-0.5 border border-[#1e1e24]">
                        <button
                          type="button"
                          onClick={() => handleSourceToggle(m.id, false)}
                          className={`py-1 px-3 rounded text-[10px] font-bold transition-all duration-200 ${
                            !draft.isSimulated
                              ? 'bg-emerald-600 text-white'
                              : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          Real
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSourceToggle(m.id, true)}
                          className={`py-1 px-3 rounded text-[10px] font-bold transition-all duration-200 ${
                            draft.isSimulated
                              ? 'bg-amber-600 text-white'
                              : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          Simulado
                        </button>
                      </div>
                    </div>
                  )}

                  {/* User's prediction summary for comparison */}
                  {m.prediction && (
                    <div className="mt-4 p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-900/60 text-[10px] text-zinc-500 flex justify-between">
                      <span>Tu predicción cargada:</span>
                      <span className="font-extrabold text-zinc-400">
                        {m.prediction.predictedHomeScore} - {m.prediction.predictedAwayScore}
                      </span>
                    </div>
                  )}
                </div>

                {/* Footer Save & Delete */}
                <div className="mt-5 border-t border-[#1e1e24]/60 pt-4 flex items-center justify-between">
                  <div>
                    {isFilled ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => clearResultHandler(m.id)}
                        className="p-2 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all duration-200"
                        title="Borrar resultado del partido"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                    ) : (
                      <span className="text-[10px] text-zinc-600 font-semibold">Sin resultado</span>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={!draft.isDirty || isPending}
                    onClick={() => saveResultHandler(m.id)}
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
