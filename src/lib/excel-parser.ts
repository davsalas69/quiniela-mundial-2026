import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { prisma } from './db';

export interface ExcelMatch {
  matchNumber: number;
  stage: string;
  groupName: string | null;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: Date | null;
}

export interface ComparisonReport {
  apiGroupMatchesCount: number;
  excelGroupMatchesCount: number;
  matchedCount: number;
  missingInApi: ExcelMatch[];
  differences: Array<{
    matchNumber: number;
    excelMatch: ExcelMatch;
    dbMatch: {
      id: string;
      homeTeam: string;
      awayTeam: string;
      kickoffAt: Date | null;
      groupName: string | null;
      status: string;
    };
    diffs: string[];
  }>;
  finalStageMatchesCount: number;
}

// Helpers for team and date normalization / matching
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, "") // remove spaces and special chars
    .trim();
}

export function teamsMatch(dbTeam: string, apiTeam: string): boolean {
  const normDb = normalizeTeamName(dbTeam);
  const normApi = normalizeTeamName(apiTeam);
  
  if (normDb === normApi) return true;
  if (normDb.includes(normApi) || normApi.includes(normDb)) return true;
  
  const teamMappings: Record<string, string[]> = {
    'usa': ['unitedstates', 'eeuu', 'estadosunidos'],
    'mexico': ['mexico', 'mex'],
    'saudiarabia': ['saudiarabia', 'arabiasaudita'],
    'morocco': ['marruecos', 'morocco'],
    'spain': ['espana', 'spain'],
    'germany': ['alemania', 'germany'],
    'belgium': ['belgica', 'belgium'],
    'netherlands': ['paisesbajos', 'holanda', 'netherlands'],
    'england': ['inglaterra', 'england'],
    'france': ['francia', 'france'],
    'brazil': ['brasil', 'brazil'],
    'italy': ['italia', 'italy'],
    'croatia': ['croacia', 'croatia'],
    'canada': ['canada'],
    'colombia': ['colombia'],
    'uruguay': ['uruguay'],
    'japan': ['japon', 'japan'],
  };

  const dbMapping = teamMappings[normDb] || [normDb];
  const apiMapping = teamMappings[normApi] || [normApi];

  return dbMapping.some(d => apiMapping.some(a => d === a || d.includes(a) || a.includes(d)));
}

export function isGroupCompatible(groupA: string | null, groupB: string | null): boolean {
  if (!groupA || !groupB) return true;
  const cleanA = groupA.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
  const cleanB = groupB.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
  return cleanA === cleanB || cleanA.includes(cleanB) || cleanB.includes(cleanA);
}

export function isDateCompatible(dateA: Date | null, dateB: Date | null): boolean {
  if (!dateA || !dateB) return true;
  const diffMs = Math.abs(dateA.getTime() - dateB.getTime());
  const oneDayMs = 24 * 60 * 60 * 1000;
  return diffMs <= oneDayMs;
}

export function parseExcelBackup(): ExcelMatch[] {
  const filePath = path.join(process.cwd(), 'data', 'Quiniela-Mundial-Juegos.xlsx');
  
  if (!fs.existsSync(filePath)) {
    throw new Error('Archivo de respaldo no encontrado en la ubicación data/Quiniela-Mundial-Juegos.xlsx');
  }

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet);
  
  const excelMatches: ExcelMatch[] = [];
  
  for (const row of rawRows) {
    const keys = Object.keys(row);
    
    const homeKey = keys.find(k => k.toLowerCase().includes('local') || k.toLowerCase().includes('home') || k.toLowerCase().includes('equipo 1') || k.toLowerCase().includes('equipo1'));
    const awayKey = keys.find(k => k.toLowerCase().includes('visitante') || k.toLowerCase().includes('away') || k.toLowerCase().includes('equipo 2') || k.toLowerCase().includes('equipo2'));
    const dateKey = keys.find(k => k.toLowerCase().includes('fecha') || k.toLowerCase().includes('date') || k.toLowerCase().includes('kickoff') || k.toLowerCase().includes('hora'));
    const groupKey = keys.find(k => k.toLowerCase().includes('grupo') || k.toLowerCase().includes('group'));
    const numKey = keys.find(k => k.toLowerCase().includes('juego') || k.toLowerCase().includes('match') || k.toLowerCase().includes('nro') || k.toLowerCase().includes('numero') || k.toLowerCase().includes('no'));

    if (homeKey && awayKey) {
      const homeTeam = String(row[homeKey]).trim();
      const awayTeam = String(row[awayKey]).trim();
      
      let kickoffAt: Date | null = null;
      if (dateKey && row[dateKey]) {
        const val = row[dateKey];
        if (typeof val === 'number') {
          const utcDays = val - 25569;
          const utcValue = utcDays * 86400;
          kickoffAt = new Date(utcValue * 1000);
        } else {
          const parsed = Date.parse(String(val));
          if (!isNaN(parsed)) {
            kickoffAt = new Date(parsed);
          }
        }
      }
      
      let groupName: string | null = null;
      if (groupKey && row[groupKey]) {
        const groupStr = String(row[groupKey]).trim();
        if (groupStr.toLowerCase().includes('grupo') || groupStr.toLowerCase().includes('group')) {
          groupName = groupStr;
        } else {
          groupName = `Grupo ${groupStr}`;
        }
      }

      let matchNumber = 0;
      if (numKey && row[numKey]) {
        const numVal = parseInt(row[numKey], 10);
        if (!isNaN(numVal)) {
          matchNumber = numVal;
        }
      }

      excelMatches.push({
        matchNumber,
        stage: 'GROUP_STAGE',
        groupName,
        homeTeam,
        awayTeam,
        kickoffAt,
      });
    }
  }

  return excelMatches;
}

export async function importExcelBackup(): Promise<{ createdCount: number; updatedCount: number; skippedCount: number }> {
  const excelMatches = parseExcelBackup();
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const excelMatch of excelMatches) {
    const dbMatches = await prisma.match.findMany({
      where: { stage: 'GROUP_STAGE' }
    });

    const existingMatch = dbMatches.find(db => 
      teamsMatch(db.homeTeam, excelMatch.homeTeam) && 
      teamsMatch(db.awayTeam, excelMatch.awayTeam)
    );

    if (existingMatch) {
      const source = existingMatch.resultSource;
      const dataToUpdate: any = {
        kickoffAt: excelMatch.kickoffAt || existingMatch.kickoffAt,
        groupName: excelMatch.groupName || existingMatch.groupName,
      };

      if (source === 'NONE') {
        dataToUpdate.resultSource = 'EXCEL';
      }

      if (!existingMatch.externalApiId) {
        dataToUpdate.externalApiId = `EXCEL-${excelMatch.matchNumber}`;
      }

      await prisma.match.update({
        where: { id: existingMatch.id },
        data: dataToUpdate,
      });
      updatedCount++;
    } else {
      await prisma.match.create({
        data: {
          externalApiId: `EXCEL-${excelMatch.matchNumber}`,
          stage: 'GROUP_STAGE',
          groupName: excelMatch.groupName,
          homeTeam: excelMatch.homeTeam,
          awayTeam: excelMatch.awayTeam,
          kickoffAt: excelMatch.kickoffAt,
          status: 'SCHEDULED',
          resultSource: 'EXCEL',
        }
      });
      createdCount++;
    }
  }

  return { createdCount, updatedCount, skippedCount };
}

export async function compareDatabaseWithExcel(): Promise<ComparisonReport> {
  const excelMatches = parseExcelBackup();
  
  const dbMatches = await prisma.match.findMany({
    orderBy: { kickoffAt: 'asc' }
  });

  const apiGroupMatches = dbMatches.filter(m => m.stage === 'GROUP_STAGE');
  const finalStageMatches = dbMatches.filter(m => m.stage !== 'GROUP_STAGE');

  const missingInApi: ExcelMatch[] = [];
  const differences: any[] = [];
  let matchedCount = 0;

  for (const excelMatch of excelMatches) {
    const dbMatch = apiGroupMatches.find(db => teamsMatch(db.homeTeam, excelMatch.homeTeam) && teamsMatch(db.awayTeam, excelMatch.awayTeam));

    if (!dbMatch) {
      missingInApi.push(excelMatch);
    } else {
      matchedCount++;
      const diffs: string[] = [];
      
      if (excelMatch.kickoffAt && dbMatch.kickoffAt) {
        const timeDiff = Math.abs(excelMatch.kickoffAt.getTime() - dbMatch.kickoffAt.getTime());
        if (timeDiff > 2 * 60 * 60 * 1000) {
          diffs.push(`Diferencia de fecha/hora: Excel: ${excelMatch.kickoffAt.toISOString()}, DB: ${dbMatch.kickoffAt.toISOString()}`);
        }
      }

      if (excelMatch.groupName && dbMatch.groupName) {
        const cleanExcelGroup = excelMatch.groupName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const cleanDbGroup = dbMatch.groupName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (cleanExcelGroup !== cleanDbGroup) {
          diffs.push(`Diferencia de grupo: Excel: "${excelMatch.groupName}", DB: "${dbMatch.groupName}"`);
        }
      }

      if (excelMatch.homeTeam !== dbMatch.homeTeam || excelMatch.awayTeam !== dbMatch.awayTeam) {
        diffs.push(`Ortografía de equipos: Excel: "${excelMatch.homeTeam} vs ${excelMatch.awayTeam}", DB: "${dbMatch.homeTeam} vs ${dbMatch.awayTeam}"`);
      }

      if (diffs.length > 0) {
        differences.push({
          matchNumber: excelMatch.matchNumber,
          excelMatch,
          dbMatch: {
            id: dbMatch.id,
            homeTeam: dbMatch.homeTeam,
            awayTeam: dbMatch.awayTeam,
            kickoffAt: dbMatch.kickoffAt,
            groupName: dbMatch.groupName,
            status: dbMatch.status,
          },
          diffs,
        });
      }
    }
  }

  return {
    apiGroupMatchesCount: apiGroupMatches.length,
    excelGroupMatchesCount: excelMatches.length,
    matchedCount,
    missingInApi,
    differences,
    finalStageMatchesCount: finalStageMatches.length,
  };
}
