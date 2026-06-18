'use strict';

'use server';

import { prisma } from '@/lib/db';
import { calculateMatchScore } from '@/lib/scoring';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { syncTournament } from '@/lib/sync-service';
import { compareDatabaseWithExcel, importExcelBackup, previewPredictionImport, confirmPredictionImport } from '@/lib/excel-parser';
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  getCurrentUser,
  requireUser,
  requireAdmin,
  validateAccessCode,
  hashToken
} from '@/lib/auth';
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit';
import { headers, cookies } from 'next/headers';

// Auxiliar para revalidar caché en Next.js
function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (error) {
    // Ignorar fuera del contexto del servidor de Next.js (ej: en tests CLI)
  }
}

// Auxiliar para obtener la IP del cliente
async function getClientIp() {
  try {
    const headerList = await headers();
    const forwardedFor = headerList.get('x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }
  } catch (e) {
    // Ignorar si se ejecuta fuera de contexto HTTP (ej: en tests)
  }
  return '127.0.0.1';
}

// --- ACCIONES DE AUTENTICACIÓN ---

/**
 * Setup inicial del usuario admin. Solo permitido si no existe ningún usuario.
 */
export async function setupAdminAction(formData: FormData) {
  const ip = await getClientIp();

  // Rate Limiting por IP para setup
  const rateLimitResult = await checkRateLimit(ip, 'admin');
  if (!rateLimitResult.allowed) {
    return {
      success: false,
      message: `Demasiados intentos. Por favor, intenta de nuevo en ${rateLimitResult.retryAfterSeconds} segundos.`
    };
  }

  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!password || !confirmPassword) {
    return { success: false, message: 'La contraseña y su confirmación son obligatorias.' };
  }

  if (password.length < 8) {
    return { success: false, message: 'La contraseña debe tener al menos 8 caracteres.' };
  }

  if (password !== confirmPassword) {
    return { success: false, message: 'Las contraseñas no coinciden.' };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Comprobar que no existe ningún usuario
      const userCount = await tx.user.count();
      if (userCount > 0) {
        throw new Error('SETUP_BLOCKED');
      }

      // 2. Crear usuario admin
      const adminUser = await tx.user.create({
        data: {
          username: 'admin',
          normalizedUsername: 'admin',
          role: 'ADMIN',
          isActive: true,
          passwordHash: hashPassword(password),
        },
      });

      // 3. Asignar predicciones existentes sin propietario (userId === null) al admin
      const predictions = await tx.prediction.findMany({
        where: { userId: null },
      });

      for (const pred of predictions) {
        await tx.prediction.update({
          where: { id: pred.id },
          data: { userId: adminUser.id },
        });
      }

      // 4. Eliminar scores antiguos sin propietario y recalcularlos bajo el admin
      await tx.score.deleteMany({
        where: { userId: null },
      });

      const dbMatches = await tx.match.findMany({
        where: {
          status: { in: ['FINISHED', 'MANUAL_PROJECTION'] },
          actualHomeScore: { not: null },
          actualAwayScore: { not: null },
        },
      });

      for (const match of dbMatches) {
        const adminPred = predictions.find(p => p.matchId === match.id);
        if (adminPred) {
          const scoreResult = calculateMatchScore(adminPred, match);
          await tx.score.create({
            data: {
              matchId: match.id,
              userId: adminUser.id,
              points: scoreResult.points,
              reason: scoreResult.reason,
            },
          });
        }
      }

      // 5. Confirmar que no quedan registros Prediction/Score sin userId
      const remainingPreds = await tx.prediction.count({ where: { userId: null } });
      const remainingScores = await tx.score.count({ where: { userId: null } });
      if (remainingPreds > 0 || remainingScores > 0) {
        throw new Error('Fase A falló: Aún existen predicciones o puntajes sin propietario.');
      }

      return adminUser;
    });

    // 6. Crear la primera sesión y cookie
    await createSession(result.id);
    await resetRateLimit(ip, 'admin');

    safeRevalidatePath('/');
    return { success: true };
  } catch (error: any) {
    if (error.message === 'SETUP_BLOCKED') {
      return { success: false, message: 'El setup de administrador ya ha sido completado.' };
    }
    console.error('Setup error (safe log):', error.message || error);
    return { success: false, message: 'Error interno en la configuración inicial.' };
  }
}

/**
 * Inicio de sesión de jugadores (USER).
 */
export async function loginAction(formData: FormData) {
  const ip = await getClientIp();
  const username = (formData.get('username') as string || '').trim();
  const password = formData.get('password') as string;

  if (!username || !password) {
    return { success: false, message: 'El usuario y el código de acceso son requeridos.' };
  }

  const normalizedUsername = username.toLowerCase();

  // Rate Limiting
  const rateLimitResult = await checkRateLimit(ip, normalizedUsername);
  if (!rateLimitResult.allowed) {
    return {
      success: false,
      message: `Demasiados intentos. Por favor, reintente en ${rateLimitResult.retryAfterSeconds} segundos.`
    };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { normalizedUsername },
    });

    // Solo permitir jugadores (role USER)
    if (!user || user.role !== 'USER' || !user.isActive) {
      return { success: false, message: 'Credenciales inválidas.' };
    }

    // Normalizar a mayúsculas
    const normalizedCode = password.trim().toUpperCase();

    if (!verifyPassword(normalizedCode, user.passwordHash)) {
      return { success: false, message: 'Credenciales inválidas.' };
    }

    await createSession(user.id);
    await resetRateLimit(ip, normalizedUsername);

    safeRevalidatePath('/');
    return { success: true, user: { id: user.id, username: user.username, role: user.role } };
  } catch (error) {
    return { success: false, message: 'Error interno de inicio de sesión.' };
  }
}

/**
 * Inicio de sesión de administradores (ADMIN).
 */
export async function loginAdminAction(formData: FormData) {
  const ip = await getClientIp();
  const username = (formData.get('username') as string || '').trim();
  const password = formData.get('password') as string;

  if (!username || !password) {
    return { success: false, message: 'El usuario y la contraseña son requeridos.' };
  }

  const normalizedUsername = username.toLowerCase();

  // Rate Limiting
  const rateLimitResult = await checkRateLimit(ip, normalizedUsername);
  if (!rateLimitResult.allowed) {
    return {
      success: false,
      message: `Demasiados intentos. Por favor, reintente en ${rateLimitResult.retryAfterSeconds} segundos.`
    };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { normalizedUsername },
    });

    // Solo permitir administradores (role ADMIN)
    if (!user || user.role !== 'ADMIN' || !user.isActive) {
      return { success: false, message: 'Credenciales inválidas.' };
    }

    // No se normaliza para ADMIN
    if (!verifyPassword(password, user.passwordHash)) {
      return { success: false, message: 'Credenciales inválidas.' };
    }

    await createSession(user.id);
    await resetRateLimit(ip, normalizedUsername);

    safeRevalidatePath('/');
    return { success: true, user: { id: user.id, username: user.username, role: user.role } };
  } catch (error) {
    return { success: false, message: 'Error interno de inicio de sesión.' };
  }
}

/**
 * Registro de usuarios estándar (siempre USER).
 */
export async function registerAction(formData: FormData) {
  const ip = await getClientIp();
  const username = (formData.get('username') as string || '').trim();
  const password = formData.get('password') as string; // Código de acceso

  if (!username || !password) {
    return { success: false, message: 'Todos los campos son obligatorios.' };
  }

  const normalizedUsername = username.toLowerCase();

  // Rate Limiting
  const rateLimitResult = await checkRateLimit(ip, normalizedUsername);
  if (!rateLimitResult.allowed) {
    return {
      success: false,
      message: `Demasiados intentos. Por favor, reintente en ${rateLimitResult.retryAfterSeconds} segundos.`
    };
  }

  // Validación formato del nombre de usuario
  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
  if (!usernameRegex.test(username)) {
    return { success: false, message: 'El nombre de usuario debe tener de 3 a 30 caracteres alfanuméricos o guión bajo.' };
  }

  // Comprobar nombres reservados (ej. admin y sus variantes)
  const reserved = ['admin', 'administrator', 'root', 'setup', 'login', 'register'];
  if (reserved.includes(normalizedUsername)) {
    return { success: false, message: 'Este nombre de usuario no está disponible.' };
  }

  // Normalizar el código de acceso a mayúsculas
  const normalizedCode = password.trim().toUpperCase();

  // Validar código de acceso
  const validation = validateAccessCode(normalizedCode, username);
  if (!validation.valid) {
    return { success: false, message: validation.message };
  }

  try {
    // Comprobar si ya existe el usuario
    const existing = await prisma.user.findUnique({
      where: { normalizedUsername },
    });

    if (existing) {
      return {
        success: false,
        message: 'Ese nombre ya está en uso',
        userExists: true
      };
    }

    const created = await prisma.user.create({
      data: {
        username,
        normalizedUsername,
        passwordHash: hashPassword(normalizedCode),
        role: 'USER',
        isActive: true,
      },
    });

    await createSession(created.id);
    await resetRateLimit(ip, normalizedUsername);

    safeRevalidatePath('/');
    return { success: true, user: { id: created.id, username: created.username, role: created.role } };
  } catch (error) {
    return { success: false, message: 'Error interno al registrar el usuario.' };
  }
}

/**
 * Cierre de sesión.
 */
export async function logoutAction() {
  await destroySession();
  safeRevalidatePath('/');
  redirect('/');
}

/**
 * Cambiar el código de acceso del jugador actual (USER).
 */
export async function changeAccessCodeAction(formData: FormData) {
  const currentCode = formData.get('currentCode') as string || '';
  const newCode = formData.get('newCode') as string || '';
  const confirmNewCode = formData.get('confirmNewCode') as string || '';

  if (!currentCode || !newCode || !confirmNewCode) {
    return { success: false, message: 'Todos los campos son obligatorios.' };
  }

  if (newCode !== confirmNewCode) {
    return { success: false, message: 'El nuevo código de acceso y su confirmación no coinciden.' };
  }

  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return { success: false, message: 'No estás autorizado.' };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
  });

  if (!dbUser) {
    return { success: false, message: 'Usuario no encontrado.' };
  }

  // Normalizar a mayúsculas para USER
  const isUser = dbUser.role === 'USER';
  const normalizedCurrent = isUser ? currentCode.trim().toUpperCase() : currentCode;

  if (!verifyPassword(normalizedCurrent, dbUser.passwordHash)) {
    return { success: false, message: 'El código de acceso actual es incorrecto.' };
  }

  const normalizedNew = isUser ? newCode.trim().toUpperCase() : newCode;

  if (isUser) {
    const validation = validateAccessCode(normalizedNew, dbUser.username);
    if (!validation.valid) {
      return { success: false, message: validation.message };
    }
  }

  try {
    const newHash = hashPassword(normalizedNew);

    await prisma.user.update({
      where: { id: dbUser.id },
      data: { passwordHash: newHash },
    });

    // Terminar otras sesiones activas del usuario
    const cookieStore = await cookies();
    const token = cookieStore.get('quiniela_session')?.value;
    if (token) {
      const tokenHash = hashToken(token);
      await prisma.session.deleteMany({
        where: {
          userId: dbUser.id,
          tokenHash: { not: tokenHash },
        },
      });
    }

    safeRevalidatePath('/');
    return { success: true };
  } catch (error) {
    return { success: false, message: 'Error interno al cambiar el código.' };
  }
}

/**
 * Restablecer el código de acceso de un jugador (ADMIN).
 */
export async function resetPlayerAccessCodeAction(formData: FormData) {
  const username = (formData.get('username') as string || '').trim();
  const newCode = (formData.get('newCode') as string || '').trim();

  if (!username || !newCode) {
    return { success: false, message: 'El nombre del jugador y el nuevo código de acceso son obligatorios.' };
  }

  try {
    await requireAdmin();
  } catch (error) {
    return { success: false, message: 'No estás autorizado. Debes ser administrador.' };
  }

  const normalizedUsername = username.toLowerCase();

  try {
    const targetUser = await prisma.user.findUnique({
      where: { normalizedUsername },
    });

    if (!targetUser) {
      return { success: false, message: 'Jugador no encontrado.' };
    }

    if (targetUser.role !== 'USER') {
      return { success: false, message: 'Solo se puede restablecer el código de acceso de jugadores standard.' };
    }

    const normalizedCode = newCode.toUpperCase();
    const validation = validateAccessCode(normalizedCode, targetUser.username);
    if (!validation.valid) {
      return { success: false, message: validation.message };
    }

    const newHash = hashPassword(normalizedCode);

    await prisma.user.update({
      where: { id: targetUser.id },
      data: { passwordHash: newHash },
    });

    // Forzar logout de todas las sesiones de este jugador
    await prisma.session.deleteMany({
      where: { userId: targetUser.id },
    });

    return { success: true };
  } catch (error) {
    return { success: false, message: 'Error interno al restablecer el código.' };
  }
}

// --- ACCIONES DE PARTIDOS, PREDICCIONES Y PUNTOS ---

/**
 * Recalcula e inserta puntaje para un partido individual.
 * Si se especifica userId, solo lo hace para ese usuario; de lo contrario, para todos.
 */
export async function recalculateMatchScore(matchId: string, userId?: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      predictions: userId ? { where: { userId } } : true,
    },
  });

  if (!match) return;

  if (match.actualHomeScore === null || match.actualAwayScore === null) {
    // Si no hay resultado, borramos el puntaje
    await prisma.score.deleteMany({
      where: {
        matchId,
        ...(userId ? { userId } : {}),
      },
    });
    return;
  }

  // Recalcular para cada predicción encontrada
  for (const pred of match.predictions) {
    if (!pred.userId) continue;

    const scoreResult = calculateMatchScore(pred, match);

    // Guardar de forma idempotente en Fase A (sin @@unique compuesto en DB)
    const existingScore = await prisma.score.findFirst({
      where: { matchId, userId: pred.userId },
    });

    if (existingScore) {
      await prisma.score.update({
        where: { id: existingScore.id },
        data: {
          points: scoreResult.points,
          reason: scoreResult.reason,
          calculatedAt: new Date(),
        },
      });
    } else {
      await prisma.score.create({
        data: {
          matchId,
          userId: pred.userId,
          points: scoreResult.points,
          reason: scoreResult.reason,
        },
      });
    }
  }
}

/**
 * Listar partidos completos con predicción y puntaje para el usuario actual.
 */
export async function getMatchesWithData() {
  const user = await getCurrentUser();
  const userId = user?.id || '';

  const matches = await prisma.match.findMany({
    include: {
      predictions: {
        where: { userId },
      },
      scores: {
        where: { userId },
      },
    },
    orderBy: [
      { kickoffAt: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  // Mapear arrays de uno-a-muchos a propiedades individuales para mantener compatibilidad
  return matches.map(m => ({
    ...m,
    prediction: m.predictions[0] || null,
    score: m.scores[0] || null,
  }));
}

/**
 * Guardar o actualizar una predicción (Requiere login, id viene de sesión).
 */
export async function upsertPrediction(
  matchId: string,
  data: {
    predictedHomeScore: number | null;
    predictedAwayScore: number | null;
    predictedHomePenalties: number | null;
    predictedAwayPenalties: number | null;
    predictedWinner: string | null;
  }
) {
  const user = await requireUser();
  const userId = user.id;

  const isEmpty = data.predictedHomeScore === null && data.predictedAwayScore === null;

  await prisma.$transaction(async (tx) => {
    if (isEmpty) {
      await tx.prediction.deleteMany({
        where: { matchId, userId },
      });
      await tx.score.deleteMany({
        where: { matchId, userId },
      });
    } else {
      const existingPred = await tx.prediction.findFirst({
        where: { matchId, userId },
      });

      let predId: string;
      if (existingPred) {
        predId = existingPred.id;
        await tx.prediction.update({
          where: { id: predId },
          data: {
            predictedHomeScore: data.predictedHomeScore,
            predictedAwayScore: data.predictedAwayScore,
            predictedHomePenalties: data.predictedHomePenalties,
            predictedAwayPenalties: data.predictedAwayPenalties,
            predictedWinner: data.predictedWinner,
          },
        });
      } else {
        const createdPred = await tx.prediction.create({
          data: {
            matchId,
            userId,
            predictedHomeScore: data.predictedHomeScore,
            predictedAwayScore: data.predictedAwayScore,
            predictedHomePenalties: data.predictedHomePenalties,
            predictedAwayPenalties: data.predictedAwayPenalties,
            predictedWinner: data.predictedWinner,
          },
        });
        predId = createdPred.id;
      }

      // Recalcular e insertar puntaje para el partido de forma atómica para este usuario
      const match = await tx.match.findUnique({
        where: { id: matchId },
      });

      if (match) {
        if (match.actualHomeScore === null || match.actualAwayScore === null) {
          await tx.score.deleteMany({
            where: { matchId, userId },
          });
        } else {
          const updatedPred = await tx.prediction.findUnique({
            where: { id: predId },
          });

          if (updatedPred) {
            const scoreResult = calculateMatchScore(updatedPred, match);

            const existingScore = await tx.score.findFirst({
              where: { matchId, userId },
            });

            if (existingScore) {
              await tx.score.update({
                where: { id: existingScore.id },
                data: {
                  points: scoreResult.points,
                  reason: scoreResult.reason,
                  calculatedAt: new Date(),
                },
              });
            } else {
              await tx.score.create({
                data: {
                  matchId,
                  userId,
                  points: scoreResult.points,
                  reason: scoreResult.reason,
                },
              });
            }
          }
        }
      }
    }
  });

  safeRevalidatePath('/');
  safeRevalidatePath('/predictions');
  safeRevalidatePath('/results');
  safeRevalidatePath('/scores');
}

/**
 * Guardar o actualizar el resultado de un partido (Requiere Admin).
 */
export async function upsertMatchResult(
  matchId: string,
  data: {
    actualHomeScore: number | null;
    actualAwayScore: number | null;
    actualHomePenalties: number | null;
    actualAwayPenalties: number | null;
    actualWinner: string | null;
    status: string;
    resultSource: string;
  }
) {
  await requireAdmin();

  await prisma.match.update({
    where: { id: matchId },
    data: {
      actualHomeScore: data.actualHomeScore,
      actualAwayScore: data.actualAwayScore,
      actualHomePenalties: data.actualHomePenalties,
      actualAwayPenalties: data.actualAwayPenalties,
      actualWinner: data.actualWinner,
      status: data.status,
      resultSource: data.resultSource,
    },
  });

  // Recalcular puntajes de TODOS los usuarios para este partido
  await recalculateMatchScore(matchId);

  safeRevalidatePath('/');
  safeRevalidatePath('/predictions');
  safeRevalidatePath('/results');
  safeRevalidatePath('/scores');
}

/**
 * Acción global: Recalcular todos los puntos de todos los usuarios (Requiere Admin).
 */
export async function recalculateAllScoresAction() {
  await requireAdmin();

  const matches = await prisma.match.findMany({
    include: { predictions: true },
  });

  for (const match of matches) {
    if (match.actualHomeScore === null || match.actualAwayScore === null) {
      await prisma.score.deleteMany({
        where: { matchId: match.id },
      });
    } else {
      for (const pred of match.predictions) {
        if (!pred.userId) continue;

        const scoreResult = calculateMatchScore(pred, match);

        const existingScore = await prisma.score.findFirst({
          where: { matchId: match.id, userId: pred.userId },
        });

        if (existingScore) {
          await prisma.score.update({
            where: { id: existingScore.id },
            data: {
              points: scoreResult.points,
              reason: scoreResult.reason,
              calculatedAt: new Date(),
            },
          });
        } else {
          await prisma.score.create({
            data: {
              matchId: match.id,
              userId: pred.userId,
              points: scoreResult.points,
              reason: scoreResult.reason,
            },
          });
        }
      }
    }
  }

  safeRevalidatePath('/');
  safeRevalidatePath('/predictions');
  safeRevalidatePath('/results');
  safeRevalidatePath('/scores');
  safeRevalidatePath('/settings');
}

/**
 * Borrar todos los resultados simulados (Requiere Admin).
 */
export async function clearSimulatedResultsAction() {
  await requireAdmin();

  const simulatedMatches = await prisma.match.findMany({
    where: { resultSource: 'MANUAL_SIMULATION' },
  });

  for (const match of simulatedMatches) {
    await prisma.match.update({
      where: { id: match.id },
      data: {
        status: 'SCHEDULED',
        resultSource: 'NONE',
        actualHomeScore: null,
        actualAwayScore: null,
        actualHomePenalties: null,
        actualAwayPenalties: null,
        actualWinner: null,
      },
    });

    await prisma.score.deleteMany({
      where: { matchId: match.id },
    });
  }

  safeRevalidatePath('/');
  safeRevalidatePath('/predictions');
  safeRevalidatePath('/results');
  safeRevalidatePath('/scores');
  safeRevalidatePath('/settings');
}

/**
 * Crear Partido (Requiere Admin).
 */
export async function createMatchAction(data: {
  stage: string;
  groupName?: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt?: string;
}) {
  await requireAdmin();

  const created = await prisma.match.create({
    data: {
      stage: data.stage,
      groupName: data.groupName || null,
      homeTeam: data.homeTeam,
      awayTeam: data.awayTeam,
      kickoffAt: data.kickoffAt ? new Date(data.kickoffAt) : null,
      status: 'SCHEDULED',
      resultSource: 'NONE',
    },
  });

  safeRevalidatePath('/');
  safeRevalidatePath('/predictions');
  safeRevalidatePath('/results');
  safeRevalidatePath('/settings');
  return created;
}

/**
 * Editar Partido (Requiere Admin).
 */
export async function updateMatchAction(
  matchId: string,
  data: {
    stage: string;
    groupName?: string;
    homeTeam: string;
    awayTeam: string;
    kickoffAt?: string;
  }
) {
  await requireAdmin();

  const updated = await prisma.match.update({
    where: { id: matchId },
    data: {
      stage: data.stage,
      groupName: data.groupName || null,
      homeTeam: data.homeTeam,
      awayTeam: data.awayTeam,
      kickoffAt: data.kickoffAt ? new Date(data.kickoffAt) : null,
    },
  });

  safeRevalidatePath('/');
  safeRevalidatePath('/predictions');
  safeRevalidatePath('/results');
  safeRevalidatePath('/scores');
  safeRevalidatePath('/settings');
  return updated;
}

/**
 * Eliminar Partido (Requiere Admin).
 */
export async function deleteMatchAction(matchId: string) {
  await requireAdmin();

  const deleted = await prisma.match.delete({
    where: { id: matchId },
  });

  safeRevalidatePath('/');
  safeRevalidatePath('/predictions');
  safeRevalidatePath('/results');
  safeRevalidatePath('/scores');
  safeRevalidatePath('/settings');
  return deleted;
}

/**
 * Cargar Semilla de Partidos Manualmente (Requiere Admin).
 */
export async function seedMatchesAction() {
  const user = await requireAdmin();
  const userId = user.id;

  const createdMatches = [];

  // Limpiar base de datos
  await prisma.score.deleteMany({});
  await prisma.prediction.deleteMany({});
  await prisma.match.deleteMany({});

  const matchesData = [
    {
      stage: 'GROUP_STAGE',
      groupName: 'Grupo A',
      homeTeam: 'México',
      awayTeam: 'Colombia',
      kickoffAt: new Date('2026-06-11T18:00:00Z'),
      status: 'SCHEDULED',
      resultSource: 'NONE',
    },
    {
      stage: 'GROUP_STAGE',
      groupName: 'Grupo B',
      homeTeam: 'USA',
      awayTeam: 'Canadá',
      kickoffAt: new Date('2026-06-12T15:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 2,
      actualAwayScore: 1,
      resultSource: 'MANUAL_REAL',
    },
    {
      stage: 'GROUP_STAGE',
      groupName: 'Grupo C',
      homeTeam: 'Argentina',
      awayTeam: 'España',
      kickoffAt: new Date('2026-06-13T20:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 4,
      actualAwayScore: 0,
      resultSource: 'MANUAL_REAL',
    },
    {
      stage: 'GROUP_STAGE',
      groupName: 'Grupo D',
      homeTeam: 'Brasil',
      awayTeam: 'Uruguay',
      kickoffAt: new Date('2026-06-14T17:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 1,
      actualAwayScore: 0,
      resultSource: 'MANUAL_REAL',
    },
    {
      stage: 'GROUP_STAGE',
      groupName: 'Grupo E',
      homeTeam: 'Alemania',
      awayTeam: 'Japón',
      kickoffAt: new Date('2026-06-15T14:00:00Z'),
      status: 'FINISHED',
      actualHomeScore: 1,
      actualAwayScore: 2,
      resultSource: 'MANUAL_REAL',
    },
    {
      stage: 'ROUND_OF_32',
      homeTeam: 'Francia',
      awayTeam: 'Inglaterra',
      kickoffAt: new Date('2026-06-25T19:00:00Z'),
      status: 'MANUAL_PROJECTION',
      actualHomeScore: 2,
      actualAwayScore: 2,
      actualHomePenalties: 4,
      actualAwayPenalties: 3,
      actualWinner: 'Francia',
      resultSource: 'MANUAL_SIMULATION',
    },
    {
      stage: 'ROUND_OF_16',
      homeTeam: 'Portugal',
      awayTeam: 'Países Bajos',
      kickoffAt: new Date('2026-06-29T16:00:00Z'),
      status: 'SCHEDULED',
      resultSource: 'NONE',
    },
    {
      stage: 'QUARTER_FINAL',
      homeTeam: 'Italia',
      awayTeam: 'Bélgica',
      kickoffAt: new Date('2026-07-04T18:00:00Z'),
      status: 'SCHEDULED',
      resultSource: 'NONE',
    },
    {
      stage: 'SEMI_FINAL',
      homeTeam: 'Marruecos',
      awayTeam: 'Croacia',
      kickoffAt: new Date('2026-07-08T20:00:00Z'),
      status: 'SCHEDULED',
      resultSource: 'NONE',
    },
    {
      stage: 'THIRD_PLACE',
      homeTeam: 'Marruecos',
      awayTeam: 'Bélgica',
      kickoffAt: new Date('2026-07-11T16:00:00Z'),
      status: 'SCHEDULED',
      resultSource: 'NONE',
    },
    {
      stage: 'FINAL',
      homeTeam: 'Argentina',
      awayTeam: 'Francia',
      kickoffAt: new Date('2026-07-12T19:00:00Z'),
      status: 'MANUAL_PROJECTION',
      actualHomeScore: 1,
      actualAwayScore: 1,
      actualHomePenalties: 5,
      actualAwayPenalties: 4,
      actualWinner: 'Argentina',
      resultSource: 'MANUAL_SIMULATION',
    },
  ];

  for (const match of matchesData) {
    const created = await prisma.match.create({
      data: match,
    });
    createdMatches.push(created);
  }

  // Crear predicciones iniciales asignadas al admin
  const predictionsData = [
    {
      matchIndex: 1,
      predictedHomeScore: 2,
      predictedAwayScore: 1,
    },
    {
      matchIndex: 2,
      predictedHomeScore: 3,
      predictedAwayScore: 1,
      predictedWinner: 'Argentina',
    },
    {
      matchIndex: 3,
      predictedHomeScore: 2,
      predictedAwayScore: 0,
      predictedWinner: 'Brasil',
    },
    {
      matchIndex: 4,
      predictedHomeScore: 2,
      predictedAwayScore: 1,
      predictedWinner: 'Alemania',
    },
    {
      matchIndex: 5,
      predictedHomeScore: 2,
      predictedAwayScore: 2,
      predictedHomePenalties: 4,
      predictedAwayPenalties: 3,
      predictedWinner: 'Francia',
    },
    {
      matchIndex: 6,
      predictedHomeScore: 1,
      predictedAwayScore: 0,
      predictedWinner: 'Portugal',
    },
    {
      matchIndex: 10,
      predictedHomeScore: 1,
      predictedAwayScore: 1,
      predictedHomePenalties: 4,
      predictedAwayPenalties: 3,
      predictedWinner: 'Argentina',
    },
  ];

  for (const pred of predictionsData) {
    const match = createdMatches[pred.matchIndex];
    if (match) {
      await prisma.prediction.create({
        data: {
          matchId: match.id,
          userId,
          predictedHomeScore: pred.predictedHomeScore,
          predictedAwayScore: pred.predictedAwayScore,
          predictedHomePenalties: pred.predictedHomePenalties ?? null,
          predictedAwayPenalties: pred.predictedAwayPenalties ?? null,
          predictedWinner: pred.predictedWinner ?? null,
        },
      });
      await recalculateMatchScore(match.id, userId);
    }
  }

  safeRevalidatePath('/');
  safeRevalidatePath('/predictions');
  safeRevalidatePath('/results');
  safeRevalidatePath('/scores');
  safeRevalidatePath('/settings');
}

/**
 * Exportar todos los datos (Requiere Admin).
 */
export async function exportDataAction() {
  await requireAdmin();

  const matches = await prisma.match.findMany({
    include: {
      predictions: true,
      scores: true,
    },
  });

  return JSON.stringify(matches, null, 2);
}

/**
 * Sincronizar API (Requiere Admin).
 */
export async function syncTournamentAction(syncType: 'FULL' | 'DAILY' | 'LIVE' | 'MANUAL') {
  await requireAdmin();

  const result = await syncTournament(syncType);

  safeRevalidatePath('/');
  safeRevalidatePath('/predictions');
  safeRevalidatePath('/results');
  safeRevalidatePath('/scores');
  safeRevalidatePath('/settings');

  return result;
}

/**
 * Obtener logs de sync (Requiere Admin).
 */
export async function getLastSyncLogAction() {
  await requireAdmin();
  return await prisma.syncLog.findFirst({
    orderBy: { startedAt: 'desc' }
  });
}

/**
 * Config de API (Requiere Admin).
 */
export async function isApiKeyConfiguredAction() {
  await requireAdmin();
  const providerType = process.env.FOOTBALL_PROVIDER || 'football-data';
  if (providerType === 'api-football') {
    return !!process.env.API_FOOTBALL_KEY;
  }
  return !!process.env.FOOTBALL_DATA_API_KEY;
}

/**
 * Config de API (Requiere Admin).
 */
export async function getActiveProviderAction() {
  await requireAdmin();
  const providerType = process.env.FOOTBALL_PROVIDER || 'football-data';
  return providerType === 'api-football' ? 'api-football' : 'football-data';
}

/**
 * Comparar base de datos con Excel (Requiere Admin).
 */
export async function compareExcelBackupAction() {
  await requireAdmin();
  try {
    const report = await compareDatabaseWithExcel();
    return {
      success: true,
      report,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Error al procesar el archivo Excel',
    };
  }
}

/**
 * Importar calendario desde Excel (Requiere Admin).
 */
export async function importExcelBackupAction() {
  await requireAdmin();
  try {
    const result = await importExcelBackup();

    safeRevalidatePath('/');
    safeRevalidatePath('/predictions');
    safeRevalidatePath('/results');
    safeRevalidatePath('/scores');
    safeRevalidatePath('/settings');

    return {
      success: true,
      message: `Importación completada con éxito. Creados: ${result.createdCount}, Actualizados: ${result.updatedCount}`,
      ...result
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Error al importar datos desde Excel',
    };
  }
}

/**
 * Vista previa de importación de predicciones del usuario (Requiere User).
 */
export async function previewPredictionImportAction(formData: FormData) {
  try {
    const user = await requireUser();

    const file = formData.get('file') as File;
    if (!file) {
      return { success: false, message: 'No se seleccionó ningún archivo' };
    }

    if (file.size > 2 * 1024 * 1024) {
      return { success: false, message: 'El archivo excede el límite máximo de 2 MB' };
    }

    const filename = file.name.toLowerCase();
    if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
      return { success: false, message: 'Formato inválido. Solo se admiten archivos .xlsx o .xls' };
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const report = await previewPredictionImport(buffer, user.id);
    return {
      success: true,
      report,
    };
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return { success: false, message: 'No autorizado.' };
    }
    return {
      success: false,
      message: err.message || 'Error al procesar la vista previa del archivo Excel',
    };
  }
}

/**
 * Confirmación de importación de predicciones del usuario (Requiere User).
 */
export async function confirmPredictionImportAction(formData: FormData) {
  try {
    const user = await requireUser();

    const file = formData.get('file') as File;
    if (!file) {
      return { success: false, message: 'No se seleccionó ningún archivo' };
    }

    if (file.size > 2 * 1024 * 1024) {
      return { success: false, message: 'El archivo excede el límite máximo de 2 MB' };
    }

    const filename = file.name.toLowerCase();
    if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
      return { success: false, message: 'Formato de archivo no admitido' };
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await confirmPredictionImport(buffer, user.id);

    safeRevalidatePath('/');
    safeRevalidatePath('/predictions');
    safeRevalidatePath('/results');
    safeRevalidatePath('/scores');
    safeRevalidatePath('/settings');

    return {
      success: true,
      message: result.message,
      result,
    };
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return { success: false, message: 'No autorizado.' };
    }
    return {
      success: false,
      message: err.message || 'Error al confirmar la importación de predicciones',
    };
  }
}
