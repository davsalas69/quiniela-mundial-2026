import { Match, Prediction, Score } from '@prisma/client';
import ScoresClient from './ScoresClient';
import { getMatchesWithData } from '@/app/actions';
import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const revalidate = 0; // Disable cache for fresh DB reads

export type MatchWithData = Match & {
  prediction: Prediction | null;
  score: Score | null;
};

export default async function ScoresPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const matches: MatchWithData[] = await getMatchesWithData();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
          MIS PUNTOS
        </h2>
        <p className="text-zinc-400 text-sm font-medium">
          Revisa el desglose detallado de los puntos que has obtenido en base a las reglas de puntuación oficiales de la quiniela.
        </p>
      </div>

      <ScoresClient initialMatches={matches} />
    </div>
  );
}
