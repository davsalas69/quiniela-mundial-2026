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
  action: 'CREATE' | 'UPDATE' | 'NONE' | 'ERROR';
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
  newCount: number;
  updateCount: number;
  items: PredictionPreviewItem[];
  sheetName: string;
}

export interface PredictionConfirmReport {
  success: boolean;
  message: string;
  createdCount: number;
  updatedCount: number;
  ignoredCount: number;
  blockedCount: number;
  notFoundCount: number;
  ambiguousCount: number;
  errorCount: number;
}

export function parsePredictionWorkbook(buffer: Buffer): { rows: any[][]; sheetName: string } {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('El archivo no contiene hojas legibles');
  }

  let sheetName = workbook.SheetNames.find(name => name.toLowerCase() === 'hoja1');
  if (!sheetName) {
    sheetName = workbook.SheetNames[0];
  }

  const worksheet = workbook.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  return { rows: rawRows, sheetName };
}

export function normalizePredictionRow(row: any[], rowNumber: number): NormalizedPredictionRow {
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

export function matchPredictionToMatch(row: NormalizedPredictionRow, dbMatches: any[]): any[] {
  return dbMatches.filter(db => {
    const homeMatches = teamsMatch(db.homeTeam, row.homeTeam);
    const awayMatches = teamsMatch(db.awayTeam, row.awayTeam);
    const groupMatches = isGroupCompatible(db.groupName, row.group);
    const dateMatches = isDateCompatible(db.kickoffAt, row.kickoffAt);
    return homeMatches && awayMatches && groupMatches && dateMatches;
  });
}

export async function previewPredictionImport(buffer: Buffer): Promise<PredictionPreviewReport> {
  const { rows, sheetName } = parsePredictionWorkbook(buffer);
  
  // Find where data rows start (skip headers)
  let headerIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i];
    if (r && r.length > 2) {
      const isHeader = String(r[0] || '').includes('#') || String(r[2] || '').toLowerCase().includes('equipo');
      if (isHeader) {
        headerIndex = i;
        break;
      }
    }
  }

  const startRowIndex = headerIndex !== -1 ? headerIndex + 1 : 0;
  const dataRows = rows.slice(startRowIndex).filter(r => r && r.length > 0 && r.some(val => val !== undefined && val !== null && val !== ''));

  if (dataRows.length > 200) {
    throw new Error('El archivo excede el límite máximo de 200 filas');
  }

  const dbMatches = await prisma.match.findMany({
    include: {
      prediction: true
    }
  });

  const items: PredictionPreviewItem[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let matchedCount = 0;
  let notFoundCount = 0;
  let ambiguousCount = 0;
  let blockedCount = 0;
  let newCount = 0;
  let updateCount = 0;

  for (let idx = 0; idx < dataRows.length; idx++) {
    const row = dataRows[idx];
    const rowNumber = startRowIndex + idx + 1;
    const normalized = normalizePredictionRow(row, rowNumber);

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

    const candidates = matchPredictionToMatch(normalized, dbMatches);

    const predictionStr = (normalized.predictedHomeScore !== null && normalized.predictedAwayScore !== null)
      ? `${normalized.predictedHomeScore} - ${normalized.predictedAwayScore}`
      : 'Sin pronóstico';

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
        reason: 'No se encontró un partido coincidente en la base de datos'
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
        blockedCount++;
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
          status: 'BLOCKED',
          action: 'NONE',
          reason: 'El partido ya comenzó o ha finalizado'
        });
      } else {
        validCount++;
        if (normalized.predictedHomeScore === null || normalized.predictedAwayScore === null) {
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
            action: 'NONE',
            reason: 'Fila válida sin pronóstico asignado'
          });
        } else {
          const action = dbMatch.prediction ? 'UPDATE' : 'CREATE';
          if (action === 'CREATE') newCount++;
          else updateCount++;

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
  }

  return {
    totalRows: dataRows.length,
    validCount,
    invalidCount,
    matchedCount,
    notFoundCount,
    ambiguousCount,
    blockedCount,
    newCount,
    updateCount,
    items,
    sheetName,
  };
}

export async function confirmPredictionImport(buffer: Buffer): Promise<PredictionConfirmReport> {
  const report = await previewPredictionImport(buffer);
  let createdCount = 0;
  let updatedCount = 0;
  let ignoredCount = 0;
  let blockedCount = 0;
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
        if (item.status === 'BLOCKED') {
          blockedCount++;
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
          if (item.action === 'CREATE') {
            const parts = item.prediction.split('-');
            const home = parseInt(parts[0].trim(), 10);
            const away = parseInt(parts[1].trim(), 10);
            
            try {
              await tx.prediction.create({
                data: {
                  matchId: item.matchedMatch.id,
                  predictedHomeScore: home,
                  predictedAwayScore: away,
                }
              });
              createdCount++;
            } catch (err: any) {
              throw new Error(`Error al insertar predicción para fila ${item.rowNumber} (${item.homeTeam} vs ${item.awayTeam}): ${err.message || 'error DB'}`);
            }
          } else if (item.action === 'UPDATE') {
            const parts = item.prediction.split('-');
            const home = parseInt(parts[0].trim(), 10);
            const away = parseInt(parts[1].trim(), 10);

            try {
              await tx.prediction.update({
                where: { matchId: item.matchedMatch.id },
                data: {
                  predictedHomeScore: home,
                  predictedAwayScore: away,
                }
              });
              updatedCount++;
            } catch (err: any) {
              throw new Error(`Error al actualizar predicción para fila ${item.rowNumber} (${item.homeTeam} vs ${item.awayTeam}): ${err.message || 'error DB'}`);
            }
          } else {
            ignoredCount++;
          }
        }
      }
    });

    return {
      success: true,
      message: `Importación completada con éxito. Creados: ${createdCount}, Actualizados: ${updatedCount}`,
      createdCount,
      updatedCount,
      ignoredCount,
      blockedCount,
      notFoundCount,
      ambiguousCount,
      errorCount,
    };
  } catch (error: any) {
    console.error('Prediction transaction failed:', error);
    throw new Error(`Transacción fallida. No se realizaron cambios. Razón: ${error.message || 'Error desconocido'}`);
  }
}
