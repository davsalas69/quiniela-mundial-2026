import { prisma } from '@/lib/db';
import { Match, Prediction, Score } from '@prisma/client';
import ScoresClient from './ScoresClient';

export const revalidate = 0; // Disable cache for fresh DB reads

export type MatchWithData = Match & {
  prediction: Prediction | null;
  score: Score | null;
};

export default async function ScoresPage() {
  const matches: MatchWithData[] = await prisma.match.findMany({
    include: {
      prediction: true,
      score: true,
    },
    orderBy: [
      { kickoffAt: 'asc' },
    ],
  });

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
