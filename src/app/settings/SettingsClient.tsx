'use client';

import { useState, useTransition } from 'react';
import { 
  recalculateAllScoresAction, 
  clearSimulatedResultsAction, 
  seedMatchesAction,
  createMatchAction,
  updateMatchAction,
  deleteMatchAction,
  exportDataAction,
  syncTournamentAction,
  compareExcelBackupAction
} from '../actions';
import { 
  RefreshCw, 
  Trash2, 
  Database, 
  Download, 
  Plus, 
  Edit3, 
  Trash, 
  X, 
  Check, 
  Calendar,
  AlertTriangle
} from 'lucide-react';

interface Match {
  id: string;
  stage: string;
  groupName: string | null;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string | Date | null;
}

export default function SettingsClient({ 
  initialMatches,
  initialLastSyncLog,
  isApiKeyConfigured
}: { 
  initialMatches: Match[];
  initialLastSyncLog: any;
  isApiKeyConfigured: boolean;
}) {
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [isPending, startTransition] = useTransition();

  const [lastSyncLog, setLastSyncLog] = useState<any>(initialLastSyncLog);
  const [excelReport, setExcelReport] = useState<any>(null);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [syncLoadingType, setSyncLoadingType] = useState<string | null>(null);

  const handleSync = (type: 'FULL' | 'DAILY' | 'LIVE' | 'MANUAL') => {
    setSyncLoadingType(type);
    startTransition(async () => {
      try {
        const res = await syncTournamentAction(type);
        if (res.success) {
          alert('Sincronización completada: ' + res.message);
          window.location.reload();
        } else {
          alert('Fallo en sincronización: ' + res.message);
          window.location.reload();
        }
      } catch (err: any) {
        alert('Error: ' + err.message);
      } finally {
        setSyncLoadingType(null);
      }
    });
  };

  const handleCompareExcel = () => {
    startTransition(async () => {
      try {
        const res = await compareExcelBackupAction();
        if (res.success) {
          setExcelReport(res.report);
          setExcelError(null);
        } else {
          setExcelError(res.message || 'Error desconocido');
          setExcelReport(null);
        }
      } catch (err: any) {
        setExcelError(err.message || 'Error al conectar con el servidor');
        setExcelReport(null);
      }
    });
  };

  // Estado para la creación de un nuevo partido
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMatch, setNewMatch] = useState({
    stage: 'GROUP_STAGE',
    groupName: '',
    homeTeam: '',
    awayTeam: '',
    kickoffAt: '',
  });

  // Estado para la edición de partidos
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    stage: 'GROUP_STAGE',
    groupName: '',
    homeTeam: '',
    awayTeam: '',
    kickoffAt: '',
  });

  // Acciones de Base de Datos
  const handleRecalculate = () => {
    if (!confirm('¿Deseas recalcular todos los puntajes en base a las predicciones y resultados actuales?')) return;
    startTransition(async () => {
      await recalculateAllScoresAction();
      alert('Puntajes recalculados con éxito.');
      window.location.reload();
    });
  };

  const handleClearSimulated = () => {
    if (!confirm('¿Deseas borrar todas las proyecciones simuladas? Los partidos volverán a su estado programado.')) return;
    startTransition(async () => {
      await clearSimulatedResultsAction();
      alert('Resultados simulados eliminados.');
      window.location.reload();
    });
  };

  const handleResetSeed = () => {
    if (!confirm('¡ATENCIÓN! Esto borrará todas tus predicciones y resultados actuales y restaurará los datos semilla de ejemplo. ¿Deseas continuar?')) return;
    startTransition(async () => {
      await seedMatchesAction();
      alert('Base de datos restaurada con datos semilla de ejemplo.');
      window.location.reload();
    });
  };

  const handleExport = async () => {
    try {
      const dataStr = await exportDataAction();
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const exportFileDefaultName = `quiniela_2026_backup_${new Date().toISOString().split('T')[0]}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    } catch (err) {
      console.error(err);
      alert('Error al exportar datos.');
    }
  };

  // CRUD: Crear Partido
  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatch.homeTeam || !newMatch.awayTeam) {
      alert('Debes ingresar los nombres de ambos equipos.');
      return;
    }

    startTransition(async () => {
      try {
        const created = await createMatchAction({
          stage: newMatch.stage,
          groupName: newMatch.stage === 'GROUP_STAGE' ? newMatch.groupName : undefined,
          homeTeam: newMatch.homeTeam,
          awayTeam: newMatch.awayTeam,
          kickoffAt: newMatch.kickoffAt || undefined,
        });

        alert('Partido creado con éxito.');
        setShowAddForm(false);
        setNewMatch({
          stage: 'GROUP_STAGE',
          groupName: '',
          homeTeam: '',
          awayTeam: '',
          kickoffAt: '',
        });
        window.location.reload();
      } catch (err) {
        console.error(err);
        alert('Error al crear el partido.');
      }
    });
  };

  // CRUD: Iniciar Edición
  const startEditing = (m: Match) => {
    setEditingId(m.id);
    // Convertir Date a string compatible con input datetime-local
    let kickoffStr = '';
    if (m.kickoffAt) {
      const d = new Date(m.kickoffAt);
      // Ajustar a zona horaria local para el formato input
      const tzOffset = d.getTimezoneOffset() * 60000;
      kickoffStr = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
    }

    setEditForm({
      stage: m.stage,
      groupName: m.groupName ?? '',
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      kickoffAt: kickoffStr,
    });
  };

  // CRUD: Guardar Edición
  const handleUpdateMatch = async (id: string) => {
    if (!editForm.homeTeam || !editForm.awayTeam) {
      alert('Los nombres de los equipos son obligatorios.');
      return;
    }

    startTransition(async () => {
      try {
        await updateMatchAction(id, {
          stage: editForm.stage,
          groupName: editForm.stage === 'GROUP_STAGE' ? editForm.groupName : undefined,
          homeTeam: editForm.homeTeam,
          awayTeam: editForm.awayTeam,
          kickoffAt: editForm.kickoffAt || undefined,
        });

        alert('Partido actualizado.');
        setEditingId(null);
        window.location.reload();
      } catch (err) {
        console.error(err);
        alert('Error al actualizar el partido.');
      }
    });
  };

  // CRUD: Eliminar
  const handleDeleteMatch = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este partido permanentemente? Se borrarán sus predicciones y puntajes asociados.')) return;

    startTransition(async () => {
      try {
        await deleteMatchAction(id);
        alert('Partido eliminado.');
        window.location.reload();
      } catch (err) {
        console.error(err);
        alert('Error al eliminar el partido.');
      }
    });
  };

  const stagesOptions = [
    { value: 'GROUP_STAGE', label: 'Fase de Grupos' },
    { value: 'ROUND_OF_32', label: 'Dieciseisavos de Final' },
    { value: 'ROUND_OF_16', label: 'Octavos de Final' },
    { value: 'QUARTER_FINAL', label: 'Cuartos de Final' },
    { value: 'SEMI_FINAL', label: 'Semifinal' },
    { value: 'THIRD_PLACE', label: 'Tercer Puesto' },
    { value: 'FINAL', label: 'Final' },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* DB Utility Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Card: Recalculate */}
        <div className="p-6 rounded-2xl bg-[#0f0f15]/85 border border-[#1e1e24] flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-extrabold text-sm text-zinc-100 flex items-center space-x-2">
              <RefreshCw className="h-4 w-4 text-[#a78bfa]" />
              <span>Recalcular Puntos</span>
            </h3>
            <p className="text-xs text-zinc-500 mt-2 font-medium">
              Sincroniza y recalcula idempotentemente todas las predicciones contra los marcadores de los partidos.
            </p>
          </div>
          <button
            onClick={handleRecalculate}
            disabled={isPending}
            className="w-full py-2 rounded-lg bg-[#1e1e2a] hover:bg-zinc-800 text-xs font-bold text-[#a78bfa] border border-[#272733] transition-all duration-200 cursor-pointer"
          >
            Ejecutar Recálculo
          </button>
        </div>

        {/* Card: Clear Simulation */}
        <div className="p-6 rounded-2xl bg-[#0f0f15]/85 border border-[#1e1e24] flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-extrabold text-sm text-zinc-100 flex items-center space-x-2">
              <Trash2 className="h-4 w-4 text-amber-500" />
              <span>Borrar Simulaciones</span>
            </h3>
            <p className="text-xs text-zinc-500 mt-2 font-medium">
              Elimina todos los marcadores marcados como simulaciones para restaurar el tablero a su estado oficial.
            </p>
          </div>
          <button
            onClick={handleClearSimulated}
            disabled={isPending}
            className="w-full py-2 rounded-lg bg-[#1e1e2a] hover:bg-zinc-800 text-xs font-bold text-amber-500 border border-[#272733] transition-all duration-200 cursor-pointer"
          >
            Limpiar Proyecciones
          </button>
        </div>

        {/* Card: Export */}
        <div className="p-6 rounded-2xl bg-[#0f0f15]/85 border border-[#1e1e24] flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-extrabold text-sm text-zinc-100 flex items-center space-x-2">
              <Download className="h-4 w-4 text-emerald-500" />
              <span>Exportar Datos</span>
            </h3>
            <p className="text-xs text-zinc-500 mt-2 font-medium">
              Descarga una copia de seguridad en formato JSON de tus predicciones, partidos y puntajes.
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={isPending}
            className="w-full py-2 rounded-lg bg-[#1e1e2a] hover:bg-zinc-800 text-xs font-bold text-emerald-400 border border-[#272733] transition-all duration-200 cursor-pointer"
          >
            Exportar Backup
          </button>
        </div>

        {/* Card: Reset Database */}
        <div className="p-6 rounded-2xl bg-[#0f0f15]/85 border border-[#1e1e24] flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-extrabold text-sm text-zinc-100 flex items-center space-x-2">
              <Database className="h-4 w-4 text-rose-500" />
              <span>Restaurar Semilla</span>
            </h3>
            <p className="text-xs text-zinc-500 mt-2 font-medium">
              Restablece la base de datos a su estado de demostración predeterminado con partidos cargados.
            </p>
          </div>
          <button
            onClick={handleResetSeed}
            disabled={isPending}
            className="w-full py-2 rounded-lg bg-rose-950/20 hover:bg-rose-950/40 text-xs font-bold text-rose-400 border border-rose-950/30 transition-all duration-200 cursor-pointer"
          >
            Restaurar BD
          </button>
        </div>

      </div>

      {/* 2026 World Cup Sync Section */}
      <div className="p-6 rounded-2xl bg-[#0f0f15]/75 border border-[#1e1e24] space-y-6">
        <div>
          <h3 className="font-extrabold text-lg tracking-tight flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-[#6d28d9]/10 text-[#a78bfa]">
              <RefreshCw className="h-5 w-5" />
            </span>
            <span>Sincronización del Mundial 2026</span>
          </h3>
          <p className="text-xs text-zinc-500 mt-1 font-medium">
            Sincroniza automáticamente los partidos, horarios y resultados oficiales de la API de API-Football.
          </p>
        </div>

        {/* API Key Status Check */}
        {!isApiKeyConfigured && (
          <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-900/30 flex items-start space-x-3 text-xs text-amber-300 font-medium">
            <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-500" />
            <div>
              <p className="font-bold">API Key Ausente / No Configurada</p>
              <p className="text-amber-400/80 mt-1">
                La variable de entorno <code className="bg-[#13131a] px-1.5 py-0.5 rounded text-amber-300 font-mono">API_FOOTBALL_KEY</code> no está presente en el servidor.
                Deberás configurarla en Vercel o en tu archivo local para habilitar la importación en tiempo real.
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5">
          <button
            onClick={() => handleSync('FULL')}
            disabled={isPending || !isApiKeyConfigured}
            className="px-4 py-2.5 rounded-lg bg-[#6d28d9]/15 hover:bg-[#6d28d9]/25 disabled:bg-zinc-900/45 disabled:text-zinc-600 disabled:border-zinc-800/40 border border-[#6d28d9]/30 text-xs font-bold text-[#a78bfa] transition-all duration-200 cursor-pointer flex items-center justify-center space-x-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncLoadingType === 'FULL' ? 'animate-spin' : ''}`} />
            <span>Calendario Completo</span>
          </button>

          <button
            onClick={() => handleSync('MANUAL')}
            disabled={isPending || !isApiKeyConfigured}
            className="px-4 py-2.5 rounded-lg bg-emerald-950/20 hover:bg-emerald-950/40 disabled:bg-zinc-900/45 disabled:text-zinc-600 disabled:border-zinc-800/40 border border-emerald-900/30 text-xs font-bold text-emerald-400 transition-all duration-200 cursor-pointer flex items-center justify-center space-x-1.5"
          >
            <Check className={`h-3.5 w-3.5 ${syncLoadingType === 'MANUAL' ? 'animate-pulse' : ''}`} />
            <span>Actualizar Resultados</span>
          </button>

          <button
            onClick={() => handleSync('DAILY')}
            disabled={isPending || !isApiKeyConfigured}
            className="px-4 py-2.5 rounded-lg bg-blue-950/20 hover:bg-blue-950/40 disabled:bg-zinc-900/45 disabled:text-zinc-600 disabled:border-zinc-800/40 border border-blue-900/30 text-xs font-bold text-blue-400 transition-all duration-200 cursor-pointer flex items-center justify-center space-x-1.5"
          >
            <Calendar className={`h-3.5 w-3.5 ${syncLoadingType === 'DAILY' ? 'animate-pulse' : ''}`} />
            <span>Partidos de Hoy</span>
          </button>

          <button
            onClick={() => handleSync('LIVE')}
            disabled={isPending || !isApiKeyConfigured}
            className="px-4 py-2.5 rounded-lg bg-rose-950/20 hover:bg-rose-950/40 disabled:bg-zinc-900/45 disabled:text-zinc-600 disabled:border-zinc-800/40 border border-rose-950/30 text-xs font-bold text-rose-400 transition-all duration-200 cursor-pointer flex items-center justify-center space-x-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncLoadingType === 'LIVE' ? 'animate-spin' : ''}`} />
            <span>Partidos en Vivo</span>
          </button>

          <button
            onClick={handleCompareExcel}
            disabled={isPending}
            className="px-4 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 text-xs font-bold text-zinc-300 transition-all duration-200 cursor-pointer flex items-center justify-center space-x-1.5"
          >
            <Database className="h-3.5 w-3.5" />
            <span>Comparar Excel</span>
          </button>
        </div>

        {/* Last Sync Logs Summary */}
        <div className="p-5 rounded-xl bg-[#13131a] border border-[#1e1e24] space-y-4">
          <div className="flex justify-between items-center text-xs font-bold border-b border-zinc-800 pb-3">
            <span className="text-zinc-400 uppercase tracking-wider">Historial de Sincronización</span>
            <span className="text-zinc-500">Último Log</span>
          </div>

          {lastSyncLog ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-zinc-500">Fecha y Hora:</span>
                <p className="font-extrabold text-zinc-200">
                  {new Date(lastSyncLog.startedAt).toLocaleString('es-ES')}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-zinc-500">Método / Estado:</span>
                <p className="flex items-center space-x-1.5 font-extrabold">
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    {lastSyncLog.syncType}
                  </span>
                  <span className={`px-2 py-0.5 rounded font-black ${
                    lastSyncLog.status === 'SUCCESS' 
                      ? 'bg-emerald-950/40 text-emerald-400' 
                      : lastSyncLog.status === 'FAILED'
                      ? 'bg-rose-950/40 text-rose-400'
                      : 'bg-amber-950/40 text-amber-400'
                  }`}>
                    {lastSyncLog.status}
                  </span>
                </p>
              </div>

              <div className="space-y-1 col-span-2">
                <span className="text-zinc-500">Resumen de Registros:</span>
                <p className="text-zinc-300 font-medium">
                  Creados: <span className="font-extrabold text-emerald-400">{lastSyncLog.createdCount}</span> • 
                  Actualizados: <span className="font-extrabold text-blue-400">{lastSyncLog.updatedCount}</span> • 
                  Ignorados: <span className="font-extrabold text-zinc-500">{lastSyncLog.skippedCount}</span> • 
                  Errores: <span className="font-extrabold text-rose-400">{lastSyncLog.errorCount}</span>
                </p>
              </div>

              {lastSyncLog.message && (
                <div className="col-span-full pt-2 mt-2 border-t border-dashed border-zinc-800/50">
                  <span className="text-zinc-500 block mb-1">Detalle del Log:</span>
                  <p className="font-mono text-[10px] text-zinc-400 bg-[#0f0f15] p-2.5 rounded border border-zinc-900 select-all">
                    {lastSyncLog.message}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4 text-xs text-zinc-500 font-medium">
              No se han registrado ejecuciones de sincronización.
            </div>
          )}
        </div>

        {/* Excel Comparison Report */}
        {(excelReport || excelError) && (
          <div className="p-5 rounded-xl bg-[#13131a] border border-[#1e1e24] space-y-4 animate-fade-in">
            <div className="flex justify-between items-center text-xs font-bold border-b border-zinc-800 pb-3">
              <span className="text-zinc-400 uppercase tracking-wider">Reporte de Validación de Respaldo Excel</span>
              <button 
                onClick={() => { setExcelReport(null); setExcelError(null); }}
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {excelError && (
              <div className="p-3.5 rounded-lg bg-rose-950/20 border border-rose-900/30 text-xs text-rose-300 font-medium flex items-center space-x-2">
                <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                <span>Error de validación: {excelError}</span>
              </div>
            )}

            {excelReport && (
              <div className="space-y-4 text-xs">
                {/* Stats grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-[#0f0f15] p-3 rounded-lg border border-zinc-900">
                    <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Total Excel (Grupos)</span>
                    <span className="text-lg font-black text-white">{excelReport.excelGroupMatchesCount}</span>
                  </div>
                  <div className="bg-[#0f0f15] p-3 rounded-lg border border-zinc-900">
                    <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Encontrados en BD</span>
                    <span className="text-lg font-black text-emerald-400">{excelReport.matchedCount}</span>
                  </div>
                  <div className="bg-[#0f0f15] p-3 rounded-lg border border-zinc-900">
                    <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Faltantes en BD</span>
                    <span className={`text-lg font-black ${excelReport.missingInApi.length > 0 ? 'text-rose-400' : 'text-zinc-400'}`}>
                      {excelReport.missingInApi.length}
                    </span>
                  </div>
                  <div className="bg-[#0f0f15] p-3 rounded-lg border border-zinc-900">
                    <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Fase Final (Excluidos)</span>
                    <span className="text-lg font-black text-zinc-400">{excelReport.finalStageMatchesCount}</span>
                  </div>
                </div>

                {/* Differences List */}
                {excelReport.differences.length > 0 ? (
                  <div className="space-y-2.5">
                    <span className="text-zinc-400 font-bold block">Diferencias detectadas ({excelReport.differences.length}):</span>
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {excelReport.differences.map((diff: any, idx: number) => (
                        <div key={idx} className="p-3 rounded-lg bg-[#0f0f15] border border-zinc-900/60 space-y-1.5">
                          <div className="flex justify-between items-center font-bold text-[11px] text-zinc-300">
                            <span>Juego #{diff.matchNumber || (idx + 1)} • {diff.excelMatch.homeTeam} vs {diff.excelMatch.awayTeam}</span>
                            <span className="text-amber-500 font-extrabold uppercase text-[10px]">Diferencia</span>
                          </div>
                          <ul className="list-disc pl-4 space-y-1 text-zinc-500 text-[10px]">
                            {diff.diffs.map((d: string, dIdx: number) => (
                              <li key={dIdx} className="text-amber-400/95">{d}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/30 text-emerald-400 font-semibold text-center flex items-center justify-center space-x-2">
                    <Check className="h-4 w-4" />
                    <span>¡Todos los partidos del Excel coinciden perfectamente con los registros de la base de datos!</span>
                  </div>
                )}

                {/* Missing matches list */}
                {excelReport.missingInApi.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-rose-400 font-bold block">Partidos del Excel no encontrados en la base de datos:</span>
                    <div className="space-y-1 bg-[#0f0f15] p-3 rounded-lg border border-zinc-900 max-h-40 overflow-y-auto pr-1">
                      {excelReport.missingInApi.map((m: any, idx: number) => (
                        <div key={idx} className="flex justify-between py-1 border-b border-zinc-900/50 last:border-b-0 text-[11px]">
                          <span className="font-bold text-zinc-300">{m.homeTeam} vs {m.awayTeam}</span>
                          <span className="text-zinc-500 font-medium">{m.groupName || 'Fase de Grupos'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual Match CRUD Title & Button */}
      <div className="p-6 rounded-2xl bg-[#0f0f15]/75 border border-[#1e1e24] space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-extrabold text-lg tracking-tight">Gestión Manual de Partidos</h3>
            <p className="text-xs text-zinc-500 font-medium">Añade, edita o elimina los partidos del calendario.</p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 rounded-lg bg-[#6d28d9] hover:bg-[#5b21b6] text-xs font-bold flex items-center space-x-1 transition-all duration-200 cursor-pointer"
          >
            {showAddForm ? <X className="h-4.5 w-4.5" /> : <Plus className="h-4.5 w-4.5" />}
            <span>{showAddForm ? 'Cerrar' : 'Agregar Partido'}</span>
          </button>
        </div>

        {/* Add Match Form */}
        {showAddForm && (
          <form onSubmit={handleCreateMatch} className="p-5 rounded-xl bg-[#13131a] border border-[#1e1e24] grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 font-bold uppercase">Fase del Torneo</label>
              <select
                value={newMatch.stage}
                onChange={(e) => setNewMatch({...newMatch, stage: e.target.value})}
                className="w-full p-2 rounded bg-[#0f0f15] border border-[#1e1e24] text-xs text-white"
              >
                {stagesOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {newMatch.stage === 'GROUP_STAGE' && (
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-bold uppercase">Grupo</label>
                <input
                  type="text"
                  placeholder="Ej. Grupo A"
                  value={newMatch.groupName}
                  onChange={(e) => setNewMatch({...newMatch, groupName: e.target.value})}
                  className="w-full p-2 rounded bg-[#0f0f15] border border-[#1e1e24] text-xs text-white"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 font-bold uppercase">Local (Home Team)</label>
              <input
                type="text"
                placeholder="Equipo Local"
                value={newMatch.homeTeam}
                onChange={(e) => setNewMatch({...newMatch, homeTeam: e.target.value})}
                className="w-full p-2 rounded bg-[#0f0f15] border border-[#1e1e24] text-xs text-white"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 font-bold uppercase">Visitante (Away Team)</label>
              <input
                type="text"
                placeholder="Equipo Visitante"
                value={newMatch.awayTeam}
                onChange={(e) => setNewMatch({...newMatch, awayTeam: e.target.value})}
                className="w-full p-2 rounded bg-[#0f0f15] border border-[#1e1e24] text-xs text-white"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 font-bold uppercase">Fecha y Hora</label>
              <input
                type="datetime-local"
                value={newMatch.kickoffAt}
                onChange={(e) => setNewMatch({...newMatch, kickoffAt: e.target.value})}
                className="w-full p-2 rounded bg-[#0f0f15] border border-[#1e1e24] text-xs text-white"
              />
            </div>

            <div className="md:col-span-3 flex justify-end space-x-2 pt-2">
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center space-x-1"
              >
                <Check className="h-4 w-4" />
                <span>Crear Partido</span>
              </button>
            </div>
          </form>
        )}

        {/* Matches CRUD list */}
        <div className="space-y-3">
          {matches.map((m) => {
            const isEditing = editingId === m.id;

            return (
              <div 
                key={m.id}
                className="p-4 rounded-xl bg-[#13131a] border border-[#1e1e24] flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {isEditing ? (
                  /* Editing Mode Form */
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <select
                      value={editForm.stage}
                      onChange={(e) => setEditForm({...editForm, stage: e.target.value})}
                      className="p-1.5 rounded bg-[#0f0f15] border border-[#1e1e24] text-xs text-white"
                    >
                      {stagesOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>

                    {editForm.stage === 'GROUP_STAGE' && (
                      <input
                        type="text"
                        placeholder="Grupo"
                        value={editForm.groupName}
                        onChange={(e) => setEditForm({...editForm, groupName: e.target.value})}
                        className="p-1.5 rounded bg-[#0f0f15] border border-[#1e1e24] text-xs text-white"
                      />
                    )}

                    <input
                      type="text"
                      placeholder="Local"
                      value={editForm.homeTeam}
                      onChange={(e) => setEditForm({...editForm, homeTeam: e.target.value})}
                      className="p-1.5 rounded bg-[#0f0f15] border border-[#1e1e24] text-xs text-white"
                    />

                    <input
                      type="text"
                      placeholder="Visitante"
                      value={editForm.awayTeam}
                      onChange={(e) => setEditForm({...editForm, awayTeam: e.target.value})}
                      className="p-1.5 rounded bg-[#0f0f15] border border-[#1e1e24] text-xs text-white"
                    />

                    <input
                      type="datetime-local"
                      value={editForm.kickoffAt}
                      onChange={(e) => setEditForm({...editForm, kickoffAt: e.target.value})}
                      className="p-1.5 rounded bg-[#0f0f15] border border-[#1e1e24] text-xs text-white"
                    />
                  </div>
                ) : (
                  /* Display Match Mode */
                  <div className="flex-1 flex flex-col md:flex-row md:items-center gap-4 text-xs">
                    <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                      {m.stage.replace('_', ' ')} {m.groupName ? `(${m.groupName})` : ''}
                    </span>
                    <div className="flex items-center space-x-2 font-extrabold text-zinc-200">
                      <span>{m.homeTeam}</span>
                      <span className="text-zinc-500 font-normal">vs</span>
                      <span>{m.awayTeam}</span>
                    </div>
                    {m.kickoffAt && (
                      <span className="text-zinc-500 font-medium flex items-center space-x-1">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{new Date(m.kickoffAt).toLocaleDateString()} {new Date(m.kickoffAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Edit and Delete Actions */}
                <div className="flex items-center space-x-2 self-end md:self-auto">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => handleUpdateMatch(m.id)}
                        disabled={isPending}
                        className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                        title="Guardar cambios"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
                        title="Cancelar"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEditing(m)}
                        className="p-1.5 rounded bg-[#1e1e2a] hover:bg-zinc-800 text-zinc-400 hover:text-white border border-[#272733]"
                        title="Editar partido"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteMatch(m.id)}
                        className="p-1.5 rounded bg-[#1e1e2a] hover:bg-zinc-800 text-rose-500 hover:text-rose-400 border border-[#272733]"
                        title="Eliminar partido"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
