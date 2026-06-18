import crypto from 'crypto';
import { cookies } from 'next/headers';
import { prisma } from './db';

// --- CONFIGURACIÓN DE SCRYPT ---
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const HASH_VERSION = 'v1';

/**
 * Hashea una contraseña usando scrypt con parámetros de coste explícitos y salt aleatorio.
 * Retorna el hash en formato versionado: version$N$r$p$salt$hash
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `${HASH_VERSION}$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derivedKey.toString('hex')}`;
}

/**
 * Verifica una contraseña contra su hash versionado usando timingSafeEqual.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split('$');
    if (parts.length !== 6) return false;

    const [version, nStr, rStr, pStr, salt, hashHex] = parts;
    if (version !== HASH_VERSION) return false;

    const N = parseInt(nStr, 10);
    const r = parseInt(rStr, 10);
    const p = parseInt(pStr, 10);

    const derivedKey = crypto.scryptSync(password, salt, 64, { N, r, p });
    const computedHash = Buffer.from(derivedKey.toString('hex'), 'hex');
    const actualHash = Buffer.from(hashHex, 'hex');

    return crypto.timingSafeEqual(computedHash, actualHash);
  } catch (error) {
    return false;
  }
}

// --- GESTIÓN DE SESIONES SEGURAS ---
const COOKIE_NAME = 'quiniela_session';
const SESSION_EXPIRY_DAYS = 30;

/**
 * Genera un hash SHA-256 de un token
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Crea una sesión segura en base de datos y establece la cookie quiniela_session
 */
export async function createSession(userId: string) {
  // 1. Generar 32 bytes aleatorios para el token
  const token = crypto.randomBytes(32).toString('hex');
  // 2. Calcular SHA-256 del token para guardar en DB
  const tokenHash = hashToken(token);
  // 3. Expiración de 30 días
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // 4. Guardar únicamente el tokenHash en DB
  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  // 5. Enviar el token original únicamente en la cookie httpOnly
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
  });
}

/**
 * Elimina la sesión actual y limpia la cookie
 */
export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token) {
    const tokenHash = hashToken(token);
    try {
      await prisma.session.delete({
        where: { tokenHash },
      });
    } catch (error) {
      // Ignorar si ya no existe en la base de datos
    }
  }

  cookieStore.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

let mockUser: any = null;

/**
 * Establece un usuario de mock para testing y scripts de consola (CLI).
 */
export function setMockUser(user: any) {
  mockUser = user;
}

/**
 * Obtiene el usuario autenticado actual a partir del token en la cookie sin exponer datos sensibles.
 */
export async function getCurrentUser() {
  if (mockUser) return mockUser;

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const tokenHash = hashToken(token);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!session || session.expiresAt < new Date() || !session.user.isActive) {
      return null;
    }

    return session.user;
  } catch (error) {
    return null;
  }
}

/**
 * Exige que el usuario esté logueado. Si no, lanza un error de no autorizado.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}

/**
 * Exige que el usuario sea administrador. Si no, lanza un error de prohibido.
 */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'ADMIN') {
    throw new Error('FORBIDDEN');
  }
  return user;
}
