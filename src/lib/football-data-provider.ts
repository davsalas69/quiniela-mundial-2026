import { NormalizedFixture, FootballResultsProvider } from './results-provider';

export class FootballDataProvider implements FootballResultsProvider {
  private key: string;
  private baseUrl: string;

  constructor() {
    this.key = process.env.FOOTBALL_DATA_API_KEY || '';
    this.baseUrl = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';
  }

  private async apiFetch(endpoint: string): Promise<any> {
    if (!this.key) {
      throw new Error('FOOTBALL_DATA_API_KEY is not configured');
    }

    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Auth-Token': this.key,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (response.status === 429) {
        throw new Error('API Rate Limit Exceeded');
      }

      if (!response.ok) {
        let errMsg = `HTTP error! status: ${response.status}`;
        try {
          const errData = await response.json();
          if (errData && errData.message) {
            errMsg = `API Error: ${errData.message}`;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }

      return await response.json();
    } catch (error: any) {
      if (error.name === 'TimeoutError') {
        throw new Error('API request timed out (10s limit exceeded)');
      }
      throw error;
    }
  }

  async fetchTournamentFixtures(): Promise<NormalizedFixture[]> {
    const data = await this.apiFetch('/competitions/WC/matches?season=2026');
    if (!data.matches || !Array.isArray(data.matches)) {
      throw new Error('Invalid API response format (missing matches array)');
    }
    return data.matches.map((item: any) => this.normalizeFixture(item));
  }

  async fetchFixturesByDate(date: string): Promise<NormalizedFixture[]> {
    // Filter matches in-memory to be highly reliable across different plan limits
    const allMatches = await this.fetchTournamentFixtures();
    return allMatches.filter(m => m.kickoffAt?.toISOString().split('T')[0] === date);
  }

  async fetchFixtureById(externalId: string): Promise<NormalizedFixture | null> {
    const data = await this.apiFetch(`/matches/${externalId}`);
    if (!data) return null;
    return this.normalizeFixture(data);
  }

  async fetchLiveFixtures(): Promise<NormalizedFixture[]> {
    // Filter in-memory to support live matches reliably
    const allMatches = await this.fetchTournamentFixtures();
    const liveStatuses = ['IN_PROGRESS', 'LIVE', 'IN_PLAY', 'PAUSED'];
    return allMatches.filter(m => liveStatuses.includes(m.status));
  }

  normalizeFixture(apiFixture: any): NormalizedFixture {
    if (!apiFixture || !apiFixture.id || !apiFixture.homeTeam || !apiFixture.awayTeam) {
      throw new Error('Malformed fixture data from API');
    }

    const externalApiId = apiFixture.id.toString();
    const stage = this.normalizeStage(apiFixture.stage);
    const groupName = this.normalizeGroup(apiFixture.group);

    const homeTeam = apiFixture.homeTeam.name || 'TBD';
    const awayTeam = apiFixture.awayTeam.name || 'TBD';
    const kickoffAt = apiFixture.utcDate ? new Date(apiFixture.utcDate) : null;
    const status = this.normalizeStatus(apiFixture.status);

    const score = apiFixture.score || {};
    const fullTime = score.fullTime || { home: null, away: null };
    const penalties = score.penalties || { home: null, away: null };

    const actualHomeScore = fullTime.home !== undefined && fullTime.home !== null ? fullTime.home : null;
    const actualAwayScore = fullTime.away !== undefined && fullTime.away !== null ? fullTime.away : null;

    const actualHomePenalties = penalties.home !== undefined && penalties.home !== null ? penalties.home : null;
    const actualAwayPenalties = penalties.away !== undefined && penalties.away !== null ? penalties.away : null;

    let actualWinner: string | null = null;
    if (score.winner === 'HOME_TEAM') {
      actualWinner = homeTeam;
    } else if (score.winner === 'AWAY_TEAM') {
      actualWinner = awayTeam;
    }

    return {
      externalApiId,
      stage,
      groupName,
      homeTeam,
      awayTeam,
      kickoffAt,
      status,
      actualHomeScore,
      actualAwayScore,
      actualHomePenalties,
      actualAwayPenalties,
      actualWinner,
    };
  }

  private normalizeStage(apiStage: string): string {
    if (!apiStage) return 'GROUP_STAGE';
    const s = apiStage.toUpperCase();
    if (s.includes('GROUP')) return 'GROUP_STAGE';
    if (s.includes('32') || s.includes('LAST_32') || s.includes('ROUND_OF_32')) return 'ROUND_OF_32';
    if (s.includes('16') || s.includes('LAST_16') || s.includes('ROUND_OF_16')) return 'ROUND_OF_16';
    if (s.includes('QUARTER')) return 'QUARTER_FINAL';
    if (s.includes('SEMI')) return 'SEMI_FINAL';
    if (s.includes('THIRD') || s.includes('3RD') || s.includes('PLACE')) return 'THIRD_PLACE';
    if (s.includes('FINAL')) return 'FINAL';
    return 'GROUP_STAGE';
  }

  private normalizeGroup(group: string | null): string | null {
    if (!group) return null;
    return group.toUpperCase()
      .replace(/GROUP_/g, 'Grupo ')
      .replace(/GROUP /g, 'Grupo ');
  }

  private normalizeStatus(apiStatus: string): string {
    if (!apiStatus) return 'SCHEDULED';
    const s = apiStatus.toUpperCase();
    switch (s) {
      case 'TIMED':
      case 'SCHEDULED':
        return 'SCHEDULED';
      case 'LIVE':
      case 'IN_PLAY':
      case 'IN_PLAY/LIVE':
      case 'PAUSED':
        return 'IN_PROGRESS';
      case 'FINISHED':
        return 'FINISHED';
      case 'POSTPONED':
        return 'POSTPONED';
      case 'SUSPENDED':
        return 'SUSPENDED';
      case 'CANCELLED':
        return 'CANCELLED';
      default:
        return 'SCHEDULED';
    }
  }
}
