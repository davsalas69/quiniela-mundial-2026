import { prisma } from '../src/lib/db';

async function main() {
  console.log('Iniciando el sembrado de datos (seed)...');

  // Limpiar base de datos
  await prisma.score.deleteMany({});
  await prisma.prediction.deleteMany({});
  await prisma.match.deleteMany({});

  console.log('Base de datos limpia.');

  // Partidos de ejemplo para cada fase
  const matchesData = [
    // 1. Fase de grupos: México vs Colombia (Programado, sin predicción ni resultado)
    {
      stage: 'GROUP_STAGE',
      groupName: 'Grupo A',
      homeTeam: 'México',
      awayTeam: 'Colombia',
      kickoffAt: new Date('2026-06-11T18:00:00Z'),
      status: 'SCHEDULED',
      resultSource: 'NONE',
    },
    // 2. Fase de grupos: USA vs Canadá (Finalizado, con predicción exacta y resultado real)
    // Predicción: 2 - 1, Resultado: 2 - 1 (6 puntos)
    {
      stage: 'GROUP_STAGE',
      groupName: 'Grupo B',
      homeTeam: 'USA',
      awayTeam: 'Canadá',
      kickoffAt: new Date('2026-06-12T15:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 2,
      actualAwayScore: 1,
      resultSource: 'MANUAL_REAL',
    },
    // 3. Fase de grupos: Argentina vs España (Finalizado, con ganador y suma goles acertado pero no marcador)
    // Predicción: 3 - 1, Resultado: 4 - 0 (5 puntos)
    {
      stage: 'GROUP_STAGE',
      groupName: 'Grupo C',
      homeTeam: 'Argentina',
      awayTeam: 'España',
      kickoffAt: new Date('2026-06-13T20:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 4,
      actualAwayScore: 0,
      resultSource: 'MANUAL_REAL',
    },
    // 4. Fase de grupos: Brasil vs Uruguay (Finalizado, solo ganador correcto)
    // Predicción: 2 - 0, Resultado: 1 - 0 (4 puntos)
    {
      stage: 'GROUP_STAGE',
      groupName: 'Grupo D',
      homeTeam: 'Brasil',
      awayTeam: 'Uruguay',
      kickoffAt: new Date('2026-06-14T17:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 1,
      actualAwayScore: 0,
      resultSource: 'MANUAL_REAL',
    },
    // 5. Fase de grupos: Alemania vs Japón (Finalizado, solo suma de goles correcta)
    // Predicción: 2 - 1, Resultado: 1 - 2 (1 punto)
    {
      stage: 'GROUP_STAGE',
      groupName: 'Grupo E',
      homeTeam: 'Alemania',
      awayTeam: 'Japón',
      kickoffAt: new Date('2026-06-15T14:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 1,
      actualAwayScore: 2,
      resultSource: 'MANUAL_REAL',
    },
    // 6. Dieciseisavos: Francia vs Inglaterra (Resultado Simulado antes de jugarse, acierto total)
    // Predicción: 2 - 2, penales 4 - 3. Resultado simulado: 2 - 2, penales 4 - 3 (8 puntos)
    {
      stage: 'ROUND_OF_32',
      homeTeam: 'Francia',
      awayTeam: 'Inglaterra',
      kickoffAt: new Date('2026-06-25T19:00:00Z'),
      status: 'MANUAL_PROJECTION',
      actualHomeScore: 2,
      actualAwayScore: 2,
      actualHomePenalties: 4,
      actualAwayPenalties: 3,
      actualWinner: 'Francia',
      resultSource: 'MANUAL_SIMULATION',
    },
    // 7. Octavos de final: Portugal vs Países Bajos (Programado, con predicción del usuario)
    // Predicción: 1 - 0
    {
      stage: 'ROUND_OF_16',
      homeTeam: 'Portugal',
      awayTeam: 'Países Bajos',
      kickoffAt: new Date('2026-06-29T16:00:00Z'),
      status: 'SCHEDULED',
      resultSource: 'NONE',
    },
    // 8. Cuartos de final: Italia vs Bélgica (Programado, sin predicción ni resultado)
    {
      stage: 'QUARTER_FINAL',
      homeTeam: 'Italia',
      awayTeam: 'Bélgica',
      kickoffAt: new Date('2026-07-04T18:00:00Z'),
      status: 'SCHEDULED',
      resultSource: 'NONE',
    },
    // 9. Semifinales: Marruecos vs Croacia (Programado, sin predicción ni resultado)
    {
      stage: 'SEMI_FINAL',
      homeTeam: 'Marruecos',
      awayTeam: 'Croacia',
      kickoffAt: new Date('2026-07-08T20:00:00Z'),
      status: 'SCHEDULED',
      resultSource: 'NONE',
    },
    // 10. Tercer lugar: Perdedor SF1 vs Perdedor SF2 (Programado, sin predicción)
    {
      stage: 'THIRD_PLACE',
      homeTeam: 'Marruecos',
      awayTeam: 'Bélgica',
      kickoffAt: new Date('2026-07-11T16:00:00Z'),
      status: 'SCHEDULED',
      resultSource: 'NONE',
    },
    // 11. Final: Argentina vs Francia (Resultado Simulado, acierto de marcador pero no penales en final)
    // Predicción: 1 - 1, penales 4 - 3 (Ganador predicho: Argentina)
    // Resultado simulado: 1 - 1, penales 5 - 4 (Ganador real: Argentina) (6 puntos por marcador exacto)
    {
      stage: 'FINAL',
      homeTeam: 'Argentina',
      awayTeam: 'Francia',
      kickoffAt: new Date('2026-07-12T19:00:00Z'),
      status: 'MANUAL_PROJECTION',
      actualHomeScore: 1,
      actualAwayScore: 1,
      actualHomePenalties: 5,
      actualAwayPenalties: 4,
      actualWinner: 'Argentina',
      resultSource: 'MANUAL_SIMULATION',
    },
  ];

  console.log(`Creando ${matchesData.length} partidos de prueba...`);
  const createdMatches = [];
  for (const match of matchesData) {
    const created = await prisma.match.create({
      data: match,
    });
    createdMatches.push(created);
  }

  // Crear predicciones asociadas para simular el comportamiento
  console.log('Creando predicciones de prueba...');

  const predictionsData = [
    // Para USA vs Canadá: Predicción exacta (2-1) -> Espera 6 puntos
    {
      matchIndex: 1, // USA vs Canadá
      predictedHomeScore: 2,
      predictedAwayScore: 1,
    },
    // Para Argentina vs España: Predicción (3-1), Resultado (4-0). Ganador correcto (Argentina) + sumatoria goles correcta (4) -> Espera 5 puntos
    {
      matchIndex: 2, // Argentina vs España
      predictedHomeScore: 3,
      predictedAwayScore: 1,
      predictedWinner: 'Argentina',
    },
    // Para Brasil vs Uruguay: Predicción (2-0), Resultado (1-0). Solo ganador correcto -> Espera 4 puntos
    {
      matchIndex: 3, // Brasil vs Uruguay
      predictedHomeScore: 2,
      predictedAwayScore: 0,
      predictedWinner: 'Brasil',
    },
    // Para Alemania vs Japón: Predicción (2-1), Resultado (1-2). Solo sumatoria de goles correcta (3) -> Espera 1 punto
    {
      matchIndex: 4, // Alemania vs Japón
      predictedHomeScore: 2,
      predictedAwayScore: 1,
      predictedWinner: 'Alemania',
    },
    // Para Francia vs Inglaterra: Predicción (2-2, penales 4-3). Resultado (2-2, penales 4-3). Acertado total en fase final -> Espera 8 puntos
    {
      matchIndex: 5, // Francia vs Inglaterra
      predictedHomeScore: 2,
      predictedAwayScore: 2,
      predictedHomePenalties: 4,
      predictedAwayPenalties: 3,
      predictedWinner: 'Francia',
    },
    // Para Portugal vs Países Bajos: Predicción (1-0), Partido programado sin resultado real -> Espera 0 puntos
    {
      matchIndex: 6, // Portugal vs Países Bajos
      predictedHomeScore: 1,
      predictedAwayScore: 0,
      predictedWinner: 'Portugal',
    },
    // Para Argentina vs Francia (Final): Predicción (1-1, penales 4-3). Resultado (1-1, penales 5-4) -> Espera 6 puntos (marcador exacto, penales no)
    {
      matchIndex: 10, // Argentina vs Francia (Final)
      predictedHomeScore: 1,
      predictedAwayScore: 1,
      predictedHomePenalties: 4,
      predictedAwayPenalties: 3,
      predictedWinner: 'Argentina',
    },
  ];

  for (const pred of predictionsData) {
    const match = createdMatches[pred.matchIndex];
    await prisma.prediction.create({
      data: {
        matchId: match.id,
        predictedHomeScore: pred.predictedHomeScore,
        predictedAwayScore: pred.predictedAwayScore,
        predictedHomePenalties: pred.predictedHomePenalties ?? null,
        predictedAwayPenalties: pred.predictedAwayPenalties ?? null,
        predictedWinner: pred.predictedWinner ?? null,
      },
    });
  }

  // Ejecutaremos la lógica de cálculo de puntuación más adelante, una vez implementado el motor.
  console.log('Sembrado completado con éxito.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
