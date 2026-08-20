const request = require('supertest');
const { setupTestDb, teardownTestDb } = require('../helpers/setup');
const { createUser } = require('../helpers/factory');
const app = require('../../src/app');

describe('Auth API integration', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('login returns mustChangePassword: false for a normal account', async () => {
    await createUser({ username: 'loginuser1', password: 'password12345', role: 'operator' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'loginuser1', password: 'password12345' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.mustChangePassword).toBe(false);
    expect(res.body.data).toHaveProperty('accessToken');
  });

  it('login returns mustChangePassword: true for a password-reset account, and blocks other endpoints until changed', async () => {
    await createUser({
      username: 'lockeduser1',
      password: 'password12345',
      role: 'operator',
      must_change_password: true,
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'lockeduser1', password: 'password12345' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.user.mustChangePassword).toBe(true);

    const token = loginRes.body.data.accessToken;

    // Blocked from an unrelated protected endpoint
    const blockedRes = await request(app)
      .get('/api/vessels')
      .set('Authorization', `Bearer ${token}`);

    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    // Logout must remain reachable while locked
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logoutRes.status).toBe(200);
  });

  it('allows the forced password change, after which the account is unblocked', async () => {
    await createUser({
      username: 'lockeduser2',
      password: 'oldpassword123',
      role: 'operator',
      must_change_password: true,
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'lockeduser2', password: 'oldpassword123' });
    const token = loginRes.body.data.accessToken;

    const changeRes = await request(app)
      .post('/api/users/me/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ new_password: 'Newpassword456!' });

    expect(changeRes.status).toBe(200);

    const vesselsRes = await request(app)
      .get('/api/vessels')
      .set('Authorization', `Bearer ${token}`);

    expect(vesselsRes.status).toBe(200);
  });

  it('forces an expired password change and revokes the previous refresh token', async () => {
    const expiredAt = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    await createUser({
      username: 'expireduser1',
      password: 'Expired1!',
      role: 'operator',
      password_changed_at: expiredAt,
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'expireduser1', password: 'Expired1!' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.user.mustChangePassword).toBe(true);
    expect(loginRes.body.data.user.passwordExpired).toBe(true);

    const token = loginRes.body.data.accessToken;
    const oldRefreshToken = loginRes.body.data.refreshToken;
    const blockedRes = await request(app)
      .get('/api/vessels')
      .set('Authorization', `Bearer ${token}`);
    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.error.details.passwordExpired).toBe(true);

    const changeRes = await request(app)
      .post('/api/users/me/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ new_password: 'Renewed1!' });
    expect(changeRes.status).toBe(200);

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: oldRefreshToken });
    expect(refreshRes.status).toBe(401);
  });
});
