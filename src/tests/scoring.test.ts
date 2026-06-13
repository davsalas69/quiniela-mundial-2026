import { describe, test, expect } from 'vitest';
import { calculateMatchScore, PredictionInput, MatchInput } from '../lib/scoring';

describe('Quiniela Scoring Engine Tests', () => {
  // Configuración de equipos base
  const homeTeam = 'Argentina';
  const awayTeam = 'Francia';

  // --- REGLA 1: Fase final + empate exacto + penales exactos = 8 puntos ---
  test('Debería retornar 8 puntos por Empate exacto + penales exactos en Fase Final', () => {
    const prediction: PredictionInput = {
      predictedHomeScore: 1,
      predictedAwayScore: 1,
      predictedHomePenalties: 4,
      predictedAwayPenalties: 3,
      predictedWinner: 'Argentina',
    };

    const match: MatchInput = {
      stage: 'FINAL',
      homeTeam,
      awayTeam,
      actualHomeScore: 1,
      actualAwayScore: 1,
      actualHomePenalties: 4,
      actualAwayPenalties: 3,
      actualWinner: 'Argentina',
    };

    const result = calculateMatchScore(prediction, match);
    expect(result.points).toBe(8);
    expect(result.reason).toBe('Empate exacto + penales exactos');
  });

  // --- REGLA 2: Resultado exacto = 6 puntos ---
  test('Debería retornar 6 puntos por Resultado exacto', () => {
    const prediction: PredictionInput = {
      predictedHomeScore: 2,
      predictedAwayScore: 1,
      predictedHomePenalties: null,
      predictedAwayPenalties: null,
      predictedWinner: null,
    };

    const match: MatchInput = {
      stage: 'GROUP_STAGE',
      homeTeam,
      awayTeam,
      actualHomeScore: 2,
      actualAwayScore: 1,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: null,
    };

    const result = calculateMatchScore(prediction, match);
    expect(result.points).toBe(6);
    expect(result.reason).toBe('Resultado exacto');
  });

  test('Fase de grupos no debe usar regla de penales (máximo 6 puntos por empate exacto)', () => {
    const prediction: PredictionInput = {
      predictedHomeScore: 1,
      predictedAwayScore: 1,
      predictedHomePenalties: 4,
      predictedAwayPenalties: 3,
      predictedWinner: null,
    };

    const match: MatchInput = {
      stage: 'GROUP_STAGE',
      homeTeam,
      awayTeam,
      actualHomeScore: 1,
      actualAwayScore: 1,
      actualHomePenalties: 4,
      actualAwayPenalties: 3,
      actualWinner: null,
    };

    const result = calculateMatchScore(prediction, match);
    expect(result.points).toBe(6); // Max 6 in group stage even with matching penalties
    expect(result.reason).toBe('Resultado exacto');
  });

  test('Debería retornar 6 puntos si acierta empate exacto en fase final pero falla los penales', () => {
    const prediction: PredictionInput = {
      predictedHomeScore: 1,
      predictedAwayScore: 1,
      predictedHomePenalties: 4,
      predictedAwayPenalties: 3,
      predictedWinner: 'Argentina',
    };

    const match: MatchInput = {
      stage: 'FINAL',
      homeTeam,
      awayTeam,
      actualHomeScore: 1,
      actualAwayScore: 1,
      actualHomePenalties: 5,
      actualAwayPenalties: 4,
      actualWinner: 'Argentina',
    };

    const result = calculateMatchScore(prediction, match);
    expect(result.points).toBe(6);
    expect(result.reason).toBe('Resultado exacto');
  });

  // --- REGLA 3: Ganador correcto + sumatoria total de goles correcta = 5 puntos ---
  test('Debería retornar 5 puntos por Ganador correcto + sumatoria total de goles correcta', () => {
    // Predicción: 3 - 1 (Ganador: Argentina, total goles: 4)
    const prediction: PredictionInput = {
      predictedHomeScore: 3,
      predictedAwayScore: 1,
      predictedHomePenalties: null,
      predictedAwayPenalties: null,
      predictedWinner: null,
    };

    // Resultado: 4 - 0 (Ganador: Argentina, total goles: 4)
    const match: MatchInput = {
      stage: 'GROUP_STAGE',
      homeTeam,
      awayTeam,
      actualHomeScore: 4,
      actualAwayScore: 0,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: null,
    };

    const result = calculateMatchScore(prediction, match);
    expect(result.points).toBe(5);
    expect(result.reason).toBe('Tendencia + sumatoria de goles');
  });

  // --- REGLA 4: Solo ganador correcto = 4 puntos ---
  test('Debería retornar 4 puntos por Solo ganador correcto', () => {
    // Predicción: 2 - 0 (Ganador: Argentina)
    const prediction: PredictionInput = {
      predictedHomeScore: 2,
      predictedAwayScore: 0,
      predictedHomePenalties: null,
      predictedAwayPenalties: null,
      predictedWinner: null,
    };

    // Resultado: 1 - 0 (Ganador: Argentina, total goles: 1. Total goles no coincide.)
    const match: MatchInput = {
      stage: 'GROUP_STAGE',
      homeTeam,
      awayTeam,
      actualHomeScore: 1,
      actualAwayScore: 0,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: null,
    };

    const result = calculateMatchScore(prediction, match);
    expect(result.points).toBe(4);
    expect(result.reason).toBe('Tendencia correcta (ganador/empate)');
  });

  test('Debería retornar 4 puntos por acertar empate (resultado correcto) en fase de grupos', () => {
    // Predicción: 1 - 1 (Empate, total goles: 2)
    const prediction: PredictionInput = {
      predictedHomeScore: 1,
      predictedAwayScore: 1,
      predictedHomePenalties: null,
      predictedAwayPenalties: null,
      predictedWinner: null,
    };

    // Resultado: 2 - 2 (Empate, total goles: 4. Marcador y total no coinciden)
    const match: MatchInput = {
      stage: 'GROUP_STAGE',
      homeTeam,
      awayTeam,
      actualHomeScore: 2,
      actualAwayScore: 2,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: null,
    };

    const result = calculateMatchScore(prediction, match);
    expect(result.points).toBe(4);
    expect(result.reason).toBe('Tendencia correcta (ganador/empate)');
  });

  // --- REGLA 5: Solo sumatoria total de goles correcta = 1 punto ---
  test('Debería retornar 1 punto por Solo sumatoria total de goles correcta', () => {
    // Predicción: 2 - 1 (Ganador: Argentina, total goles: 3)
    const prediction: PredictionInput = {
      predictedHomeScore: 2,
      predictedAwayScore: 1,
      predictedHomePenalties: null,
      predictedAwayPenalties: null,
      predictedWinner: null,
    };

    // Resultado: 1 - 2 (Ganador: Francia, total goles: 3)
    const match: MatchInput = {
      stage: 'GROUP_STAGE',
      homeTeam,
      awayTeam,
      actualHomeScore: 1,
      actualAwayScore: 2,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: null,
    };

    const result = calculateMatchScore(prediction, match);
    expect(result.points).toBe(1);
    expect(result.reason).toBe('Solo sumatoria de goles');
  });

  // --- REGLA 6: Ninguna coincidencia = 0 puntos ---
  test('Debería retornar 0 puntos por Ninguna coincidencia', () => {
    // Predicción: 3 - 0 (Ganador: Argentina, total goles: 3)
    const prediction: PredictionInput = {
      predictedHomeScore: 3,
      predictedAwayScore: 0,
      predictedHomePenalties: null,
      predictedAwayPenalties: null,
      predictedWinner: null,
    };

    // Resultado: 0 - 2 (Ganador: Francia, total goles: 2)
    const match: MatchInput = {
      stage: 'GROUP_STAGE',
      homeTeam,
      awayTeam,
      actualHomeScore: 0,
      actualAwayScore: 2,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: null,
    };

    const result = calculateMatchScore(prediction, match);
    expect(result.points).toBe(0);
    expect(result.reason).toBe('Sin puntos');
  });

  // --- Casos Incompletos ---
  test('Debería retornar 0 puntos si la predicción es incompleta', () => {
    const prediction: PredictionInput = {
      predictedHomeScore: null,
      predictedAwayScore: 1,
      predictedHomePenalties: null,
      predictedAwayPenalties: null,
      predictedWinner: null,
    };

    const match: MatchInput = {
      stage: 'GROUP_STAGE',
      homeTeam,
      awayTeam,
      actualHomeScore: 1,
      actualAwayScore: 1,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: null,
    };

    const result = calculateMatchScore(prediction, match);
    expect(result.points).toBe(0);
    expect(result.reason).toBe('Pendiente de predicción');
  });

  test('Debería retornar 0 puntos si el resultado del partido es incompleto', () => {
    const prediction: PredictionInput = {
      predictedHomeScore: 2,
      predictedAwayScore: 1,
      predictedHomePenalties: null,
      predictedAwayPenalties: null,
      predictedWinner: null,
    };

    const match: MatchInput = {
      stage: 'GROUP_STAGE',
      homeTeam,
      awayTeam,
      actualHomeScore: null,
      actualAwayScore: 1,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: null,
    };

    const result = calculateMatchScore(prediction, match);
    expect(result.points).toBe(0);
    expect(result.reason).toBe('Pendiente de resultado');
  });

  test('Debería retornar 4 puntos si predice empate y resulta en empate en Fase Final, aunque el marcador exacto y penales difieran', () => {
    const prediction: PredictionInput = {
      predictedHomeScore: 1,
      predictedAwayScore: 1,
      predictedHomePenalties: 4,
      predictedAwayPenalties: 3,
      predictedWinner: 'Argentina',
    };

    const match: MatchInput = {
      stage: 'FINAL',
      homeTeam,
      awayTeam,
      actualHomeScore: 2,
      actualAwayScore: 2,
      actualHomePenalties: 5,
      actualAwayPenalties: 6,
      actualWinner: 'Francia',
    };

    const result = calculateMatchScore(prediction, match);
    expect(result.points).toBe(4);
    expect(result.reason).toBe('Tendencia correcta (ganador/empate)');
  });
});
