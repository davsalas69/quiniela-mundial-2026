import crypto from 'crypto';
import { prisma } from './db';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 5;

function hashIp(ip: string): string {
  // IP anonimizada con hash SHA-256
  return crypto.createHash('sha256').update(ip).digest('hex');
}

/**
 * Registra y valida un intento de login/registro/setup.
 * Retorna si el intento está permitido y los segundos restantes de bloqueo.
 */
export async function checkRateLimit(
  ip: string,
  username?: string
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const ipHash = hashIp(ip || 'unknown_ip');
  const normalizedUsername = username ? username.trim().toLowerCase() : null;

  const now = new Date();
  const cutoff = new Date(now.getTime() - WINDOW_MS);

  // 1. Limpieza de intentos antiguos para evitar crecimiento indefinido de la tabla
  try {
    await prisma.authAttempt.deleteMany({
      where: {
        lastAttempt: { lt: cutoff },
      },
    });
  } catch (error) {
    console.error('Error cleaning up auth attempts:', error);
  }

  // 2. Buscar intento previo para esta IP o para este username en la ventana activa
  const attempt = await prisma.authAttempt.findFirst({
    where: {
      OR: [
        { ipHash, lastAttempt: { gte: cutoff } },
        ...(normalizedUsername
          ? [{ username: normalizedUsername, lastAttempt: { gte: cutoff } }]
          : []),
      ],
    },
    orderBy: {
      lastAttempt: 'desc',
    },
  });

  if (attempt) {
    const timePassed = now.getTime() - attempt.lastAttempt.getTime();
    const remainingTime = WINDOW_MS - timePassed;
    const retryAfterSeconds = Math.ceil(remainingTime / 1000);

    if (attempt.count >= MAX_ATTEMPTS) {
      // Bloqueado
      return {
        allowed: false,
        retryAfterSeconds: retryAfterSeconds > 0 ? retryAfterSeconds : 1,
      };
    }

    // Incrementar intentos
    await prisma.authAttempt.update({
      where: { id: attempt.id },
      data: {
        count: attempt.count + 1,
        lastAttempt: now,
        // Actualizar el username si ahora se provee
        ...(normalizedUsername ? { username: normalizedUsername } : {}),
      },
    });
  } else {
    // Crear nuevo intento
    await prisma.authAttempt.create({
      data: {
        ipHash,
        username: normalizedUsername,
        count: 1,
        lastAttempt: now,
      },
    });
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
  };
}

/**
 * Resetea los intentos para una IP y username tras un login exitoso.
 */
export async function resetRateLimit(ip: string, username?: string) {
  const ipHash = hashIp(ip || 'unknown_ip');
  const normalizedUsername = username ? username.trim().toLowerCase() : null;

  try {
    await prisma.authAttempt.deleteMany({
      where: {
        OR: [
          { ipHash },
          ...(normalizedUsername ? [{ username: normalizedUsername }] : []),
        ],
      },
    });
  } catch (error) {
    console.error('Error resetting rate limit:', error);
  }
}
