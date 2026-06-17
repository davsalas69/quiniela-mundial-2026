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

export function parseExcelBackup(): ExcelMatch[] {
  const filePath = path.join(process.cwd(), 'data', 'Quiniela-Mundial-Juegos.xlsx');
  
  if (!fs.existsSync(filePath)) {
    throw new Error('Archivo de respaldo no encontrado');
  }

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet);
  
  const excelMatches: ExcelMatch[] = [];
  
  for (const row of rawRows) {
    const keys = Object.keys(row);
    
    // Search for fuzzy headers
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
          // Excel date serial format conversion
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
    // Soft matching logic using team names
    const dbMatch = apiGroupMatches.find(db => {
      const homeMatches = db.homeTeam.toLowerCase().includes(excelMatch.homeTeam.toLowerCase()) || 
                          excelMatch.homeTeam.toLowerCase().includes(db.homeTeam.toLowerCase());
      const awayMatches = db.awayTeam.toLowerCase().includes(excelMatch.awayTeam.toLowerCase()) || 
                          excelMatch.awayTeam.toLowerCase().includes(db.awayTeam.toLowerCase());
      return homeMatches && awayMatches;
    });

    if (!dbMatch) {
      missingInApi.push(excelMatch);
    } else {
      matchedCount++;
      const diffs: string[] = [];
      
      // Compare kickoff dates (threshold: 2 hours difference due to timezone differences or adjustments)
      if (excelMatch.kickoffAt && dbMatch.kickoffAt) {
        const timeDiff = Math.abs(excelMatch.kickoffAt.getTime() - dbMatch.kickoffAt.getTime());
        if (timeDiff > 2 * 60 * 60 * 1000) {
          diffs.push(`Diferencia de fecha/hora: Excel: ${excelMatch.kickoffAt.toISOString()}, DB: ${dbMatch.kickoffAt.toISOString()}`);
        }
      }

      // Compare groups
      if (excelMatch.groupName && dbMatch.groupName) {
        const cleanExcelGroup = excelMatch.groupName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const cleanDbGroup = dbMatch.groupName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (cleanExcelGroup !== cleanDbGroup) {
          diffs.push(`Diferencia de grupo: Excel: "${excelMatch.groupName}", DB: "${dbMatch.groupName}"`);
        }
      }

      // Compare exact team spelling
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
