import { NormalizedFixture, FootballResultsProvider } from './results-provider';

export class ApiFootballProvider implements FootballResultsProvider {
  private key: string;
  private baseUrl: string;

  constructor() {
    this.key = process.env.API_FOOTBALL_KEY || '';
    this.baseUrl = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
  }

  private async apiFetch(endpoint: string): Promise<any> {
    if (!this.key) {
      throw new Error('API_FOOTBALL_KEY is not configured');
    }

    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-apisports-key': this.key,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // API Football rate limit and quotas can return 200 OK but with errors inside the JSON response
      if (data.errors && Object.keys(data.errors).length > 0) {
        // e.g. {"errors": {"rateLimit": "Your rate limit of 10 requests per minute has been exceeded."}}
        const errorMsg = JSON.stringify(data.errors);
        throw new Error(`API Football Error: ${errorMsg}`);
      }

      return data;
    } catch (error: any) {
      if (error.name === 'TimeoutError') {
        throw new Error('API request timed out (10s limit exceeded)');
      }
      throw error;
    }
  }

  async fetchTournamentFixtures(): Promise<NormalizedFixture[]> {
    const data = await this.apiFetch('/fixtures?league=1&season=2026');
    if (!data.response || !Array.isArray(data.response)) {
      throw new Error('Invalid API response format (missing response array)');
    }
    return data.response.map((item: any) => this.normalizeFixture(item));
  }

  async fetchFixturesByDate(date: string): Promise<NormalizedFixture[]> {
    const data = await this.apiFetch(`/fixtures?league=1&season=2026&date=${date}`);
    if (!data.response || !Array.isArray(data.response)) {
      throw new Error('Invalid API response format (missing response array)');
    }
    return data.response.map((item: any) => this.normalizeFixture(item));
  }

  async fetchFixtureById(externalId: string): Promise<NormalizedFixture | null> {
    const data = await this.apiFetch(`/fixtures?id=${externalId}`);
    if (!data.response || !Array.isArray(data.response) || data.response.length === 0) {
      return null;
    }
    return this.normalizeFixture(data.response[0]);
  }

  async fetchLiveFixtures(): Promise<NormalizedFixture[]> {
    const data = await this.apiFetch('/fixtures?league=1&season=2026&live=all');
    if (!data.response || !Array.isArray(data.response)) {
      throw new Error('Invalid API response format (missing response array)');
    }
    return data.response.map((item: any) => this.normalizeFixture(item));
  }

  normalizeFixture(apiFixture: any): NormalizedFixture {
    if (!apiFixture || !apiFixture.fixture || !apiFixture.teams) {
      throw new Error('Malformed fixture data from API');
    }

    const fixture = apiFixture.fixture;
    const league = apiFixture.league;
    const teams = apiFixture.teams;
    const goals = apiFixture.goals || { home: null, away: null };
    const score = apiFixture.score || {};

    const externalApiId = fixture.id.toString();
    const stage = this.normalizeStage(league.round);
    
    // Parse Group Name (e.g. "Group Stage - Group A" -> "Grupo A")
    let groupName: string | null = null;
    if (league.round && league.round.toLowerCase().includes('group')) {
      const match = league.round.match(/Group\s+([A-H])/i);
      if (match) {
        groupName = `Grupo ${match[1].toUpperCase()}`;
      } else {
        // Fallback or cleanup
        groupName = league.round.replace(/Group Stage - /i, '').replace(/Group /i, 'Grupo ');
      }
    }

    const homeTeam = teams.home?.name || 'TBD';
    const awayTeam = teams.away?.name || 'TBD';
    const kickoffAt = fixture.date ? new Date(fixture.date) : null;
    const status = this.normalizeStatus(fixture.status?.short);

    // Main scores (regular time + extra time, but before penalties)
    const actualHomeScore = goals.home !== undefined ? goals.home : null;
    const actualAwayScore = goals.away !== undefined ? goals.away : null;

    // Penalty shootouts
    const actualHomePenalties = score.penalty?.home !== undefined && score.penalty?.home !== null
      ? score.penalty.home
      : null;
    const actualAwayPenalties = score.penalty?.away !== undefined && score.penalty?.away !== null
      ? score.penalty.away
      : null;

    // Winner
    let actualWinner: string | null = null;
    if (teams.home?.winner) {
      actualWinner = homeTeam;
    } else if (teams.away?.winner) {
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

  private normalizeStage(round: string): string {
    if (!round) return 'GROUP_STAGE';
    const r = round.toLowerCase();
    if (r.includes('group')) return 'GROUP_STAGE';
    if (r.includes('32')) return 'ROUND_OF_32';
    if (r.includes('16')) return 'ROUND_OF_16';
    if (r.includes('quarter')) return 'QUARTER_FINAL';
    if (r.includes('semi')) return 'SEMI_FINAL';
    if (r.includes('third') || r.includes('3rd') || r.includes('3 place')) return 'THIRD_PLACE';
    if (r.includes('final')) return 'FINAL';
    return 'GROUP_STAGE';
  }

  private normalizeStatus(shortStatus: string): string {
    if (!shortStatus) return 'SCHEDULED';
    const s = shortStatus.toUpperCase();
    switch (s) {
      case 'NS':
      case 'TBD':
        return 'SCHEDULED';
      case '1H':
      case 'HT':
      case '2H':
      case 'ET':
      case 'BT':
      case 'P':
        return 'IN_PROGRESS';
      case 'FT':
      case 'AET':
      case 'PEN':
        return 'FINISHED';
      case 'SUSP':
      case 'INT':
        return 'SUSPENDED';
      case 'CANC':
      case 'ABD':
        return 'CANCELLED';
      case 'PST':
        return 'POSTPONED';
      default:
        return 'SCHEDULED';
    }
  }
}
