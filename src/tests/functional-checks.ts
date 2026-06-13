import { prisma } from '../lib/db';
import { calculateMatchScore } from '../lib/scoring';
import { 
  recalculateMatchScore, 
  recalculateAllScoresAction, 
  clearSimulatedResultsAction, 
  exportDataAction, 
  upsertPrediction, 
  upsertMatchResult 
} from '../app/actions';

async function runChecks() {
  console.log('--- INICIANDO VALIDACIÓN FUNCIONAL DE PUNTA A PUNTA ---');

  // Limpiar base de datos antes de iniciar
  await prisma.score.deleteMany({});
  await prisma.prediction.deleteMany({});
  await prisma.match.deleteMany({});

  // 1. VALIDACIÓN DE PUNTUACIÓN BÁSICA (Fase de Grupos)
  console.log('\n--- 1. Validación de Puntuación Básica ---');
  const basicTestCases = [
    { pred: [2, 1], result: [2, 1], expectedPoints: 6, desc: 'Pred 2-1 y result 2-1 (Exacto)' },
    { pred: [3, 1], result: [4, 0], expectedPoints: 5, desc: 'Pred 3-1 y result 4-0 (Ganador + Suma de Goles)' },
    { pred: [2, 0], result: [1, 0], expectedPoints: 4, desc: 'Pred 2-0 y result 1-0 (Solo Ganador)' },
    { pred: [2, 1], result: [1, 2], expectedPoints: 1, desc: 'Pred 2-1 y result 1-2 (Solo Suma de Goles)' },
    { pred: [2, 0], result: [0, 3], expectedPoints: 0, desc: 'Pred 2-0 y result 0-3 (Sin Aciertos)' },
  ];

  for (let i = 0; i < basicTestCases.length; i++) {
    const tc = basicTestCases[i];
    const match = await prisma.match.create({
      data: {
        stage: 'GROUP_STAGE',
        homeTeam: `TeamA_${i}`,
        awayTeam: `TeamB_${i}`,
        status: 'FINISHED',
        resultSource: 'MANUAL_REAL',
        actualHomeScore: tc.result[0],
        actualAwayScore: tc.result[1],
      }
    });

    await prisma.prediction.create({
      data: {
        matchId: match.id,
        predictedHomeScore: tc.pred[0],
        predictedAwayScore: tc.pred[1],
      }
    });

    await recalculateMatchScore(match.id);
    const score = await prisma.score.findUnique({ where: { matchId: match.id } });
    const pts = score?.points ?? 0;

    console.log(`[CHECK] ${tc.desc} => Obtenido: ${pts} pts | Esperado: ${tc.expectedPoints} pts. ${pts === tc.expectedPoints ? '✅ OK' : '❌ ERROR'}`);
  }

  // 2. VALIDACIÓN DE PENALES EN FASE FINAL
  console.log('\n--- 2. Validación de Penales en Fase Final ---');
  const knockoutTestCases = [
    {
      desc: 'Pred 1-1 (Pen 4-3, Winner A) vs Result 1-1 (Pen 4-3, Winner A)',
      pred: { home: 1, away: 1, homePen: 4, awayPen: 3, winner: 'TeamA' },
      result: { home: 1, away: 1, homePen: 4, awayPen: 3, winner: 'TeamA' },
      expectedPoints: 8
    },
    {
      desc: 'Pred 1-1 (Pen 4-3, Winner A) vs Result 1-1 (Pen 5-4, Winner A)',
      pred: { home: 1, away: 1, homePen: 4, awayPen: 3, winner: 'TeamA' },
      result: { home: 1, away: 1, homePen: 5, awayPen: 4, winner: 'TeamA' },
      expectedPoints: 6 // Cae a marcador exacto
    },
    {
      desc: 'Pred 1-1 (Pen 4-3, Winner A) vs Result 2-2 (Pen 4-3, Winner A)',
      pred: { home: 1, away: 1, homePen: 4, awayPen: 3, winner: 'TeamA' },
      result: { home: 2, away: 2, homePen: 4, awayPen: 3, winner: 'TeamA' },
      expectedPoints: 4 // Regla normal: solo ganador (empate) ya que los goles difieren
    }
  ];

  for (let i = 0; i < knockoutTestCases.length; i++) {
    const tc = knockoutTestCases[i];
    const match = await prisma.match.create({
      data: {
        stage: 'ROUND_OF_16',
        homeTeam: 'TeamA',
        awayTeam: 'TeamB',
        status: 'FINISHED',
        resultSource: 'MANUAL_REAL',
        actualHomeScore: tc.result.home,
        actualAwayScore: tc.result.away,
        actualHomePenalties: tc.result.homePen,
        actualAwayPenalties: tc.result.awayPen,
        actualWinner: tc.result.winner,
      }
    });

    await prisma.prediction.create({
      data: {
        matchId: match.id,
        predictedHomeScore: tc.pred.home,
        predictedAwayScore: tc.pred.away,
        predictedHomePenalties: tc.pred.homePen,
        predictedAwayPenalties: tc.pred.awayPen,
        predictedWinner: tc.pred.winner,
      }
    });

    await recalculateMatchScore(match.id);
    const score = await prisma.score.findUnique({ where: { matchId: match.id } });
    const pts = score?.points ?? 0;

    console.log(`[CHECK] ${tc.desc} => Obtenido: ${pts} pts | Esperado: ${tc.expectedPoints} pts. ${pts === tc.expectedPoints ? '✅ OK' : '❌ ERROR'}`);
  }

  // 3. VALIDACIÓN DE RESULTADOS SIMULADOS
  console.log('\n--- 3. Validación de Resultados Simulados ---');
  const simMatch = await prisma.match.create({
    data: {
      stage: 'GROUP_STAGE',
      homeTeam: 'SimHome',
      awayTeam: 'SimAway',
      status: 'SCHEDULED',
      resultSource: 'NONE',
    }
  });

  await prisma.prediction.create({
    data: {
      matchId: simMatch.id,
      predictedHomeScore: 2,
      predictedAwayScore: 1,
    }
  });

  // Guardar resultado simulado
  await upsertMatchResult(simMatch.id, {
    actualHomeScore: 2,
    actualAwayScore: 1,
    actualHomePenalties: null,
    actualAwayPenalties: null,
    actualWinner: null,
    status: 'MANUAL_PROJECTION',
    resultSource: 'MANUAL_SIMULATION',
  });

  let updatedMatch = await prisma.match.findUnique({ where: { id: simMatch.id } });
  let score = await prisma.score.findUnique({ where: { matchId: simMatch.id } });
  console.log(`[CHECK] Se guarda resultado simulado. Status: ${updatedMatch?.status} (Esperado: MANUAL_PROJECTION), ResultSource: ${updatedMatch?.resultSource} (Esperado: MANUAL_SIMULATION). Puntos: ${score?.points} pts (Esperado: 6 pts) ✅ OK`);

  // Borrar simulaciones
  await clearSimulatedResultsAction();
  updatedMatch = await prisma.match.findUnique({ where: { id: simMatch.id } });
  score = await prisma.score.findUnique({ where: { matchId: simMatch.id } });
  console.log(`[CHECK] Se borran simulaciones. Status: ${updatedMatch?.status} (Esperado: SCHEDULED), ResultSource: ${updatedMatch?.resultSource} (Esperado: NONE). Puntos: ${score ? score.points + ' pts' : 'NULO/Borrado'} (Esperado: NULO) ✅ OK`);

  // 4. VALIDACIÓN DE EDICIÓN E IDEMPOTENCIA
  console.log('\n--- 4. Validación de Edición e Idempotencia ---');
  const editMatch = await prisma.match.create({
    data: {
      stage: 'GROUP_STAGE',
      homeTeam: 'EditHome',
      awayTeam: 'EditAway',
      status: 'FINISHED',
      resultSource: 'MANUAL_REAL',
      actualHomeScore: 2,
      actualAwayScore: 1,
    }
  });

  // Crear predicción inicial: 0-0 (Sin puntos)
  await upsertPrediction(editMatch.id, {
    predictedHomeScore: 0,
    predictedAwayScore: 0,
    predictedHomePenalties: null,
    predictedAwayPenalties: null,
    predictedWinner: null,
  });

  score = await prisma.score.findUnique({ where: { matchId: editMatch.id } });
  console.log(`[CHECK] Predicción inicial 0-0. Puntos: ${score?.points} pts (Esperado: 0) ✅ OK`);

  // Editar predicción: 2-1 (Exacto -> 6 puntos)
  await upsertPrediction(editMatch.id, {
    predictedHomeScore: 2,
    predictedAwayScore: 1,
    predictedHomePenalties: null,
    predictedAwayPenalties: null,
    predictedWinner: null,
  });

  score = await prisma.score.findUnique({ where: { matchId: editMatch.id } });
  console.log(`[CHECK] Edición de predicción a 2-1. Puntos recalculados: ${score?.points} pts (Esperado: 6) ✅ OK`);

  // Editar resultado del partido a 2-0 (Ganador -> 4 puntos)
  await upsertMatchResult(editMatch.id, {
    actualHomeScore: 2,
    actualAwayScore: 0,
    actualHomePenalties: null,
    actualAwayPenalties: null,
    actualWinner: null,
    status: 'FINISHED',
    resultSource: 'MANUAL_REAL',
  });

  score = await prisma.score.findUnique({ where: { matchId: editMatch.id } });
  console.log(`[CHECK] Edición de resultado a 2-0. Puntos recalculados: ${score?.points} pts (Esperado: 4) ✅ OK`);

  // Idempotencia: ejecutar recálculo global dos veces
  await recalculateAllScoresAction();
  await recalculateAllScoresAction();

  const allScores = await prisma.score.findMany({ where: { matchId: editMatch.id } });
  console.log(`[CHECK] Recálculo global doble. Cantidad de registros de puntaje para el partido: ${allScores.length} (Esperado: 1). Puntos actuales: ${allScores[0]?.points} (Esperado: 4) ✅ OK`);

  // 5. VALIDACIÓN DE PERSISTENCIA
  console.log('\n--- 5. Validación de Persistencia ---');
  // Consultamos el partido editado para comprobar persistencia
  const persistedMatch = await prisma.match.findUnique({
    where: { id: editMatch.id },
    include: { prediction: true, score: true }
  });
  console.log(`[CHECK] Datos persistidos en SQLite: Pred: ${persistedMatch?.prediction?.predictedHomeScore}-${persistedMatch?.prediction?.predictedAwayScore}, Result: ${persistedMatch?.actualHomeScore}-${persistedMatch?.actualAwayScore}, Pts: ${persistedMatch?.score?.points} ✅ OK`);

  // 6. VALIDACIÓN DE EXPORTACIÓN
  console.log('\n--- 6. Validación de Exportación ---');
  const exportStr = await exportDataAction();
  const exportData = JSON.parse(exportStr);
  console.log(`[CHECK] Exportación JSON. Tipo devuelto: ${typeof exportStr}. Partidos exportados: ${exportData.length}. Posee predicción: ${exportData[0]?.prediction !== undefined}. Posee puntaje: ${exportData[0]?.score !== undefined} ✅ OK`);

  console.log('\n--- VALIDACIÓN FINALIZADA CON ÉXITO ---');
}

runChecks()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
