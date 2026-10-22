const request = require('supertest');
const jwt = require('jsonwebtoken');
const { setupTestDb, teardownTestDb } = require('../helpers/setup');
const { createUser } = require('../helpers/factory');
const app = require('../../src/app');
const database = require('../../src/database/knex');
const authService = require('../../src/modules/auth/auth.service');
const usersService = require('../../src/modules/users/users.service');
const usersRepository = require('../../src/modules/users/users.repository');
const rateLimitStore = require('../../src/utils/rateLimitStore');

const password = 'Original1!';
const login = (user) => request(app).post('/api/auth/login').send({ username: user.username, password });
const bearer = (token) => request(app).get('/api/vessels').set('Authorization', `Bearer ${token}`);
const cookie = (response) => response.headers['set-cookie'][0].split(';')[0];

describe('Security regression tests', () => {
  beforeAll(setupTestDb);
  afterAll(teardownTestDb);

  it('issues a 15-minute typed token and an HttpOnly cookie without exposing refresh credentials', async () => {
    const user = await createUser({ password });
    const response = await login(user);
    expect(response.status).toBe(200);
    expect(response.body.data).not.toHaveProperty('refreshToken');
    expect(response.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(response.headers['set-cookie'][0]).toMatch(/SameSite=Strict/);
    const token = jwt.decode(response.body.data.accessToken);
    expect(token.exp - token.iat).toBe(900);
    expect(token.type).toBe('access');
    expect(token.sessionVersion).toBeGreaterThan(0);
  });

  it('rotates cookies and revokes the active family on refresh-token reuse', async () => {
    const user = await createUser({ password });
    const initial = await login(user);
    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', cookie(initial)).send({});
    expect(refreshed.status).toBe(200);
    expect(cookie(refreshed)).not.toBe(cookie(initial));
    expect(jwt.decode(cookie(refreshed).slice('refresh_token='.length)).exp)
      .toBe(jwt.decode(cookie(initial).slice('refresh_token='.length)).exp);
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookie(initial)).send({});
    expect(replay.status).toBe(401);
    expect((await bearer(refreshed.body.data.accessToken)).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie(refreshed)).send({})).status).toBe(401);
  });

  it('allows exactly one of two simultaneous refresh exchanges and rejects the replay', async () => {
    const user = await createUser({ password });
    const initial = await authService.login(user.username, password);
    const results = await Promise.allSettled([
      authService.refresh(initial.refreshToken), authService.refresh(initial.refreshToken),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('rejects pre-reset access and refresh tokens, and accepts a forced-change token only once', async () => {
    const actor = await createUser({ role: 'superadmin' });
    const target = await createUser({ password });
    const initial = await login(target);
    await usersService.resetPassword(actor, target.id, 'Temporary1!', '127.0.0.1');
    expect((await bearer(initial.body.data.accessToken)).status).toBe(401);
    expect((await request(app).post('/api/users/me/change-password')
      .set('Authorization', `Bearer ${initial.body.data.accessToken}`)
      .send({ new_password: 'Attacker1!' })).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie(initial)).send({})).status).toBe(401);
    const forced = await request(app).post('/api/auth/login')
      .send({ username: target.username, password: 'Temporary1!' });
    expect(forced.status).toBe(200);
    const token = forced.body.data.accessToken;
    expect(jwt.decode(token).type).toBe('password-change');
    expect(jwt.decode(token).exp - jwt.decode(token).iat).toBe(600);
    expect(forced.headers['set-cookie'][0]).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await bearer(token)).status).toBe(403);
    const change = () => request(app).post('/api/users/me/change-password')
      .set('Authorization', `Bearer ${token}`).send({ new_password: 'Replacement1!' });
    expect((await change()).status).toBe(200);
    expect((await change()).status).toBe(401);
    expect((await request(app).post('/api/auth/login')
      .send({ username: target.username, password: 'Replacement1!' })).status).toBe(200);
  });

  it('revokes access immediately after deactivation, demotion, logout, and password change', async () => {
    const actor = await createUser({ role: 'superadmin' });
    for (const action of ['deactivate', 'demote', 'logout', 'password']) {
      const target = await createUser({ password, role: 'admin' });
      const initial = await login(target);
      if (action === 'deactivate') await usersService.deactivateUser(actor, target.id, '127.0.0.1');
      if (action === 'demote') await usersService.updateUser(actor, target.id, { role: 'viewer' }, '127.0.0.1');
      if (action === 'logout') await authService.logout(target.id);
      if (action === 'password') await usersService.changeOwnPassword({ ...target, sessionVersion: jwt.decode(initial.body.data.accessToken).sessionVersion },
        { current_password: password, new_password: 'Replacement1!' }, '127.0.0.1');
      expect((await bearer(initial.body.data.accessToken)).status).toBe(401);
    }
  });

  it('uses the current role even if an out-of-band update omits session invalidation', async () => {
    const user = await createUser({ password, role: 'superadmin' });
    const initial = await login(user);
    await database.db('users').where('id', user.id).update({ role: 'viewer' });
    expect((await request(app).get('/api/users')
      .set('Authorization', `Bearer ${initial.body.data.accessToken}`)).status).toBe(403);
  });

  it('rolls back a role change and session invalidation if audit insertion fails', async () => {
    const actor = await createUser({ role: 'superadmin' });
    const user = await createUser({ password, role: 'admin' });
    const initial = await login(user);
    jest.spyOn(usersRepository, 'createAuditLog').mockRejectedValueOnce(new Error('Audit failed'));
    await expect(usersService.updateUser(actor, user.id, { role: 'viewer' })).rejects.toThrow('Audit failed');
    expect((await database.db('users').where('id', user.id).first()).role).toBe('admin');
    expect((await bearer(initial.body.data.accessToken)).status).toBe(200);
  });

  it('rejects cross-origin login and refresh requests', async () => {
    for (const path of ['/api/auth/login', '/api/auth/refresh']) {
      const response = await request(app).post(path).set('Origin', 'https://attacker.invalid').send({});
      expect(response.status).toBe(403);
    }
  });

  it('rejects unsafe purge ranges and prevents admin access', async () => {
    const user = await createUser({ password, role: 'superadmin' });
    const token = (await login(user)).body.data.accessToken;
    for (const query of ['days=0', 'days=-1', 'days=1.5', 'days=nope', 'days=', 'days=3651', 'days=1&days=90']) {
      expect((await request(app).post(`/api/archive/purge?${query}`)
        .set('Authorization', `Bearer ${token}`)).status).toBe(400);
    }
    const admin = await createUser({ password, role: 'admin' });
    expect((await request(app).post('/api/archive/purge?days=90')
      .set('Authorization', `Bearer ${(await login(admin)).body.data.accessToken}`)).status).toBe(403);
    await database.db('vessel_archive').insert([
      { id: 123456, vessel_name: 'Old', archived_at: new Date(Date.now() - 100 * 86400000).toISOString() },
      { id: 123457, vessel_name: 'Recent', archived_at: new Date().toISOString() },
    ]);
    const valid = await request(app).post('/api/archive/purge?days=90').set('Authorization', `Bearer ${token}`);
    expect(valid.status).toBe(200);
    expect(valid.body.data.purgedCount).toBe(1);
    expect(await database.db('vessel_archive').where('id', 123457).first()).toBeDefined();
    expect(await database.db('audit_logs').where('action', 'ARCHIVE_PURGE').first()).toBeDefined();
  });

  it('shares atomic expiring rate limits without coupling different accounts', async () => {
    const now = Date.now();
    const responses = await Promise.all(Array.from({ length: 8 }, () => rateLimitStore.consume('test', 'account-a', 5, 1000, now)));
    expect(responses.filter((response) => response.allowed)).toHaveLength(5);
    expect((await rateLimitStore.consume('test', 'account-b', 5, 1000, now)).allowed).toBe(true);
    expect((await rateLimitStore.consume('test', 'account-a', 5, 1000, now + 1000)).allowed).toBe(true);
    await rateLimitStore.cleanup(now + 2000);
    expect(Number((await database.db('security_rate_limits').count({ total: '*' }).first()).total)).toBe(0);
  });

  it('enforces CSP against inline scripts and bounds incoming request IDs', async () => {
    const response = await request(app).get('/login.html').set('X-Request-ID', 'x'.repeat(100));
    expect(response.headers['content-security-policy']).toMatch(/script-src 'self';/);
    expect(response.headers['x-request-id']).toHaveLength(36);
    expect((await request(app).get('/api/health')).body.data).toEqual({ status: 'healthy' });
  });

  if (process.env.TEST_DB_CLIENT === 'pg') {
    it('denies Data API roles access to every application table even if a permissive policy is added', async () => {
      for (const table of ['users', 'audit_logs', 'password_history', 'security_rate_limits', 'schema_migrations']) {
        const privileges = await database.db.raw("SELECT has_table_privilege('anon', ?, 'SELECT') AS allowed", [`public.${table}`]);
        expect(privileges.rows[0].allowed).toBe(false);
      }
      await database.db.raw('GRANT SELECT ON public.users TO anon');
      await database.db.raw('CREATE POLICY test_allow ON public.users FOR SELECT TO anon USING (true)');
      const rows = await database.db.transaction(async (trx) => {
        await trx.raw('SET LOCAL ROLE anon');
        return trx('users').select('id');
      });
      expect(rows).toHaveLength(0);
      await database.db.raw('DROP POLICY test_allow ON public.users');
      await database.db.raw('REVOKE SELECT ON public.users FROM anon');
    });

    it('supports login, password changes, audit, and rate limiting with the restricted runtime role', async () => {
      const user = await createUser({ password });
      const sql = require('fs').readFileSync(require('path').join(__dirname, '../../scripts/security/database-roles.sql'), 'utf8');
      await database.db.transaction((trx) => trx.raw(sql));
      const config = require('../../src/config');
      await database.close();
      config.db.user = 'vessel_app';
      try {
        const [, pending] = await database.db.migrate.list();
        expect(pending).toHaveLength(0);
        const response = await login(user);
        expect(response.status).toBe(200);
        expect((await bearer(response.body.data.accessToken)).status).toBe(200);
        expect((await rateLimitStore.consume('restricted-role', user.id, 5, 1000)).allowed).toBe(true);
        const changed = await request(app).post('/api/users/me/change-password')
          .set('Authorization', `Bearer ${response.body.data.accessToken}`)
          .send({ current_password: password, new_password: 'Restricted1!' });
        expect(changed.status).toBe(200);
        await expect(database.db.raw('TRUNCATE users CASCADE')).rejects.toThrow();
        await expect(database.db.raw('CREATE TABLE public.forbidden (id int)')).rejects.toThrow();
        await expect(database.db('audit_logs').del()).rejects.toThrow();
      } finally {
        await database.close();
        config.db.user = 'postgres';
      }
    });
  }
});
