'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trophy, User, Lock, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { loginAdminAction } from '../../../actions';

export default function AdminLoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    try {
      const res = await loginAdminAction(formData);
      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          window.location.href = '/';
        }, 1000);
      } else {
        setError(res.message || 'Usuario o contraseña incorrectos.');
      }
    } catch (err) {
      setError('Ocurrió un error inesperado al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#07070b] px-4 w-full">
      <div className="w-full max-w-md bg-[#0d0d12] border border-[#21212c] rounded-2xl p-8 space-y-8 shadow-2xl relative overflow-hidden animate-zoom-in">
        {/* Glow Effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent"></div>
        <div className="absolute -top-16 -right-16 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl"></div>

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-amber-500/10 rounded-2xl text-amber-500 border border-amber-500/20 glow-warning mb-2">
            <Trophy className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-black tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            Acceso Administrativo
          </h2>
          <p className="text-sm text-zinc-400">
            Iniciar sesión como administrador de la quiniela.
          </p>
        </div>

        {/* Alert Messages */}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start space-x-3">
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-4 rounded-xl bg-[#10b981]/10 border border-[#10b981]/20 text-[#10b981]/90 text-sm flex items-start space-x-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
            <span>Sesión administrativa iniciada. Redirigiendo...</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
              Nombre de Usuario
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500">
                <User className="h-4 w-4" />
              </span>
              <input
                type="text"
                name="username"
                required
                placeholder="Usuario administrador"
                className="w-full bg-[#14141d] border border-[#272737] focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-600 outline-none transition-all duration-200"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
              Contraseña
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500">
                <Lock className="h-4 w-4" />
              </span>
              <input
                type="password"
                name="password"
                required
                placeholder="Contraseña del administrador"
                className="w-full bg-[#14141d] border border-[#272737] focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-600 outline-none transition-all duration-200"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || success}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 text-white font-black py-3.5 px-4 rounded-xl text-sm transition-all duration-200 cursor-pointer shadow-lg shadow-amber-500/10"
          >
            {loading ? 'Accediendo...' : 'Iniciar Sesión Admin'}
          </button>
        </form>

        {/* Footer */}
        <div className="text-center pt-2">
          <Link
            href="/"
            className="text-xs text-[#a78bfa] hover:text-[#c084fc] font-semibold transition-colors duration-200"
          >
            Volver al Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
