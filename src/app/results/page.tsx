import { Match, Prediction } from '@prisma/client';
import ResultsClient from './ResultsClient';
import { getMatchesWithData } from '@/app/actions';
import { requireAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const revalidate = 0; // Disable cache for fresh DB reads

export type MatchWithPrediction = Match & {
  prediction: Prediction | null;
};

export default async function ResultsPage() {
  try {
    await requireAdmin();
  } catch (error: any) {
    if (error.message === 'FORBIDDEN') {
      redirect('/');
    } else {
      redirect('/login');
    }
  }

  const matches: MatchWithPrediction[] = await getMatchesWithData();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
          RESULTADOS DEL TORNEO
        </h2>
        <p className="text-zinc-400 text-sm font-medium">
          Carga los marcadores reales para calcular tus puntos, o simula escenarios futuros seleccionando el tipo "Simulado" para ver proyecciones de puntaje.
        </p>
      </div>

      <ResultsClient initialMatches={matches} />
    </div>
  );
}
