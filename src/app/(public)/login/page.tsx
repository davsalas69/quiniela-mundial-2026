'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trophy, User, Lock, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { loginAction } from '../../actions';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    try {
      const res = await loginAction(formData);
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
    <div className="min-h-screen flex items-center justify-center bg-[#07070b] px-4">
      <div className="w-full max-w-md glass glow-primary rounded-2xl p-8 space-y-8 animate-fade-in">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-[#6d28d9]/20 rounded-2xl text-[#a78bfa] border border-[#6d28d9]/40 glow-primary mb-2">
            <Trophy className="h-8 w-8 animate-pulse" />
          </div>
          <h2 className="text-2xl font-black tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            Iniciar Sesión
          </h2>
          <p className="text-sm text-zinc-400">
            Ingresa a tu panel de la Quiniela Mundial 2026.
          </p>
        </div>

        {/* Mensajes de Alerta */}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start space-x-3">
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-4 rounded-xl bg-[#10b981]/10 border border-[#10b981]/20 text-[#10b981]/90 text-sm flex items-start space-x-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
            <span>Sesión iniciada. Redirigiendo...</span>
          </div>
        )}

        {/* Formulario */}
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
                placeholder="Ingresa tu usuario"
                className="w-full bg-[#13131a] border border-[#1e1e24] focus:border-[#6d28d9] focus:ring-1 focus:ring-[#6d28d9] rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-600 outline-none transition-all duration-200"
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
                placeholder="Ingresa tu contraseña"
                className="w-full bg-[#13131a] border border-[#1e1e24] focus:border-[#6d28d9] focus:ring-1 focus:ring-[#6d28d9] rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-600 outline-none transition-all duration-200"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || success}
            className="w-full bg-gradient-to-r from-[#6d28d9] to-[#8b5cf6] hover:from-[#7c3aed] hover:to-[#a78bfa] disabled:opacity-50 text-white font-bold py-3.5 px-4 rounded-xl text-sm transition-all duration-200 glow-primary cursor-pointer"
          >
            {loading ? 'Accediendo...' : 'Iniciar Sesión'}
          </button>
        </form>

        {/* Footer */}
        <div className="text-center pt-2">
          <p className="text-xs text-zinc-500">
            ¿No tienes cuenta?{' '}
            <Link
              href="/register"
              className="text-[#a78bfa] hover:text-[#c084fc] font-semibold transition-colors duration-200"
            >
              Regístrate aquí
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
