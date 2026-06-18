import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { logoutAction } from './actions';
import { headers } from 'next/headers';
import { AuthProvider } from './components/AuthProvider';
import Header from './components/Header';
import { Suspense } from 'react';
import {
  Trophy,
  LayoutDashboard,
  PenTool,
  CheckSquare,
  Award,
  Settings
} from 'lucide-react';

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  title: 'Quiniela Mundial 2026 | Mi Panel Personal',
  description: 'Control de predicciones y puntuación personal para la Copa del Mundo 2026.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Obtener el usuario actual y la ruta solicitada
  const user = await getCurrentUser();
  const headerList = await headers();
  const pathname = headerList.get('x-pathname') || '';

  // Determinar si es una página de autenticación simple full-screen
  const isCleanLayout = pathname === '/login' ||
                        pathname === '/login/admin' ||
                        pathname === '/setup' ||
                        pathname === '/register';

  if (isCleanLayout) {
    return (
      <html lang="es" className={`${outfit.variable} h-full antialiased dark`}>
        <body className="min-h-full bg-[#07070b] text-[#f4f4f5] flex items-center justify-center">
          <Suspense fallback={null}>
            <AuthProvider initialUser={user}>
              {children}
            </AuthProvider>
          </Suspense>
        </body>
      </html>
    );
  }

  // 2. Obtener estadísticas en tiempo real para el usuario actual si está autenticado
  let totalPoints = 0;
  let totalPredictions = 0;
  let totalMatches = 0;
  let finishedMatches = 0;

  try {
    totalMatches = await prisma.match.count();
    finishedMatches = await prisma.match.count({
      where: {
        status: {
          in: ['FINISHED', 'MANUAL_PROJECTION']
        }
      }
    });

    if (user) {
      const totalPointsAgg = await prisma.score.aggregate({
        where: { userId: user.id },
        _sum: {
          points: true
        }
      });
      totalPoints = totalPointsAgg._sum.points ?? 0;

      totalPredictions = await prisma.prediction.count({
        where: { userId: user.id }
      });
    }
  } catch (error) {
    console.warn("Failed to fetch stats from database:", error instanceof Error ? error.message : String(error));
  }

  // 3. Filtrar enlaces de navegación según rol
  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/predictions', label: 'Predicciones', icon: PenTool },
    { href: '/scores', label: 'Mis Puntos', icon: Award },
  ];

  if (user && user.role === 'ADMIN') {
    navItems.push(
      { href: '/results', label: 'Resultados', icon: CheckSquare },
      { href: '/settings', label: 'Configuración', icon: Settings }
    );
  }

  return (
    <html lang="es" className={`${outfit.variable} h-full antialiased dark`}>
      <body className="min-h-full bg-[#07070b] text-[#f4f4f5] flex flex-col md:flex-row w-full">
        <Suspense fallback={null}>
          <AuthProvider initialUser={user}>
            {/* Sidebar */}
            <aside className="w-full md:w-64 bg-[#0f0f15]/80 backdrop-blur-md border-b md:border-b-0 md:border-r border-[#1e1e24] flex flex-col justify-between shrink-0">
              <div>
                {/* Header */}
                <div className="p-6 border-b border-[#1e1e24] flex items-center space-x-3">
                  <div className="p-2 bg-[#6d28d9]/20 rounded-lg text-[#a78bfa] border border-[#6d28d9]/40 glow-primary">
                    <Trophy className="h-6 w-6" />
                  </div>
                  <div>
                    <h1 className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                      QUINIELA 2026
                    </h1>
                    <p className="text-xs text-zinc-500 font-medium">Panel Personal</p>
                  </div>
                </div>

                {/* Score Summary Badge (only show for authenticated USERs) */}
                {user && user.role === 'USER' && (
                  <div className="m-4 p-4 rounded-xl bg-gradient-to-br from-[#13131a] to-[#1e1e2b] border border-[#272733] flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">
                        Puntos Totales
                      </p>
                      <p className="text-3xl font-black text-[#10b981] drop-shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                        {totalPoints}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">
                        Progreso
                      </p>
                      <p className="text-xs font-bold text-zinc-300">
                        {totalPredictions} / {totalMatches} <span className="text-zinc-500 font-medium">Preds</span>
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        {finishedMatches} jugados
                      </p>
                    </div>
                  </div>
                )}

                {/* Navigation links */}
                <nav className="px-3 py-2 space-y-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800/40 border border-transparent hover:border-zinc-800/60 transition-all duration-200 group"
                      >
                        <Icon className="h-4.5 w-4.5 text-zinc-500 group-hover:text-[#a78bfa] transition-colors duration-200" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>

              {/* User Info & Actions at the bottom of sidebar */}
              <div className="p-4 border-t border-[#1e1e24] space-y-3">
                {user ? (
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">
                        {user.role === 'ADMIN' ? 'Admin' : `@${user.username}`}
                      </p>
                      <span className={`inline-block text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                        user.role === 'ADMIN'
                          ? 'bg-[#6d28d9]/20 text-[#a78bfa] border border-[#6d28d9]/40'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      }`}>
                        {user.role}
                      </span>
                    </div>
                    <form action={logoutAction}>
                      <button
                        type="submit"
                        className="p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg transition-all duration-200 cursor-pointer"
                        title="Cerrar Sesión"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Link
                      href="/?showAuth=true"
                      className="w-full py-2.5 px-4 bg-[#6d28d9] hover:bg-[#5b21b6] text-xs font-black uppercase tracking-wider text-white rounded-lg flex items-center justify-center transition-colors duration-200 shadow-md shadow-[#6d28d9]/10"
                    >
                      Entrar como jugador
                    </Link>
                  </div>
                )}
                <div className="text-center">
                  <span className="text-[10px] text-zinc-600 font-medium block">
                    Quiniela Mundial 2026 © V1.0.0
                  </span>
                </div>
              </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 min-w-0 p-4 md:p-8 lg:p-10 overflow-y-auto max-h-screen">
              <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
                <Header />
                {children}
              </div>
            </main>
          </AuthProvider>
        </Suspense>
      </body>
    </html>
  );
}
