import { prisma } from '@/lib/db';
import { Match, Prediction } from '@prisma/client';
import PredictionsClient from './PredictionsClient';

export const revalidate = 0; // Disable cache for fresh DB reads

export type MatchWithPrediction = Match & {
  prediction: Prediction | null;
};

export default async function PredictionsPage() {
  const matches: MatchWithPrediction[] = await prisma.match.findMany({
    include: {
      prediction: true,
    },
    orderBy: [
      { kickoffAt: 'asc' },
    ],
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
          MIS PREDICCIONES
        </h2>
        <p className="text-zinc-400 text-sm font-medium">
          Carga tus pronósticos para cada partido. Los puntos se calcularán automáticamente cuando se cargue el resultado real o simulado.
        </p>
      </div>

      <PredictionsClient initialMatches={matches} />
    </div>
  );
}
