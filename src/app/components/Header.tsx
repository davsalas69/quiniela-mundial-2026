'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { logoutAction, changeAccessCodeAction } from '@/app/actions';
import {
  User,
  ChevronDown,
  Download,
  KeyRound,
  UserCheck,
  LogOut,
  ShieldAlert,
  FileText,
  Settings,
  LayoutDashboard,
  Trophy,
  X,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import Link from 'next/link';

export default function Header() {
  const { user, openAuthModal, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [changeCodeOpen, setChangeCodeOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async (e: React.FormEvent) => {
    e.preventDefault();
    setDropdownOpen(false);
    await logout();
  };

  return (
    <>
      <header className="flex justify-between items-center py-4 px-6 bg-[#0f0f15]/40 border border-[#1e1e24]/60 rounded-2xl backdrop-blur-md mb-6 relative z-30">
        {/* Title or Logo in mobile/desktop header */}
        <div className="flex items-center space-x-2.5">
          <div className="md:hidden p-1.5 bg-[#6d28d9]/10 rounded-lg text-[#a78bfa] border border-[#6d28d9]/30">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h1 className="md:hidden font-black text-sm tracking-widest text-white uppercase">
              <span>Quiniela </span>
              <span className="text-[#F26424]">El Pilar</span>
              <span> 2026</span>
            </h1>
            <span className="hidden md:inline-block text-xs font-extrabold uppercase tracking-widest text-zinc-500">
              Copa del Mundo FIFA 2026
            </span>
          </div>
        </div>

        {/* User control / Auth Button */}
        <div className="relative" ref={dropdownRef}>
          {user ? (
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center space-x-2 px-3 py-1.5 bg-[#14141d] hover:bg-[#1c1c28] border border-[#272737] rounded-xl text-sm font-bold text-white transition-all cursor-pointer"
            >
              {user.role === 'ADMIN' ? (
                <ShieldAlert className="h-4 w-4 text-amber-500" />
              ) : (
                <User className="h-4 w-4 text-[#a78bfa]" />
              )}
              <span className="max-w-32 truncate">
                {user.role === 'ADMIN' ? 'Administrador' : `@${user.username}`}
              </span>
              <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>
          ) : (
            <button
              onClick={() => openAuthModal(undefined, 'register')}
              className="px-4 py-2 bg-[#6d28d9] hover:bg-[#5b21b6] text-xs font-black uppercase tracking-wider text-white rounded-xl shadow-lg shadow-[#6d28d9]/15 transition-all cursor-pointer"
            >
              Entrar como jugador
            </button>
          )}

          {/* Dropdown Menu */}
          {user && dropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[#0f0f15] border border-[#21212c] shadow-2xl py-1.5 z-40 overflow-hidden animate-zoom-in">
              <div className="px-4 py-2 border-b border-[#1c1c26]/60 mb-1">
                <p className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-widest">Identidad</p>
                <p className="text-xs font-black text-white truncate mt-0.5">
                  {user.role === 'ADMIN' ? 'Admin' : `@${user.username}`}
                </p>
              </div>

              {/* USER specific items */}
              {user.role === 'USER' && (
                <>
                  <Link
                    href="/"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center space-x-2 px-4 py-2 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-800/40 transition-colors"
                  >
                    <LayoutDashboard className="h-4 w-4 text-zinc-500" />
                    <span>Mi Quiniela</span>
                  </Link>

                  <a
                    href="/api/predictions/template"
                    onClick={() => setDropdownOpen(false)}
                    download
                    className="flex items-center space-x-2 px-4 py-2 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-800/40 transition-colors"
                  >
                    <Download className="h-4 w-4 text-zinc-500" />
                    <span>Descargar plantilla</span>
                  </a>

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      setChangeCodeOpen(true);
                    }}
                    className="w-full flex items-center space-x-2 px-4 py-2 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-800/40 transition-colors text-left cursor-pointer"
                  >
                    <KeyRound className="h-4 w-4 text-zinc-500" />
                    <span>Cambiar código</span>
                  </button>

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      openAuthModal(undefined, 'login');
                    }}
                    className="w-full flex items-center space-x-2 px-4 py-2 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-800/40 transition-colors text-left cursor-pointer"
                  >
                    <UserCheck className="h-4 w-4 text-zinc-500" />
                    <span>Cambiar jugador</span>
                  </button>
                </>
              )}

              {/* ADMIN specific items */}
              {user.role === 'ADMIN' && (
                <>
                  <Link
                    href="/"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center space-x-2 px-4 py-2 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-800/40 transition-colors"
                  >
                    <LayoutDashboard className="h-4 w-4 text-zinc-500" />
                    <span>Dashboard</span>
                  </Link>

                  <Link
                    href="/results"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center space-x-2 px-4 py-2 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-800/40 transition-colors"
                  >
                    <FileText className="h-4 w-4 text-zinc-500" />
                    <span>Cargar Resultados</span>
                  </Link>

                  <Link
                    href="/settings"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center space-x-2 px-4 py-2 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-800/40 transition-colors"
                  >
                    <Settings className="h-4 w-4 text-zinc-500" />
                    <span>Configuración</span>
                  </Link>
                </>
              )}

              {/* Divider */}
              <div className="border-t border-[#1c1c26]/60 my-1"></div>

              {/* Logout form */}
              <form onSubmit={handleLogout}>
                <button
                  type="submit"
                  className="w-full flex items-center space-x-2 px-4 py-2 text-xs font-extrabold text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors text-left cursor-pointer"
                >
                  <LogOut className="h-4 w-4 text-red-500" />
                  <span>Cerrar sesión</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </header>

      {/* Change Code Modal */}
      {changeCodeOpen && (
        <ChangeCodeModal onClose={() => setChangeCodeOpen(false)} />
      )}
    </>
  );
}

interface ChangeCodeModalProps {
  onClose: () => void;
}

function ChangeCodeModal({ onClose }: ChangeCodeModalProps) {
  const [currentCode, setCurrentCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [confirmNewCode, setConfirmNewCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setError(null);

    const trimmedCurrent = currentCode.trim().toUpperCase();
    const trimmedNew = newCode.trim().toUpperCase();
    const trimmedConfirm = confirmNewCode.trim().toUpperCase();

    if (!trimmedCurrent || !trimmedNew || !trimmedConfirm) {
      setError('Todos los campos son obligatorios.');
      return;
    }

    if (trimmedNew !== trimmedConfirm) {
      setError('El nuevo código y su confirmación no coinciden.');
      return;
    }

    // Client side rules check
    if (trimmedNew.length < 4 || trimmedNew.length > 12) {
      setError('El nuevo código de acceso debe tener entre 4 y 12 caracteres.');
      return;
    }

    if (!/^[A-Z0-9]+$/.test(trimmedNew)) {
      setError('El nuevo código solo puede contener letras y números (sin espacios).');
      return;
    }

    const weakCodes = ['1234', '0000', 'ADMIN', 'PASSWORD', 'CONTRASENA', 'CONTRASEÑA'];
    if (weakCodes.includes(trimmedNew)) {
      setError('El código de acceso nuevo es muy débil. Elige otro.');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('currentCode', trimmedCurrent);
      formData.append('newCode', trimmedNew);
      formData.append('confirmNewCode', trimmedConfirm);

      const res = await changeAccessCodeAction(formData);
      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError(res.message || 'Error al cambiar el código.');
      }
    } catch (err) {
      setError('Ocurrió un error inesperado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay background */}
      <div
        className="absolute inset-0 bg-[#020204]/75 backdrop-blur-md cursor-pointer"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-sm bg-[#0d0d12] border border-[#21212c] rounded-2xl shadow-2xl p-6 overflow-hidden animate-zoom-in">
        {/* Glow Effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-[#6d28d9] to-transparent"></div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-zinc-800/40 border border-zinc-700/50 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        <h3 className="text-base font-black uppercase tracking-wider text-white mb-4">
          Cambiar código de acceso
        </h3>

        {success ? (
          <div className="py-6 flex flex-col items-center justify-center text-center space-y-2">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 animate-bounce" />
            <h4 className="text-sm font-black text-white uppercase">Código actualizado</h4>
            <p className="text-xs text-zinc-400">Tu código de acceso ha sido cambiado con éxito.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-extrabold uppercase text-zinc-500 tracking-wider">
                Código de acceso actual
              </label>
              <input
                type="password"
                value={currentCode}
                onChange={(e) => setCurrentCode(e.target.value)}
                placeholder="Ingresa tu código actual"
                className="w-full bg-[#14141d] border border-[#272737] rounded-xl px-3.5 py-2.5 text-xs font-bold text-white uppercase tracking-wider focus:outline-none focus:border-[#6d28d9]"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-extrabold uppercase text-zinc-500 tracking-wider">
                Nuevo código de acceso
              </label>
              <input
                type="text"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="4-12 caracteres"
                className="w-full bg-[#14141d] border border-[#272737] rounded-xl px-3.5 py-2.5 text-xs font-bold text-white uppercase tracking-wider focus:outline-none focus:border-[#6d28d9]"
                maxLength={12}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-extrabold uppercase text-zinc-500 tracking-wider">
                Confirmar nuevo código
              </label>
              <input
                type="text"
                value={confirmNewCode}
                onChange={(e) => setConfirmNewCode(e.target.value)}
                placeholder="Repite el nuevo código"
                className="w-full bg-[#14141d] border border-[#272737] rounded-xl px-3.5 py-2.5 text-xs font-bold text-white uppercase tracking-wider focus:outline-none focus:border-[#6d28d9]"
                maxLength={12}
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl flex items-start gap-2 text-red-400">
                <AlertCircle className="h-4.5 w-4.5 text-red-500 shrink-0 mt-0.5" />
                <span className="text-xs font-semibold leading-relaxed">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#6d28d9] hover:bg-[#5b21b6] disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase tracking-wider text-xs py-3 rounded-xl transition-all shadow-lg cursor-pointer"
            >
              {loading ? 'Guardando...' : 'Actualizar código'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
