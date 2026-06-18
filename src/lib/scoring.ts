export interface PredictionInput {
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  predictedHomePenalties: number | null;
  predictedAwayPenalties: number | null;
  predictedWinner: string | null;
}

export interface MatchInput {
  stage: string;
  homeTeam: string;
  awayTeam: string;
  actualHomeScore: number | null;
  actualAwayScore: number | null;
  actualHomePenalties: number | null;
  actualAwayPenalties: number | null;
  actualWinner: string | null;
}

export interface ScoreResult {
  points: number;
  reason: string;
}

/**
 * Calcula de forma pura el puntaje obtenido por una predicción para un partido.
 *
 * Reglas de Prioridad:
 * 1. Fase final + empate exacto + penales exactos = 8 puntos
 * 2. Marcador/Resultado exacto = 6 puntos
 * 3. Ganador correcto + sumatoria total de goles correcta = 5 puntos
 * 4. Solo ganador correcto = 4 puntos
 * 5. Solo sumatoria total de goles correcta = 1 punto
 * 6. Ninguna coincidencia = 0 puntos
 */
export function calculateMatchScore(
  prediction: PredictionInput | null,
  match: MatchInput | null
): ScoreResult {
  // 1. Validar que la predicción y el partido existan
  if (!prediction || prediction.predictedHomeScore === null || prediction.predictedAwayScore === null) {
    return { points: 0, reason: 'Pendiente de predicción' };
  }

  if (!match || match.actualHomeScore === null || match.actualAwayScore === null) {
    return { points: 0, reason: 'Pendiente de resultado' };
  }

  const isGroupStage = match.stage === 'GROUP_STAGE';

  const predHome = prediction.predictedHomeScore;
  const predAway = prediction.predictedAwayScore;
  const actHome = match.actualHomeScore;
  const actAway = match.actualAwayScore;

  // Determinar ganador/resultado predicho
  let predWinner: string;
  if (predHome > predAway) {
    predWinner = match.homeTeam;
  } else if (predHome < predAway) {
    predWinner = match.awayTeam;
  } else {
    // Es un empate
    if (isGroupStage) {
      predWinner = 'DRAW';
    } else {
      // En fase final, si empatan en goles se decide por el ganador predicho
      predWinner = prediction.predictedWinner || 'DRAW';
    }
  }

  // Determinar ganador/resultado real
  let actWinner: string;
  if (actHome > actAway) {
    actWinner = match.homeTeam;
  } else if (actHome < actAway) {
    actWinner = match.awayTeam;
  } else {
    // Es un empate
    if (isGroupStage) {
      actWinner = 'DRAW';
    } else {
      // En fase final, se decide por el ganador real cargado
      actWinner = match.actualWinner || 'DRAW';
    }
  }

  const isExactScore = predHome === actHome && predAway === actAway;
  const isWinnerCorrect = predWinner === actWinner && predWinner !== 'DRAW';
  // Si ambos predijeron empate y terminó en empate, se considera resultado correcto de tendencia
  const isDrawOutcomeCorrect = predHome === predAway && actHome === actAway;

  const isOutcomeCorrect = isWinnerCorrect || isDrawOutcomeCorrect;

  const predTotalGoals = predHome + predAway;
  const actTotalGoals = actHome + actAway;
  const isTotalGoalsCorrect = predTotalGoals === actTotalGoals;

  // --- REGLA 1: Fase final + empate exacto + penales exactos = 8 puntos ---
  if (!isGroupStage && actHome === actAway && predHome === predAway) {
    if (isExactScore) {
      const predHomePenalties = prediction.predictedHomePenalties;
      const predAwayPenalties = prediction.predictedAwayPenalties;
      const actHomePenalties = match.actualHomePenalties;
      const actAwayPenalties = match.actualAwayPenalties;

      if (
        predHomePenalties !== null &&
        predAwayPenalties !== null &&
        actHomePenalties !== null &&
        actAwayPenalties !== null &&
        predHomePenalties === actHomePenalties &&
        predAwayPenalties === actAwayPenalties
      ) {
        return { points: 8, reason: 'Empate exacto + penales exactos' };
      }
    }
  }

  // --- REGLA 2: Resultado exacto = 6 puntos ---
  if (isExactScore) {
    return { points: 6, reason: 'Resultado exacto' };
  }

  // --- REGLA 3: Ganador correcto + sumatoria total de goles correcta = 5 puntos ---
  if (isOutcomeCorrect && isTotalGoalsCorrect) {
    return { points: 5, reason: 'Tendencia + sumatoria de goles' };
  }

  // --- REGLA 4: Tendencia correcta (ganador/empate) = 4 puntos ---
  if (isOutcomeCorrect) {
    return { points: 4, reason: 'Tendencia correcta (ganador/empate)' };
  }

  // --- REGLA 5: Solo sumatoria total de goles correcta = 1 punto ---
  if (isTotalGoalsCorrect) {
    return { points: 1, reason: 'Solo sumatoria de goles' };
  }

  // --- REGLA 6: Ninguna coincidencia = 0 puntos ---
  return { points: 0, reason: 'Sin puntos' };
}
