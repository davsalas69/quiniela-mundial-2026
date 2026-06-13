export interface ExternalMatch {
  externalApiId: string;
  stage: string;
  groupName?: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: Date;
  status: string; // SCHEDULED, IN_PROGRESS, FINISHED
}

export interface ExternalMatchResult {
  externalApiId: string;
  status: string;
  homeScore?: number;
  awayScore?: number;
  homePenalties?: number;
  awayPenalties?: number;
  winner?: string;
}

export interface FootballResultsProvider {
  /**
   * Obtiene la lista de partidos programados del torneo.
   */
  fetchMatches(): Promise<ExternalMatch[]>;

  /**
   * Obtiene los resultados de los partidos jugados.
   */
  fetchResults(): Promise<ExternalMatchResult[]>;
}

/**
 * Implementación de ejemplo (Mock) del proveedor de resultados.
 * En el futuro se puede conectar con APIs externas como football-data.org, API-Football, etc.
 */
export class MockFootballResultsProvider implements FootballResultsProvider {
  async fetchMatches(): Promise<ExternalMatch[]> {
    console.log('[MockFootballResultsProvider] Obteniendo partidos de la API externa...');
    
    // Retorna una lista mockeada
    return [
      {
        externalApiId: 'ext-match-1',
        stage: 'GROUP_STAGE',
        groupName: 'Grupo A',
        homeTeam: 'México',
        awayTeam: 'Colombia',
        kickoffAt: new Date('2026-06-11T18:00:00Z'),
        status: 'SCHEDULED',
      },
      {
        externalApiId: 'ext-match-2',
        stage: 'GROUP_STAGE',
        groupName: 'Grupo B',
        homeTeam: 'USA',
        awayTeam: 'Canadá',
        kickoffAt: new Date('2026-06-12T15:00:00Z'),
        status: 'FINISHED',
      },
      {
        externalApiId: 'ext-match-3',
        stage: 'GROUP_STAGE',
        groupName: 'Grupo C',
        homeTeam: 'Argentina',
        awayTeam: 'España',
        kickoffAt: new Date('2026-06-13T20:00:00Z'),
        status: 'FINISHED',
      }
    ];
  }

  async fetchResults(): Promise<ExternalMatchResult[]> {
    console.log('[MockFootballResultsProvider] Obteniendo resultados de la API externa...');
    
    // Retorna resultados mockeados
    return [
      {
        externalApiId: 'ext-match-2',
        status: 'FINISHED',
        homeScore: 2,
        awayScore: 1,
      },
      {
        externalApiId: 'ext-match-3',
        status: 'FINISHED',
        homeScore: 4,
        awayScore: 0,
      }
    ];
  }
}
