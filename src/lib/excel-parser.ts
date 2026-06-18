import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { prisma } from './db';
import { calculateMatchScore } from './scoring';

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
    'southkorea': ['rdecorea', 'republicadecorea', 'southkorea', 'coreadelsur'],
    'czechia': ['rcheca', 'czechia', 'czechrepublic', 'republicacheca'],
    'iran': ['riidiran', 'iran', 'riofiran'],
    'drcongo': ['rddelcongo', 'drcongo', 'republicademocraticadelcongo'],
    'tunisia': ['tunez', 'tunisia'],
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

export function excelDateToDate(val: any): Date | null {
  if (typeof val === 'number') {
    const utcDays = val - 25569;
    const utcValue = utcDays * 86400;
    return new Date(Math.round(utcValue * 1000));
  }
  if (val instanceof Date) return val;
  const parsed = Date.parse(String(val));
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }
  return null;
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
        kickoffAt = excelDateToDate(row[dateKey]);
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

// Prediction Bulk Import Section
export interface NormalizedPredictionRow {
  rowNumber: number;
  matchId?: string | null;
  matchNumber: number | null;
  kickoffAt: Date | null;
  homeTeam: string;
  awayTeam: string;
  group: string;
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  isValid: boolean;
  error?: string;
}

export interface PredictionPreviewItem {
  rowNumber: number;
  matchNumber: number | null;
  excelDate: string | null;
  homeTeam: string;
  awayTeam: string;
  prediction: string;
  matchedMatch: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    kickoffAt: string | null;
    status: string;
  } | null;
  status: 'VALID' | 'INVALID' | 'NOT_FOUND' | 'AMBIGUOUS' | 'BLOCKED';
  action: 'CREATE' | 'UPDATE' | 'NONE' | 'ERROR' | 'CREATE_RECALCULATE' | 'UPDATE_RECALCULATE';
  isAdministrative?: boolean;
  reason?: string;
}

export interface PredictionPreviewReport {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  matchedCount: number;
  notFoundCount: number;
  ambiguousCount: number;
  blockedCount: number;
  newFutureCount: number;
  updateFutureCount: number;
  newHistoryCount: number;
  updateHistoryCount: number;
  recalculatedCount: number;
  items: PredictionPreviewItem[];
  sheetName: string;
  importMethod: 'MATCH_ID' | 'LEGACY';
  matchIdFoundCount: number;
  matchIdNotFoundCount: number;
  ignoredCount: number;
}

export interface PredictionConfirmReport {
  success: boolean;
  message: string;
  createdFutureCount: number;
  updatedFutureCount: number;
  createdHistoryCount: number;
  updatedHistoryCount: number;
  recalculatedCount: number;
  ignoredCount: number;
  notFoundCount: number;
  ambiguousCount: number;
  errorCount: number;
}

export function generatePredictionTemplate(matches: any[]): Buffer {
  const headers = [
    'matchId',
    'número de partido',
    'fecha',
    'hora',
    'grupo/fase',
    'equipo local',
    'pronóstico local',
    'pronóstico visitante',
    'equipo visitante',
    'estado del partido'
  ];

  const sheetData = [headers];

  for (const m of matches) {
    let dateStr = '';
    let timeStr = '';
    if (m.kickoffAt) {
      const d = new Date(m.kickoffAt);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      dateStr = `${day}/${month}/${year}`;
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      timeStr = `${hours}:${minutes}`;
    }

    const homeScore = m.prediction?.predictedHomeScore !== undefined && m.prediction?.predictedHomeScore !== null
      ? m.prediction.predictedHomeScore
      : '';
    const awayScore = m.prediction?.predictedAwayScore !== undefined && m.prediction?.predictedAwayScore !== null
      ? m.prediction.predictedAwayScore
      : '';

    sheetData.push([
      m.id,
      m.externalApiId || '',
      dateStr,
      timeStr,
      m.groupName || m.stage || '',
      m.homeTeam,
      homeScore,
      awayScore,
      m.awayTeam,
      m.status || ''
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Set column widths
  ws['!cols'] = [
    { wch: 38 }, // A: matchId
    { wch: 18 }, // B: número de partido
    { wch: 12 }, // C: fecha
    { wch: 10 }, // D: hora
    { wch: 15 }, // E: grupo/fase
    { wch: 22 }, // F: equipo local
    { wch: 18 }, // G: pronóstico local
    { wch: 20 }, // H: pronóstico visitante
    { wch: 22 }, // I: equipo visitante
    { wch: 15 }  // J: estado del partido
  ];

  // Freeze top row
  ws['!views'] = [{ state: 'frozen', ySplit: 1 }];

  // Add validation: integer 0 to 20 for columns G and H (rows 2 to N)
  ws['!dataValidation'] = [
    {
      sqref: `G2:H${sheetData.length + 10}`,
      type: 'whole',
      operator: 'between',
      formula1: '0',
      formula2: '20',
      showInputMessage: true,
      promptTitle: 'Goles',
      prompt: 'Ingresa un entero entre 0 y 20'
    }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Pronosticos');

  // Instrucciones sheet
  const instructions = [
    ['INSTRUCCIONES PARA LA CARGA DE PRONÓSTICOS'],
    [''],
    ['1. NO modifique las columnas matchId, número de partido, fecha, hora, grupo/fase, equipo local, equipo visitante y estado.'],
    ['2. Complete únicamente las columnas "pronóstico local" y "pronóstico visitante" con números enteros entre 0 y 20.'],
    ['3. Si deja ambas celdas vacías para un partido, el pronóstico no se registrará o se omitirá.'],
    ['4. Los partidos que ya han comenzado o finalizado se pueden actualizar, pero requerirán confirmación administrativa.'],
    ['5. Una vez completada la plantilla, guárdela y súbala a través de la sección "Cargar predicciones".']
  ];
  const wsInst = XLSX.utils.aoa_to_sheet(instructions);
  wsInst['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsInst, 'Instrucciones');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function parsePredictionWorkbook(buffer: Buffer): { rows: any[][]; sheetName: string } {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('El archivo no contiene hojas legibles');
  }

  let sheetName = workbook.SheetNames.find(name => name.toLowerCase() === 'pronosticos');
  if (!sheetName) {
    sheetName = workbook.SheetNames.find(name => name.toLowerCase() === 'hoja1');
  }
  if (!sheetName) {
    sheetName = workbook.SheetNames[0];
  }

  const worksheet = workbook.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  return { rows: rawRows, sheetName };
}

export function normalizePredictionRow(row: any[], rowNumber: number, isOfficial: boolean): NormalizedPredictionRow {
  if (isOfficial) {
    const matchIdRaw = row[0];
    const matchNumRaw = row[1];
    const dateRaw = row[2];
    const timeRaw = row[3];
    const groupRaw = row[4];
    const homeTeamRaw = row[5];
    const homeScoreRaw = row[6];
    const awayScoreRaw = row[7];
    const awayTeamRaw = row[8];
    const statusRaw = row[9];

    const matchId = matchIdRaw ? String(matchIdRaw).trim() : null;
    let matchNumber: number | null = null;
    if (matchNumRaw !== undefined && matchNumRaw !== null && matchNumRaw !== '') {
      const parseNum = Number(matchNumRaw);
      if (!isNaN(parseNum)) {
        matchNumber = Math.floor(parseNum);
      }
    }

    const homeTeam = String(homeTeamRaw || '').trim();
    const awayTeam = String(awayTeamRaw || '').trim();
    const group = String(groupRaw || '').trim();

    if (!matchId) {
      return {
        rowNumber,
        matchId: null,
        matchNumber,
        kickoffAt: null,
        homeTeam,
        awayTeam,
        group,
        predictedHomeScore: null,
        predictedAwayScore: null,
        isValid: false,
        error: 'El campo matchId es obligatorio y no puede estar vacío.'
      };
    }

    let kickoffAt: Date | null = null;
    if (dateRaw) {
      kickoffAt = excelDateToDate(dateRaw);
      if (timeRaw && kickoffAt) {
        if (typeof timeRaw === 'number') {
          const totalSeconds = Math.round(timeRaw * 24 * 60 * 60);
          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          kickoffAt.setHours(hours, minutes, 0, 0);
        } else if (typeof timeRaw === 'string') {
          const parts = timeRaw.split(':');
          if (parts.length >= 2) {
            const hours = parseInt(parts[0], 10);
            const minutes = parseInt(parts[1], 10);
            if (!isNaN(hours) && !isNaN(minutes)) {
              kickoffAt.setHours(hours, minutes, 0, 0);
            }
          }
        }
      }
    }

    const isHomeEmpty = homeScoreRaw === undefined || homeScoreRaw === null || String(homeScoreRaw).trim() === '';
    const isAwayEmpty = awayScoreRaw === undefined || awayScoreRaw === null || String(awayScoreRaw).trim() === '';

    if (isHomeEmpty && isAwayEmpty) {
      return {
        rowNumber,
        matchId,
        matchNumber,
        kickoffAt,
        homeTeam,
        awayTeam,
        group,
        predictedHomeScore: null,
        predictedAwayScore: null,
        isValid: true,
      };
    }

    if (isHomeEmpty || isAwayEmpty) {
      return {
        rowNumber,
        matchId,
        matchNumber,
        kickoffAt,
        homeTeam,
        awayTeam,
        group,
        predictedHomeScore: null,
        predictedAwayScore: null,
        isValid: false,
        error: 'Debe ingresar pronóstico para ambos equipos'
      };
    }

    const homeScoreNum = Number(homeScoreRaw);
    const awayScoreNum = Number(awayScoreRaw);

    if (isNaN(homeScoreNum) || isNaN(awayScoreNum)) {
      return {
        rowNumber,
        matchId,
        matchNumber,
        kickoffAt,
        homeTeam,
        awayTeam,
        group,
        predictedHomeScore: null,
        predictedAwayScore: null,
        isValid: false,
        error: 'Marcadores deben ser numéricos'
      };
    }

    if (!Number.isInteger(homeScoreNum) || !Number.isInteger(awayScoreNum)) {
      return {
        rowNumber,
        matchId,
        matchNumber,
        kickoffAt,
        homeTeam,
        awayTeam,
        group,
        predictedHomeScore: null,
        predictedAwayScore: null,
        isValid: false,
        error: 'Marcadores decimales no permitidos'
      };
    }

    if (homeScoreNum < 0 || homeScoreNum > 20 || awayScoreNum < 0 || awayScoreNum > 20) {
      return {
        rowNumber,
        matchId,
        matchNumber,
        kickoffAt,
        homeTeam,
        awayTeam,
        group,
        predictedHomeScore: null,
        predictedAwayScore: null,
        isValid: false,
        error: 'Marcadores fuera de rango (deben ser entre 0 y 20)'
      };
    }

    return {
      rowNumber,
      matchId,
      matchNumber,
      kickoffAt,
      homeTeam,
      awayTeam,
      group,
      predictedHomeScore: homeScoreNum,
      predictedAwayScore: awayScoreNum,
      isValid: true
    };

  } else {
    const matchNumRaw = row[0];
    const dateRaw = row[1];
    const homeTeamRaw = row[2];
    const groupRaw = row[3];
    const homeScoreRaw = row[4];
    const awayScoreRaw = row[5];
    const awayTeamRaw = row[6];

    let matchNumber: number | null = null;
    if (matchNumRaw !== undefined && matchNumRaw !== null && matchNumRaw !== '') {
      const parseNum = Number(matchNumRaw);
      if (!isNaN(parseNum)) {
        matchNumber = Math.floor(parseNum);
      }
    }

    const homeTeam = String(homeTeamRaw || '').trim();
    const awayTeam = String(awayTeamRaw || '').trim();
    const group = String(groupRaw || '').trim();

    if (!homeTeam || !awayTeam) {
      return {
        rowNumber,
        matchNumber,
        kickoffAt: null,
        homeTeam,
        awayTeam,
        group,
        predictedHomeScore: null,
        predictedAwayScore: null,
        isValid: false,
        error: 'Nombres de equipo vacíos'
      };
    }

    const kickoffAt = dateRaw ? excelDateToDate(dateRaw) : null;

    const isHomeEmpty = homeScoreRaw === undefined || homeScoreRaw === null || String(homeScoreRaw).trim() === '';
    const isAwayEmpty = awayScoreRaw === undefined || awayScoreRaw === null || String(awayScoreRaw).trim() === '';

    if (isHomeEmpty && isAwayEmpty) {
      return {
        rowNumber,
        matchNumber,
        kickoffAt,
        homeTeam,
        awayTeam,
        group,
        predictedHomeScore: null,
        predictedAwayScore: null,
        isValid: true,
      };
    }

    if (isHomeEmpty || isAwayEmpty) {
      return {
        rowNumber,
        matchNumber,
        kickoffAt,
        homeTeam,
        awayTeam,
        group,
        predictedHomeScore: null,
        predictedAwayScore: null,
        isValid: false,
        error: 'Uno de los marcadores pronosticados está vacío'
      };
    }

    const homeScoreNum = Number(homeScoreRaw);
    const awayScoreNum = Number(awayScoreRaw);

    if (isNaN(homeScoreNum) || isNaN(awayScoreNum)) {
      return {
        rowNumber,
        matchNumber,
        kickoffAt,
        homeTeam,
        awayTeam,
        group,
        predictedHomeScore: null,
        predictedAwayScore: null,
        isValid: false,
        error: 'Marcadores deben ser numéricos'
      };
    }

    if (!Number.isInteger(homeScoreNum) || !Number.isInteger(awayScoreNum)) {
      return {
        rowNumber,
        matchNumber,
        kickoffAt,
        homeTeam,
        awayTeam,
        group,
        predictedHomeScore: null,
        predictedAwayScore: null,
        isValid: false,
        error: 'Marcadores decimales no permitidos'
      };
    }

    if (homeScoreNum < 0 || homeScoreNum > 20 || awayScoreNum < 0 || awayScoreNum > 20) {
      return {
        rowNumber,
        matchNumber,
        kickoffAt,
        homeTeam,
        awayTeam,
        group,
        predictedHomeScore: null,
        predictedAwayScore: null,
        isValid: false,
        error: 'Marcadores fuera de rango (deben ser entre 0 y 20)'
      };
    }

    return {
      rowNumber,
      matchNumber,
      kickoffAt,
      homeTeam,
      awayTeam,
      group,
      predictedHomeScore: homeScoreNum,
      predictedAwayScore: awayScoreNum,
      isValid: true,
    };
  }
}

export function matchPredictionToMatch(row: NormalizedPredictionRow, dbMatches: any[]): any[] {
  return dbMatches.filter(db => {
    const homeMatches = teamsMatch(db.homeTeam, row.homeTeam);
    const awayMatches = teamsMatch(db.awayTeam, row.awayTeam);
    const groupMatches = isGroupCompatible(db.groupName, row.group);
    const dateMatches = isDateCompatible(db.kickoffAt, row.kickoffAt);
    return homeMatches && awayMatches && groupMatches && dateMatches;
  });
}

export async function previewPredictionImport(buffer: Buffer, userId: string): Promise<PredictionPreviewReport> {
  const { rows, sheetName } = parsePredictionWorkbook(buffer);

  let headerIndex = -1;
  let isOfficial = false;

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i];
    if (r && r.length >= 2) {
      const rowStrings = r.map(cell => String(cell || '').toLowerCase().trim());
      if (rowStrings.includes('matchid')) {
        headerIndex = i;
        isOfficial = true;
        break;
      } else if (rowStrings.includes('#') || rowStrings.includes('nro') || rowStrings.some(s => s.includes('equipo'))) {
        headerIndex = i;
        isOfficial = false;
        break;
      }
    }
  }

  const startRowIndex = headerIndex !== -1 ? headerIndex + 1 : 0;
  const dataRows = rows.slice(startRowIndex).filter(r => r && r.length > 0 && r.some(val => val !== undefined && val !== null && val !== ''));

  if (dataRows.length > 200) {
    throw new Error('El archivo excede el límite máximo de 200 filas');
  }

  const dbMatchesRaw = await prisma.match.findMany({
    include: {
      predictions: {
        where: { userId }
      }
    }
  });

  const dbMatches = dbMatchesRaw.map(m => ({
    ...m,
    prediction: m.predictions[0] || null
  }));

  const items: PredictionPreviewItem[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let matchedCount = 0;
  let notFoundCount = 0;
  let ambiguousCount = 0;
  let blockedCount = 0;
  let newFutureCount = 0;
  let updateFutureCount = 0;
  let newHistoryCount = 0;
  let updateHistoryCount = 0;
  let recalculatedCount = 0;

  let matchIdFoundCount = 0;
  let matchIdNotFoundCount = 0;
  let ignoredCount = 0;

  for (let idx = 0; idx < dataRows.length; idx++) {
    const row = dataRows[idx];
    const rowNumber = startRowIndex + idx + 1;
    const normalized = normalizePredictionRow(row, rowNumber, isOfficial);

    if (!normalized.isValid) {
      invalidCount++;
      items.push({
        rowNumber,
        matchNumber: normalized.matchNumber,
        excelDate: normalized.kickoffAt ? normalized.kickoffAt.toISOString() : null,
        homeTeam: normalized.homeTeam,
        awayTeam: normalized.awayTeam,
        prediction: 'Fila inválida',
        matchedMatch: null,
        status: 'INVALID',
        action: 'ERROR',
        reason: normalized.error || 'Datos inválidos'
      });
      continue;
    }

    if (normalized.predictedHomeScore === null && normalized.predictedAwayScore === null) {
      ignoredCount++;
      let matchedMatchObj: any = null;
      if (isOfficial && normalized.matchId) {
        const found = dbMatches.find(db => db.id === normalized.matchId);
        if (found) {
          matchIdFoundCount++;
          matchedMatchObj = {
            id: found.id,
            homeTeam: found.homeTeam,
            awayTeam: found.awayTeam,
            kickoffAt: found.kickoffAt ? found.kickoffAt.toISOString() : null,
            status: found.status,
          };
        } else {
          matchIdNotFoundCount++;
        }
      } else {
        const candidates = matchPredictionToMatch(normalized, dbMatches);
        if (candidates.length === 1) {
          matchedMatchObj = {
            id: candidates[0].id,
            homeTeam: candidates[0].homeTeam,
            awayTeam: candidates[0].awayTeam,
            kickoffAt: candidates[0].kickoffAt ? candidates[0].kickoffAt.toISOString() : null,
            status: candidates[0].status,
          };
        }
      }

      items.push({
        rowNumber,
        matchNumber: normalized.matchNumber,
        excelDate: normalized.kickoffAt ? normalized.kickoffAt.toISOString() : null,
        homeTeam: normalized.homeTeam,
        awayTeam: normalized.awayTeam,
        prediction: 'Sin pronóstico',
        matchedMatch: matchedMatchObj,
        status: 'VALID',
        action: 'NONE',
        reason: 'Fila vacía o sin pronóstico (ignorado)'
      });
      continue;
    }

    let candidates: any[] = [];
    if (isOfficial) {
      const found = dbMatches.find(db => db.id === normalized.matchId);
      if (found) {
        candidates = [found];
        matchIdFoundCount++;
      } else {
        matchIdNotFoundCount++;
      }
    } else {
      candidates = matchPredictionToMatch(normalized, dbMatches);
    }

    const predictionStr = `${normalized.predictedHomeScore} - ${normalized.predictedAwayScore}`;

    if (candidates.length === 0) {
      notFoundCount++;
      items.push({
        rowNumber,
        matchNumber: normalized.matchNumber,
        excelDate: normalized.kickoffAt ? normalized.kickoffAt.toISOString() : null,
        homeTeam: normalized.homeTeam,
        awayTeam: normalized.awayTeam,
        prediction: predictionStr,
        matchedMatch: null,
        status: 'NOT_FOUND',
        action: 'NONE',
        reason: isOfficial
          ? 'El matchId especificado no existe en la base de datos'
          : 'No se encontró un partido coincidente en la base de datos'
      });
    } else if (candidates.length > 1) {
      ambiguousCount++;
      items.push({
        rowNumber,
        matchNumber: normalized.matchNumber,
        excelDate: normalized.kickoffAt ? normalized.kickoffAt.toISOString() : null,
        homeTeam: normalized.homeTeam,
        awayTeam: normalized.awayTeam,
        prediction: predictionStr,
        matchedMatch: null,
        status: 'AMBIGUOUS',
        action: 'NONE',
        reason: `Coincidencias múltiples encontradas (${candidates.length} partidos candidatos)`
      });
    } else {
      matchedCount++;
      const dbMatch = candidates[0];
      const hasStarted = dbMatch.status !== 'SCHEDULED' || (dbMatch.kickoffAt && new Date() > dbMatch.kickoffAt);

      if (hasStarted) {
        validCount++;
        const action = dbMatch.prediction ? 'UPDATE_RECALCULATE' : 'CREATE_RECALCULATE';
        if (action === 'CREATE_RECALCULATE') newHistoryCount++;
        else updateHistoryCount++;

        if (dbMatch.actualHomeScore !== null && dbMatch.actualAwayScore !== null) {
          recalculatedCount++;
        }

        items.push({
          rowNumber,
          matchNumber: normalized.matchNumber,
          excelDate: normalized.kickoffAt ? normalized.kickoffAt.toISOString() : null,
          homeTeam: normalized.homeTeam,
          awayTeam: normalized.awayTeam,
          prediction: predictionStr,
          matchedMatch: {
            id: dbMatch.id,
            homeTeam: dbMatch.homeTeam,
            awayTeam: dbMatch.awayTeam,
            kickoffAt: dbMatch.kickoffAt ? dbMatch.kickoffAt.toISOString() : null,
            status: dbMatch.status,
          },
          status: 'VALID',
          action,
          isAdministrative: true,
          reason: action === 'CREATE_RECALCULATE' ? 'Crear pronóstico histórico y recalcular' : 'Actualizar pronóstico histórico y recalcular'
        });
      } else {
        validCount++;
        const action = dbMatch.prediction ? 'UPDATE' : 'CREATE';
        if (action === 'CREATE') newFutureCount++;
        else updateFutureCount++;

        items.push({
          rowNumber,
          matchNumber: normalized.matchNumber,
          excelDate: normalized.kickoffAt ? normalized.kickoffAt.toISOString() : null,
          homeTeam: normalized.homeTeam,
          awayTeam: normalized.awayTeam,
          prediction: predictionStr,
          matchedMatch: {
            id: dbMatch.id,
            homeTeam: dbMatch.homeTeam,
            awayTeam: dbMatch.awayTeam,
            kickoffAt: dbMatch.kickoffAt ? dbMatch.kickoffAt.toISOString() : null,
            status: dbMatch.status,
          },
          status: 'VALID',
          action,
          reason: action === 'CREATE' ? 'Crear nueva predicción' : 'Actualizar predicción existente'
        });
      }
    }
  }

  return {
    totalRows: dataRows.length,
    validCount,
    invalidCount,
    matchedCount,
    notFoundCount,
    ambiguousCount,
    blockedCount,
    newFutureCount,
    updateFutureCount,
    newHistoryCount,
    updateHistoryCount,
    recalculatedCount,
    items,
    sheetName,
    importMethod: isOfficial ? 'MATCH_ID' : 'LEGACY',
    matchIdFoundCount,
    matchIdNotFoundCount,
    ignoredCount,
  };
}

export async function confirmPredictionImport(buffer: Buffer, userId: string): Promise<PredictionConfirmReport> {
  const report = await previewPredictionImport(buffer, userId);
  let createdFutureCount = 0;
  let updatedFutureCount = 0;
  let createdHistoryCount = 0;
  let updatedHistoryCount = 0;
  let recalculatedCount = 0;
  let ignoredCount = 0;
  let notFoundCount = 0;
  let ambiguousCount = 0;
  let errorCount = 0;

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of report.items) {
        if (item.status === 'INVALID') {
          errorCount++;
          continue;
        }
        if (item.status === 'NOT_FOUND') {
          notFoundCount++;
          continue;
        }
        if (item.status === 'AMBIGUOUS') {
          ambiguousCount++;
          continue;
        }

        if (item.status === 'VALID' && item.matchedMatch) {
          const isRecalculateAction = item.action === 'CREATE_RECALCULATE' || item.action === 'UPDATE_RECALCULATE';
          const isCreateAction = item.action === 'CREATE' || item.action === 'CREATE_RECALCULATE';
          const isUpdateAction = item.action === 'UPDATE' || item.action === 'UPDATE_RECALCULATE';

          if (isCreateAction || isUpdateAction) {
            const parts = item.prediction.split('-');
            const home = parseInt(parts[0].trim(), 10);
            const away = parseInt(parts[1].trim(), 10);

            try {
              const existingPred = await tx.prediction.findFirst({
                where: { matchId: item.matchedMatch.id, userId }
              });

              if (isCreateAction) {
                await tx.prediction.create({
                  data: {
                    matchId: item.matchedMatch.id,
                    userId,
                    predictedHomeScore: home,
                    predictedAwayScore: away,
                  }
                });
                if (isRecalculateAction) createdHistoryCount++;
                else createdFutureCount++;
              } else {
                if (existingPred) {
                  await tx.prediction.update({
                    where: { id: existingPred.id },
                    data: {
                      predictedHomeScore: home,
                      predictedAwayScore: away,
                    }
                  });
                }
                if (isRecalculateAction) updatedHistoryCount++;
                else updatedFutureCount++;
              }

              const dbMatch = await tx.match.findUnique({
                where: { id: item.matchedMatch.id },
              });

              if (!dbMatch) {
                throw new Error(`Partido con ID ${item.matchedMatch.id} no encontrado en DB`);
              }

              if (dbMatch.actualHomeScore !== null && dbMatch.actualAwayScore !== null) {
                const predInput = {
                  predictedHomeScore: home,
                  predictedAwayScore: away,
                  predictedHomePenalties: null,
                  predictedAwayPenalties: null,
                  predictedWinner: null,
                };
                const matchInput = {
                  stage: dbMatch.stage,
                  homeTeam: dbMatch.homeTeam,
                  awayTeam: dbMatch.awayTeam,
                  actualHomeScore: dbMatch.actualHomeScore,
                  actualAwayScore: dbMatch.actualAwayScore,
                  actualHomePenalties: dbMatch.actualHomePenalties,
                  actualAwayPenalties: dbMatch.actualAwayPenalties,
                  actualWinner: dbMatch.actualWinner,
                };

                const scoreResult = calculateMatchScore(predInput, matchInput);

                const existingScore = await tx.score.findFirst({
                  where: { matchId: dbMatch.id, userId }
                });

                if (existingScore) {
                  await tx.score.update({
                    where: { id: existingScore.id },
                    data: {
                      points: scoreResult.points,
                      reason: scoreResult.reason,
                      calculatedAt: new Date(),
                    }
                  });
                } else {
                  await tx.score.create({
                    data: {
                      matchId: dbMatch.id,
                      userId,
                      points: scoreResult.points,
                      reason: scoreResult.reason,
                    }
                  });
                }

                recalculatedCount++;
              }
            } catch (err: any) {
              const op = isCreateAction ? 'insertar' : 'actualizar';
              throw new Error(`Error al ${op} predicción/puntaje para fila ${item.rowNumber} (${item.homeTeam} vs ${item.awayTeam}): ${err.message || 'error DB'}`);
            }
          } else {
            ignoredCount++;
          }
        }
      }
    });

    return {
      success: true,
      message: `Importación completada con éxito. Creados: ${createdFutureCount + createdHistoryCount}, Actualizados: ${updatedFutureCount + updatedHistoryCount}, Recalculados: ${recalculatedCount}`,
      createdFutureCount,
      updatedFutureCount,
      createdHistoryCount,
      updatedHistoryCount,
      recalculatedCount,
      ignoredCount,
      notFoundCount,
      ambiguousCount,
      errorCount,
    };
  } catch (error: any) {
    console.error('Prediction transaction failed:', error);
    throw new Error(`Transacción fallida. No se realizaron cambios. Razón: ${error.message || 'Error desconocido'}`);
  }
}
