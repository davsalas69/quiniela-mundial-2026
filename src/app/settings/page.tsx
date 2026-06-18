import { prisma } from '@/lib/db';
import { Match } from '@prisma/client';
import SettingsClient from './SettingsClient';
import { requireAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic'; // Disable cache for fresh DB reads

export default async function SettingsPage() {
  try {
    await requireAdmin();
  } catch (error: any) {
    if (error.message === 'FORBIDDEN') {
      redirect('/');
    } else {
      redirect('/login');
    }
  }

  const matches: Match[] = await prisma.match.findMany({
    orderBy: [
      { kickoffAt: 'asc' },
    ],
  });

  const lastSyncLog = await prisma.syncLog.findFirst({
    orderBy: { startedAt: 'desc' }
  });

  const providerType = process.env.FOOTBALL_PROVIDER || 'football-data';
  const isApiKeyConfigured = providerType === 'api-football'
    ? !!process.env.API_FOOTBALL_KEY
    : !!process.env.FOOTBALL_DATA_API_KEY;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
          CONFIGURACIÓN Y UTILERÍAS
        </h2>
        <p className="text-zinc-400 text-sm font-medium">
          Controla las operaciones globales de base de datos, exporta copias de seguridad de tus datos, o administra manualmente el calendario de partidos.
        </p>
      </div>

      <SettingsClient
        initialMatches={matches}
        initialLastSyncLog={lastSyncLog}
        isApiKeyConfigured={isApiKeyConfigured}
        activeProvider={providerType}
      />

      <div className="mt-8 pt-4 border-t border-[#1e1e24]/60 text-center text-xs text-zinc-600 font-bold uppercase tracking-widest">
        Build: admin-import-v2
      </div>
    </div>
  );
}


