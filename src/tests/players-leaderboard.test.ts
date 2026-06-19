import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../lib/db';
import {
  togglePlayerStatusAction,
  resetPlayerAccessCodeByIdAction,
  exportPlayersCSVAction
} from '../app/actions';
import {
  getCurrentUser,
  setMockUser,
  hashPassword,
  verifyPassword
} from '../lib/auth';
import { getLeaderboardData } from '../lib/leaderboard';

// Mock next/headers
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

describe('Player Management & Leaderboard System Tests', () => {
  let adminUser: any;
  let normalUser: any;

  beforeEach(async () => {
    // Clean database tables
    await prisma.session.deleteMany({});
    await prisma.score.deleteMany({});
    await prisma.prediction.deleteMany({});
    await prisma.match.deleteMany({});
    await prisma.user.deleteMany({});

    mockCookiesStore.clear();
    mockHeadersStore.clear();
    setMockUser(null);

    // Create a base ADMIN user
    adminUser = await prisma.user.create({
      data: {
        username: 'admin_test',
        normalizedUsername: 'admin_test',
        passwordHash: hashPassword('AdminPass123!'),
        role: 'ADMIN',
        isActive: true,
      },
    });

    // Create a base USER
    normalUser = await prisma.user.create({
      data: {
        username: 'user_test',
        normalizedUsername: 'user_test',
        passwordHash: hashPassword('UserPass123!'),
        role: 'USER',
        isActive: true,
      },
    });
  });

  afterEach(async () => {
    await prisma.session.deleteMany({});
    await prisma.score.deleteMany({});
    await prisma.prediction.deleteMany({});
    await prisma.match.deleteMany({});
    await prisma.user.deleteMany({});
  });

  // Helper to log in as admin
  const loginAsAdmin = async () => {
    const token = 'admin_session_token_32_bytes_long_value_here';
    const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');
    await prisma.session.create({
      data: {
        tokenHash,
        userId: adminUser.id,
        expiresAt: new Date(Date.now() + 1000 * 3600),
      },
    });
    mockCookiesStore.set('quiniela_session', { name: 'quiniela_session', value: token });
    setMockUser(adminUser);
  };

  // Helper to log in as normal user
  const loginAsUser = async () => {
    const token = 'user_session_token_32_bytes_long_value_here';
    const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');
    await prisma.session.create({
      data: {
        tokenHash,
        userId: normalUser.id,
        expiresAt: new Date(Date.now() + 1000 * 3600),
      },
    });
    mockCookiesStore.set('quiniela_session', { name: 'quiniela_session', value: token });
    setMockUser(normalUser);
  };

  // --- TEST 1: Admin can toggle player status ---
  test('ADMIN deberia poder activar/desactivar jugadores', async () => {
    await loginAsAdmin();

    // Desactivar a normalUser
    const resDeactivate = await togglePlayerStatusAction(normalUser.id, false);
    expect(resDeactivate.success).toBe(true);

    const updatedUser = await prisma.user.findUnique({ where: { id: normalUser.id } });
    expect(updatedUser?.isActive).toBe(false);

    // Activar de nuevo
    const resActivate = await togglePlayerStatusAction(normalUser.id, true);
    expect(resActivate.success).toBe(true);

    const updatedUser2 = await prisma.user.findUnique({ where: { id: normalUser.id } });
    expect(updatedUser2?.isActive).toBe(true);
  });

  // --- TEST 2: Admin cannot deactivate themselves ---
  test('ADMIN no deberia poder desactivar su propia cuenta', async () => {
    await loginAsAdmin();

    const resSelf = await togglePlayerStatusAction(adminUser.id, false);
    expect(resSelf.success).toBe(false);
    expect(resSelf.message).toContain('No puedes desactivar tu propia cuenta');

    const updatedAdmin = await prisma.user.findUnique({ where: { id: adminUser.id } });
    expect(updatedAdmin?.isActive).toBe(true);
  });

  // --- TEST 3: Deactivating invalidates sessions ---
  test('Desactivar a un jugador deberia invalidar todas sus sesiones', async () => {
    await loginAsAdmin();

    // Crear sesión ficticia para normalUser
    const userToken = 'temp_token_for_normal_user_deactivation';
    const userTokenHash = require('crypto').createHash('sha256').update(userToken).digest('hex');
    await prisma.session.create({
      data: {
        tokenHash: userTokenHash,
        userId: normalUser.id,
        expiresAt: new Date(Date.now() + 1000 * 3600),
      },
    });

    let sessCount = await prisma.session.count({ where: { userId: normalUser.id } });
    expect(sessCount).toBe(1);

    // Desactivar usuario
    await togglePlayerStatusAction(normalUser.id, false);

    // Verificar que las sesiones del usuario fueron eliminadas
    sessCount = await prisma.session.count({ where: { userId: normalUser.id } });
    expect(sessCount).toBe(0);
  });

  // --- TEST 4: Non-admin users cannot access admin actions ---
  test('USER no deberia poder ejecutar acciones administrativas ni ver datos privados', async () => {
    await loginAsUser();

    // Intentar desactivar a admin
    await expect(togglePlayerStatusAction(adminUser.id, false)).rejects.toThrow();

    // Intentar cambiar contraseña
    await expect(resetPlayerAccessCodeByIdAction(normalUser.id, 'NUEVO123')).rejects.toThrow();

    // Intentar exportar CSV
    await expect(exportPlayersCSVAction()).rejects.toThrow();
  });

  // --- TEST 5: Reset user access code updates hash and clears sessions ---
  test('ADMIN deberia poder restablecer el codigo de acceso de un USER', async () => {
    await loginAsAdmin();

    // Crear sesión ficticia para normalUser
    const userToken = 'token_to_clear_on_reset';
    const userTokenHash = require('crypto').createHash('sha256').update(userToken).digest('hex');
    await prisma.session.create({
      data: {
        tokenHash: userTokenHash,
        userId: normalUser.id,
        expiresAt: new Date(Date.now() + 1000 * 3600),
      },
    });

    const resReset = await resetPlayerAccessCodeByIdAction(normalUser.id, 'PASS1234');
    expect(resReset.success).toBe(true);

    // Verificar nueva contraseña
    const updatedUser = await prisma.user.findUnique({ where: { id: normalUser.id } });
    expect(verifyPassword('PASS1234', updatedUser!.passwordHash)).toBe(true);

    // Verificar sesiones eliminadas
    const sessCount = await prisma.session.count({ where: { userId: normalUser.id } });
    expect(sessCount).toBe(0);
  });

  // --- TEST 6: User without predictions is included on leaderboard with 0 points ---
  test('Jugador sin predicciones deberia aparecer en la tabla de posiciones con 0 puntos', async () => {
    const players = await getLeaderboardData();

    // Debería incluir al menos normalUser (admin no juega)
    const userStats = players.find(p => p.id === normalUser.id);
    expect(userStats).toBeDefined();
    expect(userStats?.totalPoints).toBe(0);
    expect(userStats?.exacts).toBe(0);
    expect(userStats?.scoredCount).toBe(0);
  });

  // --- TEST 7: Leaderboard sorting and tie-breakers logic ---
  test('Leaderboard deberia aplicar correctamente los criterios de desempate en cascada', async () => {
    // Crear varios usuarios
    const playerA = await prisma.user.create({
      data: { username: 'PlayerA', normalizedUsername: 'playera', passwordHash: 'h', role: 'USER', createdAt: new Date('2026-01-01') }
    });
    const playerB = await prisma.user.create({
      data: { username: 'PlayerB', normalizedUsername: 'playerb', passwordHash: 'h', role: 'USER', createdAt: new Date('2026-01-02') }
    });
    const playerC = await prisma.user.create({
      data: { username: 'PlayerC', normalizedUsername: 'playerc', passwordHash: 'h', role: 'USER', createdAt: new Date('2026-01-03') }
    });

    const match1 = await prisma.match.create({
      data: { homeTeam: 'T1', awayTeam: 'T2', stage: 'GROUP_STAGE', status: 'FINISHED' }
    });
    const match2 = await prisma.match.create({
      data: { homeTeam: 'T3', awayTeam: 'T4', stage: 'GROUP_STAGE', status: 'FINISHED' }
    });

    // 1. PlayerA: 10 puntos (Total mayor)
    await prisma.score.create({ data: { userId: playerA.id, matchId: match1.id, points: 6, reason: 'Resultado exacto' } });
    await prisma.score.create({ data: { userId: playerA.id, matchId: match2.id, points: 4, reason: 'Tendencia' } });

    // 2. PlayerB: 8 puntos (Total menor, pero desempata con C)
    // Score de PlayerB: 6 pts (exacto) + 2 pts = 8 pts
    await prisma.score.create({ data: { userId: playerB.id, matchId: match1.id, points: 6, reason: 'Resultado exacto' } });
    await prisma.score.create({ data: { userId: playerB.id, matchId: match2.id, points: 2, reason: 'Goles' } }); // total 8 pts, exacts = 1

    // 3. PlayerC: 8 puntos (Mismos puntos que B, pero exactos = 0, tendencia+total = 1 (5pts) + 3pts = 8pts)
    await prisma.score.create({ data: { userId: playerC.id, matchId: match1.id, points: 5, reason: 'Tendencia + goles' } });
    await prisma.score.create({ data: { userId: playerC.id, matchId: match2.id, points: 3, reason: 'Otro' } }); // total 8 pts, exacts = 0

    // Predictions for valid predictions count desempate
    await prisma.prediction.create({
      data: { userId: playerA.id, matchId: match1.id, predictedHomeScore: 1, predictedAwayScore: 1 }
    });
    await prisma.prediction.create({
      data: { userId: playerB.id, matchId: match1.id, predictedHomeScore: 2, predictedAwayScore: 1 }
    });
    await prisma.prediction.create({
      data: { userId: playerC.id, matchId: match1.id, predictedHomeScore: 0, predictedAwayScore: 0 }
    });

    const leaderboard = await getLeaderboardData();

    // Busquemos en la lista clasificada
    const posA = leaderboard.findIndex(p => p.id === playerA.id);
    const posB = leaderboard.findIndex(p => p.id === playerB.id);
    const posC = leaderboard.findIndex(p => p.id === playerC.id);

    // PlayerA debe estar por encima de todos (10 pts)
    expect(posA).toBeLessThan(posB);
    expect(posA).toBeLessThan(posC);

    // PlayerB y PlayerC tienen 8 puntos, pero PlayerB tiene 1 exacto y PlayerC tiene 0.
    // Por lo tanto, PlayerB debe estar por encima de PlayerC.
    expect(posB).toBeLessThan(posC);
  });

  // --- TEST 8: CSV Export is secure ---
  test('La exportacion CSV no debe incluir campos sensibles como passwordHash o tokens', async () => {
    await loginAsAdmin();

    const csvContent = await exportPlayersCSVAction();
    expect(csvContent).toBeDefined();

    // No debe contener contraseñas ni hashes
    expect(csvContent).not.toContain('passwordHash');
    expect(csvContent).not.toContain('tokenHash');
    expect(csvContent).not.toContain('AdminPass123!');

    // Debe contener encabezados correctos
    expect(csvContent).toContain('Posición');
    expect(csvContent).toContain('Jugador');
    expect(csvContent).toContain('Estado');
    expect(csvContent).toContain('Puntos');
    expect(csvContent).toContain('Fecha de Registro');
  });
});
