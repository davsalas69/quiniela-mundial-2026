import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../lib/db';
import { syncTournament, processNormalizedFixture } from '../lib/sync-service';
import { ApiFootballProvider } from '../lib/api-football-provider';
import { FootballDataProvider } from '../lib/football-data-provider';
import { NormalizedFixture } from '../lib/results-provider';

// Mock the provider classes
vi.mock('../lib/api-football-provider');
vi.mock('../lib/football-data-provider');

describe('Synchronization Engine Tests', () => {
  let mockProviderInstance: any;

  beforeEach(async () => {
    // Clean up tables
    await prisma.score.deleteMany({});
    await prisma.prediction.deleteMany({});
    await prisma.match.deleteMany({});
    await prisma.syncLog.deleteMany({});

    vi.clearAllMocks();

    mockProviderInstance = {
      fetchTournamentFixtures: vi.fn().mockResolvedValue([]),
      fetchFixturesByDate: vi.fn().mockResolvedValue([]),
      fetchFixtureById: vi.fn().mockResolvedValue(null),
      fetchLiveFixtures: vi.fn().mockResolvedValue([]),
    };

    (ApiFootballProvider as any).mockImplementation(function() {
      return mockProviderInstance;
    });

    (FootballDataProvider as any).mockImplementation(function() {
      return mockProviderInstance;
    });
  });

  afterEach(async () => {
    await prisma.score.deleteMany({});
    await prisma.prediction.deleteMany({});
    await prisma.match.deleteMany({});
    await prisma.syncLog.deleteMany({});
  });

  // 1. Fixtures programados
  test('1. Debería registrar un partido programado correctamente', async () => {
    const fixture: NormalizedFixture = {
      externalApiId: 'ext-1',
      stage: 'GROUP_STAGE',
      groupName: 'Grupo A',
      homeTeam: 'México',
      awayTeam: 'Colombia',
      kickoffAt: new Date('2026-06-11T18:00:00Z'),
      status: 'SCHEDULED',
      actualHomeScore: null,
      actualAwayScore: null,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: null,
    };

    const status = await processNormalizedFixture(fixture);
    expect(status).toBe('CREATED');

    const dbMatch = await prisma.match.findUnique({ where: { externalApiId: 'ext-1' } });
    expect(dbMatch).toBeDefined();
    expect(dbMatch?.status).toBe('SCHEDULED');
    expect(dbMatch?.resultSource).toBe('NONE');
    expect(dbMatch?.actualHomeScore).toBeNull();
  });

  // 2. Fixtures finalizados
  test('2. Debería registrar un partido finalizado con marcador', async () => {
    const fixture: NormalizedFixture = {
      externalApiId: 'ext-2',
      stage: 'GROUP_STAGE',
      groupName: 'Grupo B',
      homeTeam: 'USA',
      awayTeam: 'Canadá',
      kickoffAt: new Date('2026-06-12T15:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 2,
      actualAwayScore: 1,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: 'USA',
    };

    const status = await processNormalizedFixture(fixture);
    expect(status).toBe('CREATED');

    const dbMatch = await prisma.match.findUnique({ where: { externalApiId: 'ext-2' } });
    expect(dbMatch?.status).toBe('FINISHED');
    expect(dbMatch?.actualHomeScore).toBe(2);
    expect(dbMatch?.actualAwayScore).toBe(1);
    expect(dbMatch?.resultSource).toBe('API');
  });

  // 3. Empate
  test('3. Debería registrar un partido empatado sin ganador', async () => {
    const fixture: NormalizedFixture = {
      externalApiId: 'ext-3',
      stage: 'GROUP_STAGE',
      groupName: 'Grupo C',
      homeTeam: 'Argentina',
      awayTeam: 'España',
      kickoffAt: new Date('2026-06-13T20:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 1,
      actualAwayScore: 1,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: null,
    };

    await processNormalizedFixture(fixture);

    const dbMatch = await prisma.match.findUnique({ where: { externalApiId: 'ext-3' } });
    expect(dbMatch?.actualHomeScore).toBe(1);
    expect(dbMatch?.actualAwayScore).toBe(1);
    expect(dbMatch?.actualWinner).toBeNull();
  });

  // 4. Tiempo extra
  test('4. Debería procesar resultados de tiempo extra sin penales', async () => {
    const fixture: NormalizedFixture = {
      externalApiId: 'ext-4',
      stage: 'ROUND_OF_16',
      groupName: null,
      homeTeam: 'Alemania',
      awayTeam: 'Japón',
      kickoffAt: new Date('2026-06-15T14:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 3,
      actualAwayScore: 2,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: 'Alemania',
    };

    await processNormalizedFixture(fixture);

    const dbMatch = await prisma.match.findUnique({ where: { externalApiId: 'ext-4' } });
    expect(dbMatch?.actualHomeScore).toBe(3);
    expect(dbMatch?.actualWinner).toBe('Alemania');
    expect(dbMatch?.actualHomePenalties).toBeNull();
  });

  // 5. Penales
  test('5. Debería registrar marcador y penales en empate de eliminación directa', async () => {
    const fixture: NormalizedFixture = {
      externalApiId: 'ext-5',
      stage: 'ROUND_OF_32',
      groupName: null,
      homeTeam: 'Francia',
      awayTeam: 'Inglaterra',
      kickoffAt: new Date('2026-06-25T19:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 2,
      actualAwayScore: 2,
      actualHomePenalties: 4,
      actualAwayPenalties: 3,
      actualWinner: 'Francia',
    };

    await processNormalizedFixture(fixture);

    const dbMatch = await prisma.match.findUnique({ where: { externalApiId: 'ext-5' } });
    expect(dbMatch?.actualHomeScore).toBe(2);
    expect(dbMatch?.actualAwayScore).toBe(2);
    expect(dbMatch?.actualHomePenalties).toBe(4);
    expect(dbMatch?.actualAwayPenalties).toBe(3);
    expect(dbMatch?.actualWinner).toBe('Francia');
  });

  // 6. Cancelado
  test('6. Debería marcar un partido como CANCELLED', async () => {
    const fixture: NormalizedFixture = {
      externalApiId: 'ext-6',
      stage: 'GROUP_STAGE',
      groupName: 'Grupo D',
      homeTeam: 'Brasil',
      awayTeam: 'Uruguay',
      kickoffAt: new Date('2026-06-14T17:00:00Z'),
      status: 'CANCELLED',
      actualHomeScore: null,
      actualAwayScore: null,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: null,
    };

    await processNormalizedFixture(fixture);

    const dbMatch = await prisma.match.findUnique({ where: { externalApiId: 'ext-6' } });
    expect(dbMatch?.status).toBe('CANCELLED');
  });

  // 7. Suspendido
  test('7. Debería marcar un partido como SUSPENDED', async () => {
    const fixture: NormalizedFixture = {
      externalApiId: 'ext-7',
      stage: 'GROUP_STAGE',
      groupName: 'Grupo E',
      homeTeam: 'Italia',
      awayTeam: 'Bélgica',
      kickoffAt: new Date('2026-07-04T18:00:00Z'),
      status: 'SUSPENDED',
      actualHomeScore: null,
      actualAwayScore: null,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: null,
    };

    await processNormalizedFixture(fixture);

    const dbMatch = await prisma.match.findUnique({ where: { externalApiId: 'ext-7' } });
    expect(dbMatch?.status).toBe('SUSPENDED');
  });

  // 8. Respuesta incompleta / mal formada
  test('8. Debería fallar la normalización ante datos incompletos en el proveedor', async () => {
    const { ApiFootballProvider: RealProvider } = await vi.importActual<typeof import('../lib/api-football-provider')>('../lib/api-football-provider');
    const provider = new RealProvider();
    
    expect(() => provider.normalizeFixture({})).toThrow('Malformed fixture data from API');
    expect(() => provider.normalizeFixture({ fixture: {} })).toThrow();
  });

  // 9. Rate Limit
  test('9. Debería registrar un fallo en SyncLog si ocurre un error de Rate Limit', async () => {
    mockProviderInstance.fetchTournamentFixtures.mockRejectedValue(new Error('API Football Error: {"rateLimit": "Limit Exceeded"}'));

    const result = await syncTournament('FULL');
    expect(result.success).toBe(false);

    const log = await prisma.syncLog.findFirst({ orderBy: { startedAt: 'desc' } });
    expect(log?.status).toBe('FAILED');
    expect(log?.message).toContain('Limit Exceeded');
  });

  // 10. Clave ausente
  test('10. Debería registrar fallo si no hay clave de API', async () => {
    mockProviderInstance.fetchTournamentFixtures.mockRejectedValue(new Error('API_FOOTBALL_KEY is not configured'));

    const result = await syncTournament('FULL');
    expect(result.success).toBe(false);

    const log = await prisma.syncLog.findFirst({ orderBy: { startedAt: 'desc' } });
    expect(log?.status).toBe('FAILED');
    expect(log?.message).toContain('API_FOOTBALL_KEY is not configured');
  });

  // 11. Doble sincronización (prevención de concurrencia)
  test('11. Debería rechazar sincronización concurrente', async () => {
    // Crear log activo
    await prisma.syncLog.create({
      data: {
        provider: 'API-Football',
        syncType: 'FULL',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      }
    });

    const result = await syncTournament('FULL');
    expect(result.success).toBe(false);
    expect(result.message).toContain('Another execution (FULL) is currently in progress');
  });

  // 12. No duplicados (Idempotencia)
  test('12. Debería evitar crear duplicados del mismo partido', async () => {
    const fixture: NormalizedFixture = {
      externalApiId: 'ext-12',
      stage: 'GROUP_STAGE',
      groupName: 'Grupo F',
      homeTeam: 'Portugal',
      awayTeam: 'Croacia',
      kickoffAt: new Date('2026-06-20T18:00:00Z'),
      status: 'SCHEDULED',
      actualHomeScore: null,
      actualAwayScore: null,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: null,
    };

    const status1 = await processNormalizedFixture(fixture);
    const status2 = await processNormalizedFixture(fixture);

    expect(status1).toBe('CREATED');
    expect(status2).toBe('UPDATED'); // should update instead of creating a second match

    const matches = await prisma.match.findMany({ where: { externalApiId: 'ext-12' } });
    expect(matches.length).toBe(1);
  });

  // 13. Protección de MANUAL_REAL
  test('13. Debería proteger marcadores ingresados manualmente (MANUAL_REAL)', async () => {
    const match = await prisma.match.create({
      data: {
        externalApiId: 'ext-13',
        stage: 'GROUP_STAGE',
        groupName: 'Grupo A',
        homeTeam: 'México',
        awayTeam: 'Colombia',
        kickoffAt: new Date('2026-06-11T18:00:00Z'),
        status: 'FINISHED',
        actualHomeScore: 5,
        actualAwayScore: 5,
        resultSource: 'MANUAL_REAL',
      }
    });

    const fixture: NormalizedFixture = {
      externalApiId: 'ext-13',
      stage: 'GROUP_STAGE',
      groupName: 'Grupo A',
      homeTeam: 'México',
      awayTeam: 'Colombia',
      kickoffAt: new Date('2026-06-11T18:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 1, // Difieren del manual
      actualAwayScore: 0,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: null,
    };

    const status = await processNormalizedFixture(fixture);
    expect(status).toBe('SKIPPED');

    const dbMatch = await prisma.match.findUnique({ where: { id: match.id } });
    expect(dbMatch?.actualHomeScore).toBe(5); // should be preserved
    expect(dbMatch?.actualAwayScore).toBe(5);
  });

  // 14. Reemplazo de MANUAL_SIMULATION
  test('14. Debería sobrescribir MANUAL_SIMULATION únicamente si hay un resultado activo en la API', async () => {
    const match = await prisma.match.create({
      data: {
        externalApiId: 'ext-14',
        stage: 'GROUP_STAGE',
        groupName: 'Grupo B',
        homeTeam: 'USA',
        awayTeam: 'Canadá',
        kickoffAt: new Date('2026-06-12T15:00:00Z'),
        status: 'MANUAL_PROJECTION',
        actualHomeScore: 9,
        actualAwayScore: 9,
        resultSource: 'MANUAL_SIMULATION',
      }
    });

    // Case A: API dice SCHEDULED (no iniciado) -> Se mantiene simulación
    const fixtureScheduled: NormalizedFixture = {
      externalApiId: 'ext-14',
      stage: 'GROUP_STAGE',
      groupName: 'Grupo B',
      homeTeam: 'USA',
      awayTeam: 'Canadá',
      kickoffAt: new Date('2026-06-12T15:00:00Z'),
      status: 'SCHEDULED',
      actualHomeScore: null,
      actualAwayScore: null,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: null,
    };

    const statusA = await processNormalizedFixture(fixtureScheduled);
    expect(statusA).toBe('SKIPPED');
    let dbMatch = await prisma.match.findUnique({ where: { id: match.id } });
    expect(dbMatch?.actualHomeScore).toBe(9); // Se mantiene

    // Case B: API dice FINISHED -> Se sobrescribe
    const fixtureFinished: NormalizedFixture = {
      externalApiId: 'ext-14',
      stage: 'GROUP_STAGE',
      groupName: 'Grupo B',
      homeTeam: 'USA',
      awayTeam: 'Canadá',
      kickoffAt: new Date('2026-06-12T15:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 2,
      actualAwayScore: 1,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: 'USA',
    };

    const statusB = await processNormalizedFixture(fixtureFinished);
    expect(statusB).toBe('UPDATED');
    dbMatch = await prisma.match.findUnique({ where: { id: match.id } });
    expect(dbMatch?.actualHomeScore).toBe(2); // Sobrescrito
    expect(dbMatch?.resultSource).toBe('API');
  });

  // 15. Recálculo de puntaje
  test('15. Debería recalcular puntajes de usuario al actualizar el resultado del partido', async () => {
    const match = await prisma.match.create({
      data: {
        externalApiId: 'ext-15',
        stage: 'GROUP_STAGE',
        groupName: 'Grupo C',
        homeTeam: 'Argentina',
        awayTeam: 'España',
        kickoffAt: new Date('2026-06-13T20:00:00Z'),
        status: 'SCHEDULED',
        resultSource: 'NONE',
      }
    });

    // Predicción de usuario: 2-1
    await prisma.prediction.create({
      data: {
        matchId: match.id,
        predictedHomeScore: 2,
        predictedAwayScore: 1,
      }
    });

    // API actualiza a 2-1 FINISHED
    const fixture: NormalizedFixture = {
      externalApiId: 'ext-15',
      stage: 'GROUP_STAGE',
      groupName: 'Grupo C',
      homeTeam: 'Argentina',
      awayTeam: 'España',
      kickoffAt: new Date('2026-06-13T20:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 2,
      actualAwayScore: 1,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: 'Argentina',
    };

    await processNormalizedFixture(fixture);

    // Comprobar puntaje recalculado en la base de datos
    const score = await prisma.score.findUnique({ where: { matchId: match.id } });
    expect(score).toBeDefined();
    expect(score?.points).toBe(6); // Exact match points
  });

  // 16. Matching Excel/API & Vincular ID temporal EXCEL-* sin duplicados
  test('16. Debería vincular un partido creado vía Excel con el ID real de la API si coincide de forma inequívoca', async () => {
    // Crear partido preliminar de Excel
    const match = await prisma.match.create({
      data: {
        externalApiId: 'EXCEL-10',
        stage: 'GROUP_STAGE',
        groupName: 'Grupo A',
        homeTeam: 'México',
        awayTeam: 'Colombia',
        kickoffAt: new Date('2026-06-11T18:00:00Z'),
        status: 'SCHEDULED',
        resultSource: 'EXCEL',
      }
    });

    // Crear predicción para verificar que se conserva
    const pred = await prisma.prediction.create({
      data: {
        matchId: match.id,
        predictedHomeScore: 2,
        predictedAwayScore: 1,
      }
    });

    // Fixture de la API con ID real
    const fixture: NormalizedFixture = {
      externalApiId: 'api-real-100',
      stage: 'GROUP_STAGE',
      groupName: 'Grupo A',
      homeTeam: 'Mexico', // Spelling normalized
      awayTeam: 'Colombia',
      kickoffAt: new Date('2026-06-11T18:30:00Z'), // Tolerancia < 1 día
      status: 'FINISHED',
      actualHomeScore: 3,
      actualAwayScore: 2,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: 'Mexico',
    };

    const status = await processNormalizedFixture(fixture);
    expect(status).toBe('UPDATED'); // Se actualiza el registro existente en lugar de crear uno nuevo

    // Verificar que el ID de la API se vinculó al registro existente
    const dbMatch = await prisma.match.findUnique({ where: { externalApiId: 'api-real-100' } });
    expect(dbMatch).toBeDefined();
    expect(dbMatch?.id).toBe(match.id); // Conserva el id autogenerado original
    expect(dbMatch?.homeTeam).toBe('Mexico'); // Nombre actualizado por la API
    expect(dbMatch?.actualHomeScore).toBe(3);
    expect(dbMatch?.resultSource).toBe('API');

    // Verificar que las predicciones asociadas se conservaron perfectamente
    const dbPred = await prisma.prediction.findUnique({ where: { id: pred.id } });
    expect(dbPred).toBeDefined();
    expect(dbPred?.matchId).toBe(match.id);
  });

  // 17. Matching ambiguo
  test('17. Debería ignorar la vinculación automática si hay coincidencias ambiguas (múltiples candidatos)', async () => {
    // Crear dos partidos muy similares
    await prisma.match.create({
      data: {
        externalApiId: 'EXCEL-20',
        stage: 'GROUP_STAGE',
        groupName: 'Grupo A',
        homeTeam: 'México',
        awayTeam: 'Colombia',
        kickoffAt: new Date('2026-06-11T18:00:00Z'),
        status: 'SCHEDULED',
        resultSource: 'EXCEL',
      }
    });

    await prisma.match.create({
      data: {
        externalApiId: 'EXCEL-21',
        stage: 'GROUP_STAGE',
        groupName: 'Grupo A',
        homeTeam: 'Mexico',
        awayTeam: 'Colombia',
        kickoffAt: new Date('2026-06-11T18:15:00Z'),
        status: 'SCHEDULED',
        resultSource: 'EXCEL',
      }
    });

    const fixture: NormalizedFixture = {
      externalApiId: 'api-real-200',
      stage: 'GROUP_STAGE',
      groupName: 'Grupo A',
      homeTeam: 'Mexico',
      awayTeam: 'Colombia',
      kickoffAt: new Date('2026-06-11T18:10:00Z'),
      status: 'FINISHED',
      actualHomeScore: 1,
      actualAwayScore: 0,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: 'Mexico',
    };

    const status = await processNormalizedFixture(fixture);
    expect(status).toBe('SKIPPED'); // No se enlaza automáticamente por ambigüedad
  });
});

describe('FootballDataProvider Tests', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('Debería incluir el header X-Auth-Token y baseUrl correcto', async () => {
    process.env.FOOTBALL_DATA_API_KEY = 'test-token-123';
    process.env.FOOTBALL_DATA_BASE_URL = 'https://api.test-football.org';

    const mockResponse = {
      matches: [
        {
          id: 1001,
          utcDate: '2026-06-11T22:00:00Z',
          status: 'FINISHED',
          stage: 'GROUP_STAGE',
          group: 'GROUP_A',
          homeTeam: { name: 'Mexico' },
          awayTeam: { name: 'Colombia' },
          score: {
            winner: 'HOME_TEAM',
            duration: 'REGULAR',
            fullTime: { home: 2, away: 1 }
          }
        }
      ]
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const { FootballDataProvider: RealFootballDataProvider } = await vi.importActual<typeof import('../lib/football-data-provider')>('../lib/football-data-provider');
    const provider = new RealFootballDataProvider();

    const fixtures = await provider.fetchTournamentFixtures();
    
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test-football.org/competitions/WC/matches?season=2026',
      expect.objectContaining({
        headers: {
          'X-Auth-Token': 'test-token-123',
          'Accept': 'application/json',
        }
      })
    );

    expect(fixtures.length).toBe(1);
    expect(fixtures[0].externalApiId).toBe('1001');
    expect(fixtures[0].actualHomeScore).toBe(2);
    expect(fixtures[0].actualAwayScore).toBe(1);
    expect(fixtures[0].actualWinner).toBe('Mexico');
  });

  test('Debería manejar errores de temporada no disponible (403) y rate limit (429)', async () => {
    const { FootballDataProvider: RealFootballDataProvider } = await vi.importActual<typeof import('../lib/football-data-provider')>('../lib/football-data-provider');
    const provider = new RealFootballDataProvider();

    // Case A: 403 Forbidden
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Free plans do not have access to this season' }),
    });

    await expect(provider.fetchTournamentFixtures()).rejects.toThrow('API Error: Free plans do not have access to this season');

    // Case B: 429 Rate Limit
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ message: 'Rate limit exceeded' }),
    });

    await expect(provider.fetchTournamentFixtures()).rejects.toThrow('API Rate Limit Exceeded');
  });

  test('Debería normalizar prórroga y penales correctamente', async () => {
    const mockApiFixture = {
      id: 2002,
      utcDate: '2026-07-15T20:00:00Z',
      status: 'FINISHED',
      stage: 'FINAL',
      group: null,
      homeTeam: { name: 'Argentina' },
      awayTeam: { name: 'France' },
      score: {
        winner: 'HOME_TEAM',
        duration: 'PENALTY_SHOOTOUT',
        fullTime: { home: 3, away: 3 },
        penalties: { home: 4, away: 2 }
      }
    };

    const { FootballDataProvider: RealFootballDataProvider } = await vi.importActual<typeof import('../lib/football-data-provider')>('../lib/football-data-provider');
    const provider = new RealFootballDataProvider();

    const normalized = provider.normalizeFixture(mockApiFixture);

    expect(normalized.externalApiId).toBe('2002');
    expect(normalized.stage).toBe('FINAL');
    expect(normalized.actualHomeScore).toBe(3);
    expect(normalized.actualAwayScore).toBe(3);
    expect(normalized.actualHomePenalties).toBe(4);
    expect(normalized.actualAwayPenalties).toBe(2);
    expect(normalized.actualWinner).toBe('Argentina');
  });
});
