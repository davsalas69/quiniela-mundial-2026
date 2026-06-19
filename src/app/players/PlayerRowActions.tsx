'use client';

import React, { useState } from 'react';
import { togglePlayerStatusAction, resetPlayerAccessCodeByIdAction } from '@/app/actions';
import { KeyRound, ShieldAlert, ShieldCheck, Eye, Sparkles, X, Info, CheckCircle2, Award, HelpCircle } from 'lucide-react';
import { PlayerStats } from '@/lib/leaderboard';

interface PlayerRowActionsProps {
  player: PlayerStats;
  currentUserId: string;
}

export default function PlayerRowActions({ player, currentUserId }: PlayerRowActionsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Modals state
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Reset code input
  const [newCode, setNewCode] = useState('');

  const handleToggleStatus = async () => {
    if (loading) return;
    
    const confirmMsg = player.isActive
      ? `¿Estás seguro de que deseas desactivar a @${player.username}? Esto invalidará todas sus sesiones activas e impedirá nuevos inicios de sesión.`
      : `¿Deseas activar a @${player.username}? El jugador podrá iniciar sesión nuevamente.`;

    if (!confirm(confirmMsg)) return;

    setLoading(true);
    setError(null);
    try {
      const res = await togglePlayerStatusAction(player.id, !player.isActive);
      if (!res.success) {
        setError(res.message || 'Error al cambiar el estado del jugador.');
      } else {
        alert(player.isActive ? 'Jugador desactivado con éxito.' : 'Jugador activado con éxito.');
      }
    } catch (err) {
      setError('Ocurrió un error inesperado al intentar cambiar el estado del jugador.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setError(null);
    setSuccessMessage(null);

    const code = newCode.trim().toUpperCase();
    if (!code) {
      setError('El nuevo código no puede estar vacío.');
      return;
    }

    setLoading(true);
    try {
      const res = await resetPlayerAccessCodeByIdAction(player.id, code);
      if (!res.success) {
        setError(res.message || 'Error al restablecer el código.');
      } else {
        setSuccessMessage('Código restablecido con éxito. Las sesiones activas del jugador han sido cerradas.');
        setNewCode('');
        setTimeout(() => {
          setResetModalOpen(false);
          setSuccessMessage(null);
        }, 2000);
      }
    } catch (err) {
      setError('Ocurrió un error inesperado al intentar restablecer el código.');
    } finally {
      setLoading(false);
    }
  };

  const isSelf = player.id === currentUserId;

  return (
    <div className="flex items-center space-x-2.5">
      {/* View Stats Button */}
      <button
        onClick={() => setStatsModalOpen(true)}
        className="p-2 bg-zinc-800/40 hover:bg-zinc-850/60 border border-zinc-700/50 hover:border-zinc-650 text-zinc-300 hover:text-white rounded-lg transition-all cursor-pointer"
        title="Ver Estadísticas Detalladas"
      >
        <Eye className="h-4 w-4" />
      </button>

      {/* Reset Code Button */}
      <button
        onClick={() => {
          setError(null);
          setSuccessMessage(null);
          setNewCode('');
          setResetModalOpen(true);
        }}
        className="p-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 text-amber-400 rounded-lg transition-all cursor-pointer"
        title="Restablecer Código de Acceso"
      >
        <KeyRound className="h-4 w-4" />
      </button>

      {/* Toggle Active Button */}
      <button
        onClick={handleToggleStatus}
        disabled={loading || isSelf}
        className={`p-2 border rounded-lg transition-all cursor-pointer ${
          isSelf
            ? 'opacity-40 bg-zinc-850 border-zinc-800 text-zinc-500 cursor-not-allowed'
            : player.isActive
            ? 'bg-red-500/10 hover:bg-red-500/20 border-red-500/20 hover:border-red-500/40 text-red-400'
            : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400'
        }`}
        title={isSelf ? 'No puedes desactivar tu propia cuenta' : player.isActive ? 'Desactivar Cuenta' : 'Activar Cuenta'}
      >
        {player.isActive ? (
          <ShieldAlert className="h-4 w-4" />
        ) : (
          <ShieldCheck className="h-4 w-4" />
        )}
      </button>

      {error && (
        <div className="fixed bottom-4 right-4 z-50 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-bold shadow-2xl animate-fade-in">
          {error}
        </div>
      )}

      {/* STATS MODAL */}
      {statsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#020204]/75 backdrop-blur-md" onClick={() => setStatsModalOpen(false)} />
          <div className="relative w-full max-w-md bg-[#0d0d12] border border-[#21212c] rounded-2xl shadow-2xl p-6 overflow-hidden animate-zoom-in">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-[#6d28d9] to-pink-500"></div>
            
            <button
              onClick={() => setStatsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-zinc-800/40 border border-zinc-700/50 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="text-sm font-black uppercase tracking-wider text-white mb-4">
              Estadísticas de @{player.username}
            </h3>

            <div className="space-y-4">
              {/* Score summary */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-[#12121b] to-[#1a1a26] border border-[#262638] flex justify-between items-center">
                <div>
                  <p className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-widest">Puntos totales</p>
                  <p className="text-3xl font-black text-emerald-400">{player.totalPoints}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-widest">Posición</p>
                  <p className="text-3xl font-black text-white">#{player.position}</p>
                </div>
              </div>

              {/* Grid Breakdown */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-[#13131c] border border-zinc-800/60 rounded-xl text-center">
                  <p className="text-lg font-extrabold text-amber-400">{player.exacts}</p>
                  <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">Exactos Totales</p>
                </div>
                <div className="p-3 bg-[#13131c] border border-zinc-800/60 rounded-xl text-center">
                  <p className="text-lg font-extrabold text-amber-500">{player.exactPenalties}</p>
                  <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">Exactos Penales (8p)</p>
                </div>
                <div className="p-3 bg-[#13131c] border border-zinc-800/60 rounded-xl text-center">
                  <p className="text-lg font-extrabold text-zinc-300">{player.exactNormal}</p>
                  <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">Exactos Normal (6p)</p>
                </div>
                <div className="p-3 bg-[#13131c] border border-zinc-800/60 rounded-xl text-center">
                  <p className="text-lg font-extrabold text-zinc-300">{player.tendencyPlusTotal}</p>
                  <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">Tend + Tot (5p)</p>
                </div>
                <div className="p-3 bg-[#13131c] border border-zinc-800/60 rounded-xl text-center">
                  <p className="text-lg font-extrabold text-zinc-300">{player.tendency}</p>
                  <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">Tendencias (4p)</p>
                </div>
                <div className="p-3 bg-[#13131c] border border-zinc-800/60 rounded-xl text-center">
                  <p className="text-lg font-extrabold text-zinc-300">{player.totalGoals}</p>
                  <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">Solo Goles (1p)</p>
                </div>
              </div>

              {/* Progress and status */}
              <div className="space-y-2 border-t border-[#21212c] pt-4">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-zinc-500">Partidos puntuados</span>
                  <span className="text-zinc-300 font-bold">{player.scoredCount}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-zinc-500">Predicciones pendientes</span>
                  <span className="text-zinc-300 font-bold">{player.pendingCount}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-zinc-500">Predicciones válidas</span>
                  <span className="text-zinc-300 font-bold">{player.validPredictionsCount}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-zinc-500">Fecha de registro</span>
                  <span className="text-zinc-400 font-bold">{player.createdAt.toISOString().split('T')[0]}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RESET CODE MODAL */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#020204]/75 backdrop-blur-md" onClick={() => setResetModalOpen(false)} />
          <div className="relative w-full max-w-sm bg-[#0d0d12] border border-[#21212c] rounded-2xl shadow-2xl p-6 overflow-hidden animate-zoom-in">
            <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>
            
            <button
              onClick={() => setResetModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-zinc-800/40 border border-zinc-700/50 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="text-sm font-black uppercase tracking-wider text-white mb-2">
              Restablecer Código
            </h3>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Define un nuevo código de acceso para <strong>@{player.username}</strong>. Todas sus sesiones actuales se cerrarán inmediatamente.
            </p>

            {successMessage ? (
              <div className="py-6 flex flex-col items-center justify-center text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 animate-bounce" />
                <h4 className="text-xs font-black text-white uppercase">Código Actualizado</h4>
                <p className="text-[11px] text-zinc-400">{successMessage}</p>
              </div>
            ) : (
              <form onSubmit={handleResetCode} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold uppercase text-zinc-500 tracking-wider">
                    Nuevo Código de Acceso
                  </label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="Ej: PEDRO2026 (4-12 carac.)"
                    className="w-full bg-[#14141d] border border-[#272737] rounded-xl px-3.5 py-2.5 text-xs font-bold text-white uppercase tracking-wider focus:outline-none focus:border-amber-500"
                    maxLength={12}
                    required
                    autoFocus
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl text-red-400 text-xs font-semibold">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase tracking-wider text-xs py-3 rounded-xl transition-all shadow-lg cursor-pointer"
                >
                  {loading ? 'Procesando...' : 'Cambiar Código'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
