import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import { prisma } from '@/lib/db';
import Link from 'next/link';
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
  // Obtener estadísticas en tiempo real para la barra lateral
  const totalPointsAgg = await prisma.score.aggregate({
    _sum: {
      points: true
    }
  });
  const totalPoints = totalPointsAgg._sum.points ?? 0;

  const totalPredictions = await prisma.prediction.count();
  const totalMatches = await prisma.match.count();
  const finishedMatches = await prisma.match.count({
    where: {
      status: {
        in: ['FINISHED', 'MANUAL_PROJECTION']
      }
    }
  });

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/predictions', label: 'Predicciones', icon: PenTool },
    { href: '/results', label: 'Resultados', icon: CheckSquare },
    { href: '/scores', label: 'Mis Puntos', icon: Award },
    { href: '/settings', label: 'Configuración', icon: Settings },
  ];

  return (
    <html lang="es" className={`${outfit.variable} h-full antialiased dark`}>
      <body className="min-h-full bg-[#07070b] text-[#f4f4f5] flex flex-col md:flex-row">
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

            {/* Score Summary Badge */}
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

          {/* Footer metadata */}
          <div className="p-4 border-t border-[#1e1e24] text-center">
            <span className="text-[10px] text-zinc-600 font-medium">
              Quiniela Mundial 2026 © V1.0.0
            </span>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 p-4 md:p-8 lg:p-10 overflow-y-auto max-h-screen">
          <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
