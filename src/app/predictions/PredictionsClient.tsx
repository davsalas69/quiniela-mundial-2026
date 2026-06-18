'use client';

import { useState, useTransition } from 'react';
import { useAuth } from '../components/AuthProvider';
import {
  upsertPrediction,
  previewPredictionImportAction,
  confirmPredictionImportAction,
} from '../actions';
import {
  Search,
  Filter,
  Save,
  Check,
  Clock,
  AlertCircle,
  Download,
  AlertTriangle,
  Upload,
  Database,
  RefreshCw
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
  const { user, openAuthModal } = useAuth();

  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStage, setSelectedStage] = useState('ALL');
  const [isPending, startTransition] = useTransition();

  // Prediction import states
  const [predictionFile, setPredictionFile] = useState<File | null>(null);
  const [predictionPreview, setPredictionPreview] = useState<any | null>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [predictionStatus, setPredictionStatus] = useState<'IDLE' | 'ANALYZING' | 'PREVIEW' | 'IMPORTING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [predictionResult, setPredictionResult] = useState<any | null>(null);
  const [adminAuthorized, setAdminAuthorized] = useState(false);
  const hasAdminMatches = !!predictionPreview?.items?.some((item: any) => item.isAdministrative);

  const handlePredictionFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.size > 2 * 1024 * 1024) {
      setPredictionError('El archivo excede el límite máximo de 2 MB.');
      setPredictionStatus('ERROR');
      return;
    }

    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      setPredictionError('Formato inválido. Solo se admiten archivos .xlsx o .xls.');
      setPredictionStatus('ERROR');
      return;
    }

    setPredictionFile(selectedFile);
    setPredictionStatus('ANALYZING');
    setPredictionError(null);
    setPredictionPreview(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await previewPredictionImportAction(formData);
      if (res.success && res.report) {
        setPredictionPreview(res.report);
        setPredictionStatus('PREVIEW');
      } else {
        setPredictionError(res.message || 'Error al procesar la vista previa.');
        setPredictionStatus('ERROR');
      }
    } catch (err: any) {
      setPredictionError(err.message || 'Error de conexión.');
      setPredictionStatus('ERROR');
    }
  };

  const handleConfirmPredictionImport = async () => {
    if (!predictionFile) return;

    setPredictionStatus('IMPORTING');
    setPredictionError(null);

    const formData = new FormData();
    formData.append('file', predictionFile);

    try {
      const res = await confirmPredictionImportAction(formData);
      if (res.success && res.result) {
        setPredictionResult(res.result);
        setPredictionStatus('SUCCESS');
      } else {
        setPredictionError(res.message || 'Error al confirmar la importación.');
        setPredictionStatus('ERROR');
      }
    } catch (err: any) {
      setPredictionError(err.message || 'Error al guardar las predicciones.');
      setPredictionStatus('ERROR');
    }
  };

  const handleCancelPredictionImport = () => {
    const wasSuccess = predictionStatus === 'SUCCESS';
    setPredictionFile(null);
    setPredictionPreview(null);
    setPredictionError(null);
    setPredictionResult(null);
    setPredictionStatus('IDLE');
    setAdminAuthorized(false);
    if (wasSuccess) {
      window.location.reload();
    }
  };

  const handleImportClick = () => {
    if (!user) {
      openAuthModal(() => {
        setTimeout(() => {
          const input = document.getElementById('prediction-file-input') as HTMLInputElement;
          if (input) {
            input.click();
          }
        }, 300);
      }, 'register');
    } else {
      const input = document.getElementById('prediction-file-input') as HTMLInputElement;
      if (input) {
        input.click();
      }
    }
  };

  const handleDownloadTemplateClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!user) {
      e.preventDefault();
      openAuthModal(() => {
        setTimeout(() => {
          const link = document.createElement('a');
          link.href = '/api/predictions/template';
          link.download = 'plantilla_quiniela.xlsx';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, 300);
      }, 'register');
    }
  };

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
      {/* Card: Predictions Bulk Upload Section */}
      <div className="p-6 rounded-2xl bg-[#0f0f15]/75 border border-[#1e1e24] space-y-6">
        <div>
          <h3 className="font-extrabold text-lg tracking-tight flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-[#059669]/10 text-[#34d399]">
              <Database className="h-5 w-5" />
            </span>
            <span>Importar Predicciones desde Excel</span>
          </h3>
          <p className="text-xs text-zinc-500 mt-1 font-medium">
            Descarga la plantilla oficial, rellena tus pronósticos y vuelve a subirla para cargar tus predicciones automáticamente.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Step 1: Download template */}
          <div className="p-5 rounded-xl border border-zinc-800 bg-[#0a0a0f] hover:bg-[#0f0f15]/50 transition duration-200 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-zinc-200 flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 text-xs flex items-center justify-center font-bold">1</span>
                <span>Descargar plantilla</span>
              </h4>
              <p className="text-xs mt-1 font-medium leading-relaxed text-zinc-500">
                Descarga una plantilla basada en los partidos actuales para evitar errores de coincidencia.
              </p>
            </div>
            <a
              href="/api/predictions/template"
              onClick={handleDownloadTemplateClick}
              download
              className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-300 transition flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Download className="h-4 w-4 text-[#34d399]" />
              <span>Descargar plantilla</span>
            </a>
          </div>

          {/* Step 2: Upload predictions */}
          <div className="p-5 rounded-xl border border-zinc-800 bg-[#0a0a0f] hover:bg-[#0f0f15]/50 transition duration-200 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-zinc-200 flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full bg-emerald-950/40 text-emerald-400 text-xs flex items-center justify-center font-bold">2</span>
                <span>Cargar predicciones</span>
              </h4>
              <p className="text-xs mt-1 font-medium leading-relaxed text-zinc-500">
                Completa únicamente las columnas de pronóstico y vuelve a subir el archivo.
              </p>
            </div>
            <div className="w-full">
              <input
                type="file"
                id="prediction-file-input"
                accept=".xlsx, .xls"
                onChange={handlePredictionFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={handleImportClick}
                className="w-full py-2.5 px-4 rounded-lg bg-[#059669] hover:bg-[#047857] text-xs font-bold text-white transition flex items-center justify-center space-x-2 cursor-pointer text-center border-0"
              >
                <Upload className="h-4 w-4" />
                <span>Cargar predicciones</span>
              </button>
            </div>
          </div>
        </div>

        {predictionStatus === 'ANALYZING' && (
          <div className="flex flex-col items-center justify-center p-8 border border-[#272733] rounded-xl bg-[#0a0a0f]">
            <RefreshCw className="h-8 w-8 text-[#34d399] animate-spin" />
            <span className="text-xs text-zinc-300 font-bold mt-4">Analizando archivo…</span>
            <span className="text-[10px] text-zinc-500 mt-1">Leyendo datos y buscando coincidencias</span>
          </div>
        )}

        {predictionStatus === 'ERROR' && (
          <div className="p-6 border border-rose-950/30 rounded-xl bg-rose-950/5 space-y-4">
            <div className="flex items-start space-x-3 text-xs text-rose-300 font-medium">
              <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-rose-400">Error al importar</p>
                <p className="text-rose-400/80 mt-1">{predictionError}</p>
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={handleCancelPredictionImport}
                className="px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-300 cursor-pointer transition"
              >
                Volver a intentar
              </button>
            </div>
          </div>
        )}

        {predictionStatus === 'PREVIEW' && predictionPreview && (
          <div className="space-y-5">
            {/* Method info indicator */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-zinc-800 bg-[#0a0a0f]/90 gap-4">
              <div>
                <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider block">Método de Importación</span>
                <span className={`text-xs font-black uppercase inline-flex items-center space-x-1.5 mt-1 ${
                  predictionPreview.importMethod === 'MATCH_ID' ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  {predictionPreview.importMethod === 'MATCH_ID' ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Coincidencia por matchId (Plantilla Oficial)</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4" />
                      <span>Coincidencia por datos legacy</span>
                    </>
                  )}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 font-medium">
                Archivo: <span className="font-extrabold text-[#34d399]">{predictionFile?.name}</span> • Hoja: <span className="font-bold text-zinc-300">{predictionPreview.sheetName}</span>
              </div>
            </div>

            {/* Legacy warning message */}
            {predictionPreview.importMethod === 'LEGACY' && (
              <div className="p-3.5 rounded-xl border border-amber-500/25 bg-amber-500/5 text-xs text-amber-300 font-medium flex items-start space-x-2.5">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-400">Advertencia de archivo antiguo</p>
                  <p className="text-amber-400/80 mt-0.5 leading-relaxed">
                    Este archivo no contiene matchId y se procesará mediante coincidencia por equipos y fecha. Para mayor precisión, descargue la plantilla oficial.
                  </p>
                </div>
              </div>
            )}

            {/* Summary statistics grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 text-xs">
              <div className="bg-[#0a0a0f] p-3 rounded-lg border border-zinc-900 flex flex-col justify-between">
                <span className="text-zinc-500 block text-[9px] uppercase font-bold tracking-wider">Filas Leídas</span>
                <span className="text-base font-black text-zinc-200 mt-1">{predictionPreview.totalRows}</span>
              </div>
              <div className="bg-[#0a0a0f] p-3 rounded-lg border border-zinc-900 flex flex-col justify-between">
                <span className="text-emerald-500 block text-[9px] uppercase font-bold tracking-wider">matchId Encontrados</span>
                <span className="text-base font-black text-emerald-400 mt-1">{predictionPreview.matchIdFoundCount}</span>
              </div>
              <div className="bg-[#0a0a0f] p-3 rounded-lg border border-zinc-900 flex flex-col justify-between">
                <span className="text-rose-500 block text-[9px] uppercase font-bold tracking-wider">matchId Inexistentes</span>
                <span className="text-base font-black text-rose-400 mt-1">{predictionPreview.matchIdNotFoundCount}</span>
              </div>
              <div className="bg-[#0a0a0f] p-3 rounded-lg border border-zinc-900 flex flex-col justify-between">
                <span className="text-amber-500 block text-[9px] uppercase font-bold tracking-wider">Nuevos (Fut)</span>
                <span className="text-base font-black text-amber-400 mt-1">{predictionPreview.newFutureCount}</span>
              </div>
              <div className="bg-[#0a0a0f] p-3 rounded-lg border border-zinc-900 flex flex-col justify-between">
                <span className="text-blue-500 block text-[9px] uppercase font-bold tracking-wider">Act. (Fut)</span>
                <span className="text-base font-black text-blue-400 mt-1">{predictionPreview.updateFutureCount}</span>
              </div>
              <div className="bg-[#0a0a0f] p-3 rounded-lg border border-zinc-900 flex flex-col justify-between">
                <span className="text-orange-500 block text-[9px] uppercase font-bold tracking-wider">Nuevos (Hist)</span>
                <span className="text-base font-black text-orange-400 mt-1">{predictionPreview.newHistoryCount}</span>
              </div>
              <div className="bg-[#0a0a0f] p-3 rounded-lg border border-zinc-900 flex flex-col justify-between">
                <span className="text-violet-500 block text-[9px] uppercase font-bold tracking-wider">Act. (Hist)</span>
                <span className="text-base font-black text-violet-400 mt-1">{predictionPreview.updateHistoryCount}</span>
              </div>
              <div className="bg-[#0a0a0f] p-3 rounded-lg border border-zinc-900 flex flex-col justify-between">
                <span className="text-teal-500 block text-[9px] uppercase font-bold tracking-wider">Recalculados</span>
                <span className="text-base font-black text-teal-400 mt-1">{predictionPreview.recalculatedCount}</span>
              </div>
              <div className="bg-[#0a0a0f] p-3 rounded-lg border border-zinc-900 flex flex-col justify-between">
                <span className="text-zinc-400 block text-[9px] uppercase font-bold tracking-wider">Ignorados</span>
                <span className="text-base font-black text-zinc-300 mt-1">{predictionPreview.ignoredCount}</span>
              </div>
              <div className="bg-[#0a0a0f] p-3 rounded-lg border border-zinc-900 flex flex-col justify-between">
                <span className="text-red-500 block text-[9px] uppercase font-bold tracking-wider">Inválidos</span>
                <span className="text-base font-black text-red-400 mt-1">{predictionPreview.invalidCount}</span>
              </div>
            </div>

            {/* Detailed Table */}
            <div className="overflow-x-auto border border-zinc-800/80 rounded-xl bg-[#0a0a0f]/95 max-h-96 custom-scrollbar">
              <table className="w-full border-collapse text-[11px] text-left text-zinc-300">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/40 text-[10px] text-zinc-400 font-extrabold uppercase tracking-wider sticky top-0 bg-[#0a0a0f] z-10">
                    <th className="py-2.5 px-3">Fila</th>
                    <th className="py-2.5 px-3">Fecha</th>
                    <th className="py-2.5 px-3">Local</th>
                    <th className="py-2.5 px-3">Visitante</th>
                    <th className="py-2.5 px-3">Pronóstico</th>
                    <th className="py-2.5 px-3">Partido Encontrado</th>
                    <th className="py-2.5 px-3 text-center">Estado</th>
                    <th className="py-2.5 px-3 text-center">Acción prevista</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900 font-medium">
                  {predictionPreview.items.map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-zinc-900/20 transition-colors">
                      <td className="py-2.5 px-3 text-zinc-500 font-mono">#{item.rowNumber}</td>
                      <td className="py-2.5 px-3 text-zinc-400">
                        {item.excelDate ? new Date(item.excelDate).toLocaleDateString('es-ES') : '-'}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-zinc-200">{item.homeTeam}</td>
                      <td className="py-2.5 px-3 font-bold text-zinc-200">{item.awayTeam}</td>
                      <td className="py-2.5 px-3">
                        <span className="bg-[#13131a] px-2 py-0.5 rounded border border-zinc-800 font-bold font-mono">
                          {item.prediction}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {item.matchedMatch ? (
                          <span className="text-zinc-400">
                            {item.matchedMatch.homeTeam} vs {item.matchedMatch.awayTeam}
                          </span>
                        ) : (
                          <span className="text-rose-500/80 italic">{item.reason || 'Sin coincidencia'}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                          item.isAdministrative ? 'bg-amber-950/45 text-amber-400 border border-amber-900/30' :
                          item.status === 'VALID' ? 'bg-emerald-950/45 text-emerald-400 border border-emerald-900/30' :
                          item.status === 'INVALID' ? 'bg-rose-950/45 text-rose-400 border border-rose-900/30' :
                          item.status === 'NOT_FOUND' ? 'bg-zinc-800 text-zinc-400 border border-zinc-700' :
                          item.status === 'AMBIGUOUS' ? 'bg-indigo-950/45 text-indigo-400 border border-indigo-900/30' :
                          'bg-amber-950/45 text-amber-400 border border-amber-900/30'
                        }`}>
                          {item.isAdministrative ? 'IMPORTACIÓN HISTÓRICA' : item.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          (item.action === 'CREATE' || item.action === 'CREATE_RECALCULATE') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          (item.action === 'UPDATE' || item.action === 'UPDATE_RECALCULATE') ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                          item.action === 'ERROR' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                          'bg-zinc-800/40 text-zinc-500 border border-zinc-800'
                        } border`}>
                          {item.action === 'CREATE' ? 'CREAR' :
                           item.action === 'CREATE_RECALCULATE' ? 'CREAR Y RECALCULAR' :
                           item.action === 'UPDATE' ? 'ACTUALIZAR' :
                           item.action === 'UPDATE_RECALCULATE' ? 'ACTUALIZAR Y RECALCULAR' :
                           item.action === 'ERROR' ? 'ERROR' : 'IGNORAR'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Warning and Checkbox for Administrative Imports */}
            {hasAdminMatches && (
              <div className="p-4 border border-amber-500/30 rounded-xl bg-amber-500/5 space-y-3">
                <div className="flex items-start space-x-2.5 text-xs text-amber-300">
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-400">Importación Histórica Requerida</p>
                    <p className="text-amber-400/80 mt-1">
                      Este archivo contiene predicciones históricas (partidos que ya comenzaron o finalizaron). Al confirmar, se modificará el historial y se recalcularán los puntos.
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="admin-authorization-checkbox"
                    checked={adminAuthorized}
                    onChange={(e) => setAdminAuthorized(e.target.checked)}
                    className="rounded border-[#272733] bg-[#0a0a0f] text-[#34d399] focus:ring-emerald-500 focus:ring-offset-0 h-4 w-4 cursor-pointer"
                  />
                  <label htmlFor="admin-authorization-checkbox" className="text-xs text-zinc-300 font-bold select-none cursor-pointer">
                    He revisado los pronósticos históricos y autorizo su actualización.
                  </label>
                </div>
              </div>
            )}

            {/* Confirm Actions */}
            <div className="flex space-x-3.5 pt-2">
              <button
                onClick={handleConfirmPredictionImport}
                disabled={hasAdminMatches && !adminAuthorized}
                className={`px-5 py-2.5 rounded-lg text-xs font-bold text-white transition-all duration-200 flex items-center space-x-1.5 shadow-lg ${
                  hasAdminMatches && !adminAuthorized
                    ? 'bg-zinc-800 border border-zinc-700 text-zinc-500 cursor-not-allowed shadow-none'
                    : 'bg-[#059669] hover:bg-[#047857] shadow-emerald-950/20 cursor-pointer'
                }`}
              >
                <Check className="h-4 w-4" />
                <span>Confirmar importación</span>
              </button>
              <button
                onClick={handleCancelPredictionImport}
                className="px-5 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-300 transition-all duration-200 cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {predictionStatus === 'IMPORTING' && (
          <div className="flex flex-col items-center justify-center p-8 border border-[#272733] rounded-xl bg-[#0a0a0f]">
            <RefreshCw className="h-8 w-8 text-[#34d399] animate-spin" />
            <span className="text-xs text-zinc-300 font-bold mt-4">Importando pronósticos…</span>
            <span className="text-[10px] text-zinc-500 mt-1">Guardando datos en la base de datos de forma segura</span>
          </div>
        )}

        {predictionStatus === 'SUCCESS' && predictionResult && (
          <div className="p-6 border border-emerald-950/30 rounded-xl bg-emerald-950/5 space-y-5 animate-fade-in">
            <div className="flex items-start space-x-3 text-xs text-emerald-300 font-medium">
              <Check className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-emerald-400">Importación completada</p>
                <p className="text-emerald-400/80 mt-1">{predictionResult.message}</p>
              </div>
            </div>

            {/* Success summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
              <div className="bg-[#0a0a0f] p-3 rounded-lg border border-zinc-900">
                <span className="text-emerald-400 block text-[9px] uppercase font-bold tracking-wider">Creados (Fut)</span>
                <span className="text-base font-black text-zinc-200 mt-1">{predictionResult.createdFutureCount}</span>
              </div>
              <div className="bg-[#0a0a0f] p-3 rounded-lg border border-zinc-900">
                <span className="text-blue-400 block text-[9px] uppercase font-bold tracking-wider">Act. (Fut)</span>
                <span className="text-base font-black text-zinc-200 mt-1">{predictionResult.updatedFutureCount}</span>
              </div>
              <div className="bg-[#0a0a0f] p-3 rounded-lg border border-zinc-900">
                <span className="text-orange-400 block text-[9px] uppercase font-bold tracking-wider">Creados (Hist)</span>
                <span className="text-base font-black text-zinc-200 mt-1">{predictionResult.createdHistoryCount}</span>
              </div>
              <div className="bg-[#0a0a0f] p-3 rounded-lg border border-zinc-900">
                <span className="text-violet-400 block text-[9px] uppercase font-bold tracking-wider">Act. (Hist)</span>
                <span className="text-base font-black text-zinc-200 mt-1">{predictionResult.updatedHistoryCount}</span>
              </div>
              <div className="bg-[#0a0a0f] p-3 rounded-lg border border-zinc-900">
                <span className="text-teal-400 block text-[9px] uppercase font-bold tracking-wider">Recalculados</span>
                <span className="text-base font-black text-zinc-200 mt-1">{predictionResult.recalculatedCount}</span>
              </div>
              <div className="bg-[#0a0a0f] p-3 rounded-lg border border-zinc-900">
                <span className="text-rose-500 block text-[9px] uppercase font-bold tracking-wider">Errores / Inv.</span>
                <span className="text-base font-black text-zinc-200 mt-1">{predictionResult.errorCount}</span>
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                onClick={handleCancelPredictionImport}
                className="px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-300 cursor-pointer transition"
              >
                Finalizar
              </button>
            </div>
          </div>
        )}
      </div>

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

