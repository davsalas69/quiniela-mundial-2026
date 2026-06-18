'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loginAction, registerAction, logoutAction } from '@/app/actions';
import { User, KeyRound, HelpCircle, X, Check, AlertCircle, Sparkles } from 'lucide-react';
import { validateAccessCode, generateSuggestedCode } from '@/lib/auth-shared';

interface AuthContextType {
  user: { id: string; username: string; role: string } | null;
  setUser: (user: any | null) => void;
  openAuthModal: (onSuccess?: () => void, initialTab?: 'register' | 'login') => void;
  closeAuthModal: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser: any | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState(initialUser);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'register' | 'login'>('register');
  const [onSuccessCallback, setOnSuccessCallback] = useState<(() => void) | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Sync state if initialUser prop changes from server layout
  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  // Listen to searchParams to open auth modal if ?showAuth=true
  useEffect(() => {
    if (searchParams.get('showAuth') === 'true') {
      const mode = searchParams.get('mode') === 'login' ? 'login' : 'register';
      openAuthModal(undefined, mode);
    }
  }, [searchParams]);

  const openAuthModal = (onSuccess?: () => void, initialTab: 'register' | 'login' = 'register') => {
    if (onSuccess) {
      setOnSuccessCallback(() => onSuccess);
    } else {
      setOnSuccessCallback(null);
    }
    setActiveTab(initialTab);
    setIsOpen(true);
  };

  const closeAuthModal = () => {
    setIsOpen(false);
    setOnSuccessCallback(null);
    // Clean up query param from URL if present
    if (searchParams.get('showAuth') === 'true') {
      router.replace(window.location.pathname);
    }
  };

  const handleAuthSuccess = (loggedUser: any) => {
    setUser(loggedUser);
    setIsOpen(false);

    // Refresh page/router to fetch authenticated data
    router.refresh();

    if (onSuccessCallback) {
      // Small timeout to allow state synchronization and route update before callback
      setTimeout(() => {
        onSuccessCallback();
      }, 150);
    }
  };

  const logout = async () => {
    try {
      await logoutAction();
    } catch (err) {
      // Catch next.js redirect exception or network error
    }
    setUser(null);
    setOnSuccessCallback(null);
    setIsOpen(false);

    router.refresh();

    // Redirigir a '/' si el usuario cierra sesión desde una ruta protegida/personal
    const personalPaths = ['/predictions', '/scores', '/settings'];
    if (personalPaths.some(p => window.location.pathname.startsWith(p))) {
      router.replace('/');
    }
  };

  return (
    <AuthContext.Provider value={{ user, setUser, openAuthModal, closeAuthModal, logout }}>
      {children}
      {isOpen && (
        <AuthModal
          tab={activeTab}
          onTabChange={setActiveTab}
          onClose={closeAuthModal}
          onSuccess={handleAuthSuccess}
        />
      )}
    </AuthContext.Provider>
  );
}

interface AuthModalProps {
  tab: 'register' | 'login';
  onTabChange: (tab: 'register' | 'login') => void;
  onClose: () => void;
  onSuccess: (user: any) => void;
}

function AuthModal({ tab, onTabChange, onClose, onSuccess }: AuthModalProps) {
  const [username, setUsername] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [userExists, setUserExists] = useState(false);

  // Auto-suggest access code on username change in register mode
  useEffect(() => {
    if (tab === 'register' && isSuggesting && username) {
      const suggestion = generateSuggestedCode(username);
      setAccessCode(suggestion);
    }
  }, [username, tab, isSuggesting]);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    setUserExists(false);
    setError(null);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Normalizar a mayúsculas y quitar espacios en tiempo real
    const codeVal = e.target.value.toUpperCase().replace(/\s/g, '');
    setAccessCode(codeVal);
    setIsSuggesting(false); // User touched it, stop auto-suggesting
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setError(null);
    setUserExists(false);

    const trimmedUser = username.trim();
    const trimmedCode = accessCode.trim().toUpperCase();

    if (!trimmedUser) {
      setError('El nombre de jugador es obligatorio.');
      return;
    }
    if (!trimmedCode) {
      setError('El código de acceso es obligatorio.');
      return;
    }

    // Client-side validation in register mode
    if (tab === 'register') {
      const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
      if (!usernameRegex.test(trimmedUser)) {
        setError('El nombre de usuario debe tener entre 3 y 30 caracteres alfanuméricos o guión bajo.');
        return;
      }

      const validation = validateAccessCode(trimmedCode, trimmedUser);
      if (!validation.valid) {
        setError(validation.message || 'Código de acceso no válido.');
        return;
      }
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('username', trimmedUser);
      formData.append('password', trimmedCode);

      if (tab === 'register') {
        const res = await registerAction(formData);
        if (res.success) {
          onSuccess(res.user);
        } else {
          setError(res.message || 'Error al registrar.');
          if (res.userExists) {
            setUserExists(true);
          }
        }
      } else {
        const res = await loginAction(formData);
        if (res.success) {
          onSuccess(res.user);
        } else {
          setError(res.message || 'Código de acceso incorrecto o jugador no activo.');
        }
      }
    } catch (err) {
      setError('Ocurrió un error inesperado. Inténtelo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchToLogin = () => {
    onTabChange('login');
    setUserExists(false);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay background */}
      <div
        className="absolute inset-0 bg-[#020204]/75 backdrop-blur-md cursor-pointer"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md bg-[#0d0d12] border border-[#21212c] rounded-2xl shadow-2xl p-6 overflow-hidden animate-zoom-in">
        {/* Glow Effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-[#6d28d9] to-transparent"></div>
        <div className="absolute -top-16 -right-16 w-32 h-32 bg-[#6d28d9]/10 rounded-full blur-2xl"></div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-zinc-800/40 border border-zinc-700/50 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header Tabs */}
        <div className="flex border-b border-[#1c1c26] mb-6 mt-2">
          <button
            onClick={() => {
              onTabChange('register');
              setError(null);
              setUserExists(false);
            }}
            className={`flex-1 pb-3 text-sm font-black uppercase tracking-wider transition-colors duration-200 cursor-pointer ${
              tab === 'register'
                ? 'text-[#a78bfa] border-b-2 border-[#6d28d9]'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Crear mi quiniela
          </button>
          <button
            onClick={() => {
              onTabChange('login');
              setError(null);
              setUserExists(false);
            }}
            className={`flex-1 pb-3 text-sm font-black uppercase tracking-wider transition-colors duration-200 cursor-pointer ${
              tab === 'login'
                ? 'text-[#a78bfa] border-b-2 border-[#6d28d9]'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Ya tengo una quiniela
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Nombre de jugador */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-extrabold uppercase text-zinc-400 tracking-widest flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-zinc-500" />
              Nombre de jugador
            </label>
            <input
              type="text"
              value={username}
              onChange={handleUsernameChange}
              placeholder="Ej. David, Pantera"
              className="w-full bg-[#14141d] border border-[#272737] rounded-xl px-4 py-3 text-sm font-bold text-white placeholder-zinc-600 focus:outline-none focus:border-[#6d28d9] focus:ring-1 focus:ring-[#6d28d9] transition-all"
              maxLength={30}
              required
            />
          </div>

          {/* Código de acceso */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-extrabold uppercase text-zinc-400 tracking-widest flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-zinc-500" />
                Código de acceso
              </label>
              {tab === 'register' && isSuggesting && username && (
                <span className="text-[9px] font-extrabold uppercase bg-[#6d28d9]/20 text-[#a78bfa] border border-[#6d28d9]/40 px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                  <Sparkles className="h-2.5 w-2.5" /> Sugerido
                </span>
              )}
            </div>
            <input
              type="text"
              value={accessCode}
              onChange={handleCodeChange}
              placeholder="4-12 caracteres (Ej. DAVID26)"
              className="w-full bg-[#14141d] border border-[#272737] rounded-xl px-4 py-3 text-sm font-bold text-white tracking-widest uppercase placeholder-zinc-600 focus:outline-none focus:border-[#6d28d9] focus:ring-1 focus:ring-[#6d28d9] transition-all"
              maxLength={12}
              required
            />
            {tab === 'register' && (
              <p className="text-[11px] text-zinc-500 font-semibold leading-relaxed flex items-start gap-1.5 pt-1">
                <HelpCircle className="h-4 w-4 text-zinc-600 shrink-0 mt-0.5" />
                <span>
                  Puedes cambiar este código por uno fácil de recordar. No lo olvides: lo necesitarás para volver a entrar a tu quiniela.
                </span>
              </p>
            )}
          </div>

          {/* Error display */}
          {error && (
            <div className={`p-3.5 rounded-xl border flex items-start gap-2.5 ${
              userExists
                ? 'bg-amber-500/5 border-amber-500/20 text-amber-300'
                : 'bg-red-500/5 border-red-500/20 text-red-400'
            }`}>
              {userExists ? (
                <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              )}
              <div className="text-xs font-semibold leading-relaxed">
                <p>{error}</p>
                {userExists && (
                  <button
                    type="button"
                    onClick={handleSwitchToLogin}
                    className="mt-2 text-xs font-bold text-[#a78bfa] hover:underline block cursor-pointer"
                  >
                    ¿Entrar con este código en su lugar?
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#6d28d9] hover:bg-[#5b21b6] disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase tracking-wider text-sm py-3 px-4 rounded-xl transition-all duration-200 shadow-lg shadow-[#6d28d9]/20 hover:scale-[1.01] active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            ) : tab === 'register' ? (
              'Crear mi quiniela'
            ) : (
              'Entrar'
            )}
          </button>
        </form>

        {/* Admin Link at the bottom of login tab */}
        {tab === 'login' && (
          <div className="mt-5 pt-4 border-t border-[#1c1c26]/60 text-center">
            <a
              href="/login/admin"
              className="text-[11px] font-bold text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-wider cursor-pointer"
            >
              Acceso de administrador
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
