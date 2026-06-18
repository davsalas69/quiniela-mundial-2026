import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../lib/db';
import {
  setupAdminAction,
  loginAction,
  registerAction,
  logoutAction,
  upsertPrediction,
  getMatchesWithData,
  loginAdminAction
} from '../app/actions';
import {
  getCurrentUser,
  setMockUser,
  hashPassword,
  verifyPassword
} from '../lib/auth';
import { checkRateLimit, resetRateLimit } from '../lib/rate-limit';

// Mock de next/headers para simular cookies e IP en las Server Actions
let mockCookiesStore = new Map<string, { name: string; value: string }>();
let mockHeadersStore = new Map<string, string>();

vi.mock('next/headers', () => {
  return {
    cookies: async () => ({
      get: (name: string) => mockCookiesStore.get(name),
      set: (name: string, value: string, opts?: any) => {
        mockCookiesStore.set(name, { name, value });
      },
      delete: (name: string) => {
        mockCookiesStore.delete(name);
      },
    }),
    headers: async () => ({
      get: (name: string) => mockHeadersStore.get(name) || null,
    }),
  };
});

describe('Multi-User Authentication System Tests', () => {
  beforeEach(async () => {
    // Limpiar base de datos
    await prisma.authAttempt.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.score.deleteMany({});
    await prisma.prediction.deleteMany({});
    await prisma.match.deleteMany({});
    await prisma.user.deleteMany({});

    // Limpiar stores de headers/cookies
    mockCookiesStore.clear();
    mockHeadersStore.clear();
    setMockUser(null);
  });

  afterEach(async () => {
    await prisma.authAttempt.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.score.deleteMany({});
    await prisma.prediction.deleteMany({});
    await prisma.match.deleteMany({});
    await prisma.user.deleteMany({});
  });

  // --- ESCENARIO 1 & 9: Setup de Administrador y Migración de Datos Huérfanos ---
  test('Debería configurar el primer administrador, bloquear setup posterior y migrar predicciones huérfanas', async () => {
    // 1. Crear un partido y una predicción "huérfana" (userId === null)
    const match = await prisma.match.create({
      data: {
        stage: 'GROUP_STAGE',
        homeTeam: 'Francia',
        awayTeam: 'España',
        status: 'SCHEDULED',
      },
    });

    await prisma.prediction.create({
      data: {
        matchId: match.id,
        predictedHomeScore: 2,
        predictedAwayScore: 1,
        userId: null, // Huérfano
      },
    });

    // 2. Ejecutar Setup
    const formData = new FormData();
    formData.append('password', 'AdminPass123!');
    formData.append('confirmPassword', 'AdminPass123!');

    const result = await setupAdminAction(formData);
    expect(result.success).toBe(true);

    // 3. Verificar creación de usuario
    const admin = await prisma.user.findUnique({
      where: { normalizedUsername: 'admin' },
    });
    expect(admin).toBeDefined();
    expect(admin?.role).toBe('ADMIN');
    expect(verifyPassword('AdminPass123!', admin!.passwordHash)).toBe(true);

    // 4. Verificar que se creó sesión en cookies
    expect(mockCookiesStore.has('quiniela_session')).toBe(true);

    // 5. Verificar migración de predicciones huérfanas
    const pred = await prisma.prediction.findFirst({
      where: { matchId: match.id },
    });
    expect(pred?.userId).toBe(admin?.id);

    // 6. Intentar Setup de nuevo (Debe fallar)
    const secondSetup = await setupAdminAction(formData);
    expect(secondSetup.success).toBe(false);
    expect(secondSetup.message).toContain('completado');
  });

  // --- ESCENARIO 3: Registro de Usuarios y Reglas de Validación ---
  test('Debería registrar usuarios estándar respetando validaciones de username y nombres reservados', async () => {
    // Registrar usuario exitoso
    const fdValid = new FormData();
    fdValid.append('username', 'juan_perez');
    fdValid.append('password', 'JUAN2026');
    fdValid.append('confirmPassword', 'JUAN2026');

    const resValid = await registerAction(fdValid);
    expect(resValid.success).toBe(true);

    const user = await prisma.user.findUnique({
      where: { normalizedUsername: 'juan_perez' },
    });
    expect(user).toBeDefined();
    expect(user?.role).toBe('USER');

    // Validación: Usuario repetido
    const resRepeat = await registerAction(fdValid);
    expect(resRepeat.success).toBe(false);
    expect(resRepeat.message).toContain('ya está en uso');

    // Validación: Nombre reservado
    const fdReserved = new FormData();
    fdReserved.append('username', 'Admin');
    fdReserved.append('password', 'ADMIN2026');
    fdReserved.append('confirmPassword', 'ADMIN2026');

    const resReserved = await registerAction(fdReserved);
    expect(resReserved.success).toBe(false);
    expect(resReserved.message).toContain('no está disponible');

    // Validación: Caracteres no permitidos
    const fdInvalidChars = new FormData();
    fdInvalidChars.append('username', 'juan.perez!');
    fdInvalidChars.append('password', 'JUAN2026');
    fdInvalidChars.append('confirmPassword', 'JUAN2026');

    const resInvalidChars = await registerAction(fdInvalidChars);
    expect(resInvalidChars.success).toBe(false);
    expect(resInvalidChars.message).toContain('alfanuméricos');

    // Validación: Contraseña corta
    const fdShortPass = new FormData();
    fdShortPass.append('username', 'maria_db');
    fdShortPass.append('password', '123');
    fdShortPass.append('confirmPassword', '123');

    const resShortPass = await registerAction(fdShortPass);
    expect(resShortPass.success).toBe(false);
    expect(resShortPass.message).toContain('entre 4 y 12');
  });

  // --- ESCENARIO 4: Login y Rate Limiting ---
  test('Debería bloquear accesos por rate limiting tras múltiples intentos fallidos', async () => {
    const username = 'target_user';
    const normalizedUsername = 'target_user';

    // Crear el usuario activo
    await prisma.user.create({
      data: {
        username,
        normalizedUsername,
        passwordHash: hashPassword('CorrectPassword123!'),
        role: 'USER',
        isActive: true,
      },
    });

    const fdIncorrect = new FormData();
    fdIncorrect.append('username', username);
    fdIncorrect.append('password', 'WrongPass!');

    // Simular 5 intentos fallidos (Límite configurado)
    for (let i = 0; i < 5; i++) {
      const res = await loginAction(fdIncorrect);
      expect(res.success).toBe(false);
    }

    // El 6to intento debería fallar por rate limiting
    const resBlocked = await loginAction(fdIncorrect);
    expect(resBlocked.success).toBe(false);
    expect(resBlocked.message).toContain('Demasiados intentos');
  });

  // --- ESCENARIO 5 & 6: Aislamiento de Predicciones y Puntajes ---
  test('Debería asegurar el aislamiento de datos (User A no puede ver ni modificar predicciones de User B)', async () => {
    // 1. Crear 2 usuarios
    const userA = await prisma.user.create({
      data: { username: 'UserA', normalizedUsername: 'usera', passwordHash: 'hash', role: 'USER' }
    });

    const userB = await prisma.user.create({
      data: { username: 'UserB', normalizedUsername: 'userb', passwordHash: 'hash', role: 'USER' }
    });

    // 2. Crear un partido
    const match = await prisma.match.create({
      data: {
        stage: 'GROUP_STAGE',
        homeTeam: 'Alemania',
        awayTeam: 'Japón',
        status: 'SCHEDULED',
      }
    });

    // 3. Simular login de User A (estableciendo token en cookie y mockeando headers)
    mockCookiesStore.clear();
    const tokenA = 'token_super_secreto_para_user_a_32bytes_min';
    const tokenHashA = require('crypto').createHash('sha256').update(tokenA).digest('hex');

    await prisma.session.create({
      data: {
        tokenHash: tokenHashA,
        userId: userA.id,
        expiresAt: new Date(Date.now() + 1000 * 3600),
      }
    });
    mockCookiesStore.set('quiniela_session', { name: 'quiniela_session', value: tokenA });

    // 4. User A crea predicción: 2 - 1
    await upsertPrediction(match.id, {
      predictedHomeScore: 2,
      predictedAwayScore: 1,
      predictedHomePenalties: null,
      predictedAwayPenalties: null,
      predictedWinner: null,
    });

    // 5. Simular login de User B
    mockCookiesStore.clear();
    const tokenB = 'token_super_secreto_para_user_b_32bytes_min';
    const tokenHashB = require('crypto').createHash('sha256').update(tokenB).digest('hex');

    await prisma.session.create({
      data: {
        tokenHash: tokenHashB,
        userId: userB.id,
        expiresAt: new Date(Date.now() + 1000 * 3600),
      }
    });
    mockCookiesStore.set('quiniela_session', { name: 'quiniela_session', value: tokenB });

    // 6. User B carga sus predicciones
    const matchesForB = await getMatchesWithData();
    expect(matchesForB[0].prediction).toBeNull(); // User B no debe ver la predicción de User A

    // User B crea predicción: 0 - 3
    await upsertPrediction(match.id, {
      predictedHomeScore: 0,
      predictedAwayScore: 3,
      predictedHomePenalties: null,
      predictedAwayPenalties: null,
      predictedWinner: null,
    });

    // 7. Verificar en base de datos que existan ambas predicciones aisladas
    const allPreds = await prisma.prediction.findMany({ where: { matchId: match.id } });
    expect(allPreds.length).toBe(2);
    expect(allPreds.find(p => p.userId === userA.id)?.predictedHomeScore).toBe(2);
    expect(allPreds.find(p => p.userId === userB.id)?.predictedHomeScore).toBe(0);
  });

  // --- ESCENARIO 11: Expulsión si el usuario es desactivado ---
  test('Debería expulsar al usuario de la sesión si es desactivado (isActive = false)', async () => {
    const user = await prisma.user.create({
      data: {
        username: 'desactivado',
        normalizedUsername: 'desactivado',
        passwordHash: 'hash',
        role: 'USER',
        isActive: false, // Desactivado
      }
    });

    const token = 'desactivado_token_opaque_32_bytes_value';
    const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');

    await prisma.session.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 1000 * 3600),
      }
    });
    mockCookiesStore.set('quiniela_session', { name: 'quiniela_session', value: token });

    // Intentar obtener el usuario actual (debería retornar null)
    const currentUser = await getCurrentUser();
    expect(currentUser).toBeNull();
  });

  // --- ESCENARIOS ADICIONALES: Acceso Administrativo Simplificado ---
  test('Debería loguear al admin usando solo contraseña e ignorando username del payload', async () => {
    // 1. Configurar admin
    const adminPassword = 'AdminPassword123!';
    await prisma.user.create({
      data: {
        username: 'admin',
        normalizedUsername: 'admin',
        passwordHash: hashPassword(adminPassword),
        role: 'ADMIN',
        isActive: true,
      }
    });

    // 2. Intentar login de admin sin username en el FormData
    const fd = new FormData();
    fd.append('password', adminPassword);

    const loginRes = await loginAdminAction(fd);
    expect(loginRes.success).toBe(true);
    expect(loginRes.user?.username).toBe('admin');
    expect(loginRes.user?.role).toBe('ADMIN');
    expect(mockCookiesStore.has('quiniela_session')).toBe(true);
  });

  test('Debería ignorar un username manipulado en el payload y usar siempre admin', async () => {
    const adminPassword = 'AdminPassword123!';
    await prisma.user.create({
      data: {
        username: 'admin',
        normalizedUsername: 'admin',
        passwordHash: hashPassword(adminPassword),
        role: 'ADMIN',
        isActive: true,
      }
    });

    // Crear otro usuario normal para intentar confundir
    await prisma.user.create({
      data: {
        username: 'attacker',
        normalizedUsername: 'attacker',
        passwordHash: hashPassword('SomePassword!'),
        role: 'USER',
        isActive: true,
      }
    });

    const fd = new FormData();
    fd.append('username', 'attacker'); // Manipulado
    fd.append('password', adminPassword); // Contraseña del admin

    // Debería ser exitoso para 'admin' ignorando el username 'attacker'
    const loginRes = await loginAdminAction(fd);
    expect(loginRes.success).toBe(true);
    expect(loginRes.user?.username).toBe('admin');
  });

  test('Una contraseña incorrecta de admin no debería destruir una sesión de USER activa', async () => {
    // 1. Crear admin y user
    const admin = await prisma.user.create({
      data: {
        username: 'admin',
        normalizedUsername: 'admin',
        passwordHash: hashPassword('AdminPass!'),
        role: 'ADMIN',
        isActive: true,
      }
    });

    const user = await prisma.user.create({
      data: {
        username: 'Tester',
        normalizedUsername: 'tester',
        passwordHash: hashPassword('UserPass!'),
        role: 'USER',
        isActive: true,
      }
    });

    // 2. Iniciar sesión como usuario normal
    const token = 'token_de_usuario_normal_32bytes_value';
    const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');
    await prisma.session.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 1000 * 3600),
      }
    });
    mockCookiesStore.set('quiniela_session', { name: 'quiniela_session', value: token });

    // Verificar que la sesión de USER está activa
    let currentUser = await getCurrentUser();
    expect(currentUser?.username).toBe('Tester');

    // 3. Intentar login de admin con contraseña incorrecta
    const fd = new FormData();
    fd.append('password', 'WrongPassword!');
    const loginRes = await loginAdminAction(fd);

    expect(loginRes.success).toBe(false);
    expect(loginRes.message).toBe('Contraseña de administrador incorrecta.');

    // 4. Verificar que la sesión de USER sigue intacta
    currentUser = await getCurrentUser();
    expect(currentUser?.username).toBe('Tester');
    expect(mockCookiesStore.get('quiniela_session')?.value).toBe(token);
  });
});
