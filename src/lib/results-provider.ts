export interface NormalizedFixture {
  externalApiId: string;
  stage: string;       // GROUP_STAGE, ROUND_OF_32, ROUND_OF_16, QUARTER_FINAL, SEMI_FINAL, THIRD_PLACE, FINAL
  groupName: string | null;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: Date | null;
  status: string;      // SCHEDULED, IN_PROGRESS, FINISHED, POSTPONED, SUSPENDED, CANCELLED
  actualHomeScore: number | null;
  actualAwayScore: number | null;
  actualHomePenalties: number | null;
  actualAwayPenalties: number | null;
  actualWinner: string | null;
}

export interface FootballResultsProvider {
  /**
   * Obtiene la lista completa de partidos del torneo.
   */
  fetchTournamentFixtures(): Promise<NormalizedFixture[]>;

  /**
   * Obtiene los partidos de una fecha específica (YYYY-MM-DD).
   */
  fetchFixturesByDate(date: string): Promise<NormalizedFixture[]>;

  /**
   * Obtiene un partido por su ID externo.
   */
  fetchFixtureById(externalId: string): Promise<NormalizedFixture | null>;

  /**
   * Obtiene partidos que están en vivo actualmente.
   */
  fetchLiveFixtures(): Promise<NormalizedFixture[]>;

  /**
   * Normaliza los datos crudos del proveedor al formato interno de la aplicación.
   */
  normalizeFixture(apiFixture: any): NormalizedFixture;
}

export class MockFootballResultsProvider implements FootballResultsProvider {
  private mockFixtures: NormalizedFixture[] = [
    {
      externalApiId: 'ext-match-1',
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
    },
    {
      externalApiId: 'ext-match-2',
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
    },
    {
      externalApiId: 'ext-match-3',
      stage: 'GROUP_STAGE',
      groupName: 'Grupo C',
      homeTeam: 'Argentina',
      awayTeam: 'España',
      kickoffAt: new Date('2026-06-13T20:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 4,
      actualAwayScore: 0,
      actualHomePenalties: null,
      actualAwayPenalties: null,
      actualWinner: 'Argentina',
    }
  ];

  async fetchTournamentFixtures(): Promise<NormalizedFixture[]> {
    return this.mockFixtures;
  }

  async fetchFixturesByDate(date: string): Promise<NormalizedFixture[]> {
    return this.mockFixtures.filter(f => f.kickoffAt?.toISOString().split('T')[0] === date);
  }

  async fetchFixtureById(externalId: string): Promise<NormalizedFixture | null> {
    return this.mockFixtures.find(f => f.externalApiId === externalId) || null;
  }

  async fetchLiveFixtures(): Promise<NormalizedFixture[]> {
    return this.mockFixtures.filter(f => f.status === 'IN_PROGRESS');
  }

  normalizeFixture(apiFixture: any): NormalizedFixture {
    return apiFixture as NormalizedFixture;
  }
}
