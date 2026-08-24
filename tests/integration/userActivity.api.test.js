const request = require('supertest');
const { setupTestDb, teardownTestDb } = require('../helpers/setup');
const { createUser } = require('../helpers/factory');
const database = require('../../src/database/knex');
const app = require('../../src/app');
const userActivityService = require('../../src/modules/users/userActivity.service');

async function login(username, password = 'password1!') {
  return request(app).post('/api/auth/login').set('User-Agent', 'activity-test-agent').send({ username, password });
}

async function waitForEvent(criteria) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const event = await database.db('user_activity_events').where(criteria).first();
    if (event) return event;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return undefined;
}

async function waitForEventCount(criteria, expected) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const row = await database.db('user_activity_events').where(criteria).count({ total: '*' }).first();
    if (Number(row.total) === expected) return expected;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return -1;
}

describe('User activity API integration', () => {
  let superadmin;
  let admin;
  let operator;
  let viewer;
  let neverViewer;
  let deactivated;
  let superadminToken;

  beforeAll(async () => {
    await setupTestDb();
    superadmin = await createUser({ username: 'activity-sa', role: 'superadmin' });
    admin = await createUser({ username: 'activity-admin', role: 'admin' });
    operator = await createUser({ username: 'activity-operator', role: 'operator' });
    viewer = await createUser({ username: 'activity-viewer', role: 'viewer' });
    neverViewer = await createUser({ username: 'activity-never-viewer', role: 'viewer' });
    deactivated = await createUser({ username: 'activity-disabled', role: 'viewer', is_active: 0 });

    const loginRes = await login(superadmin.username);
    superadminToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('records successful login timestamps, count, and safe login event metadata', async () => {
    const loginRes = await login(admin.username);
    expect(loginRes.status).toBe(200);

    const stored = await database.db('users').where('id', admin.id).first();
    expect(stored.last_login_at).toBeTruthy();
    expect(stored.last_activity_at).toBeTruthy();
    expect(stored.login_count).toBe(1);

    const event = await database.db('user_activity_events').where({ user_id: admin.id, action: 'AUTH_LOGIN' }).first();
    expect(event.route_template).toBe('/api/auth/login');
    expect(event.user_agent).toBe('activity-test-agent');
    expect(JSON.stringify(event)).not.toContain('password1!');
    expect(event).not.toHaveProperty('password');
    expect(event).not.toHaveProperty('token');
  });

  it('does not count a failed login', async () => {
    const before = await database.db('users').where('id', operator.id).first();
    const failed = await login(operator.username, 'wrong-password');
    const after = await database.db('users').where('id', operator.id).first();
    expect(failed.status).toBe(401);
    expect(after.login_count).toBe(before.login_count);
    expect(after.last_login_at).toBe(before.last_login_at);
  });

  it('coalesces automatic dashboard polling into one 15-minute heartbeat', async () => {
    const viewerLogin = await login(viewer.username);
    const token = viewerLogin.body.data.accessToken;
    const response = await request(app)
      .get('/api/vessels')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    await request(app).get('/api/vessels/summary').set('Authorization', `Bearer ${token}`);
    await request(app).get('/api/vessels').set('Authorization', `Bearer ${token}`);

    const event = await waitForEvent({ user_id: viewer.id, action: 'DASHBOARD_VIEWED' });
    expect(event).toBeDefined();
    expect(event.role).toBe('viewer');
    expect(event.response_status).toBe(200);
    expect(await waitForEventCount({ user_id: viewer.id, action: 'DASHBOARD_VIEWED' }, 1)).toBe(1);

    const stored = await database.db('users').where('id', viewer.id).first();
    expect(stored.last_activity_at).toBeTruthy();
    expect(stored.last_activity_heartbeat_at).toBeTruthy();

    await database.db('users').where('id', viewer.id).update({
      last_activity_heartbeat_at: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
    });
    await request(app).get('/api/vessels/summary').set('Authorization', `Bearer ${token}`);
    expect(await waitForEventCount({ user_id: viewer.id, action: 'DASHBOARD_VIEWED' }, 2)).toBe(2);
  });

  it('stores User-Agent only on login or when the device changes', async () => {
    const loginEvent = await database.db('user_activity_events')
      .where({ user_id: viewer.id, action: 'AUTH_LOGIN' })
      .first();
    expect(loginEvent.user_agent).toBe('activity-test-agent');

    const viewerRow = await database.db('users').where('id', viewer.id).first();
    const viewerLogin = await login(viewer.username);
    const token = viewerLogin.body.data.accessToken;
    expect(viewerRow.last_user_agent_hash).toBeTruthy();

    await request(app)
      .get('/api/terminals')
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', 'changed-device-agent');
    await request(app)
      .get('/api/terminals')
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', 'changed-device-agent');
    expect(await waitForEventCount({ user_id: viewer.id, action: 'TERMINALS_VIEWED' }, 2)).toBe(2);

    const terminalEvents = await database.db('user_activity_events')
      .where({ user_id: viewer.id, action: 'TERMINALS_VIEWED' })
      .orderBy('id', 'asc');
    expect(terminalEvents[0].user_agent).toBe('changed-device-agent');
    expect(terminalEvents[1].user_agent).toBeNull();
  });

  it('aggregates successful requests into one UTC daily row per user', async () => {
    const dailyRows = await database.db('user_activity_daily').where('user_id', viewer.id);
    expect(dailyRows).toHaveLength(1);
    expect(dailyRows[0].activity_date).toBe(new Date().toISOString().slice(0, 10));
    expect(dailyRows[0].request_count).toBeGreaterThanOrEqual(7);
    expect(dailyRows[0].first_activity_at).toBeTruthy();
    expect(dailyRows[0].last_activity_at).toBeTruthy();
  });

  it('purges raw events and daily summaries with separate retention windows', async () => {
    const oldDate = '2020-01-01';
    await database.db('user_activity_events').insert({
      user_id: operator.id,
      role: operator.role,
      action: 'DASHBOARD_VIEWED',
      http_method: 'GET',
      route_template: '/api/vessels',
      response_status: 200,
      occurred_at: `${oldDate}T00:00:00.000Z`,
    });
    await database.db('user_activity_daily').insert({
      user_id: operator.id,
      activity_date: oldDate,
      role: operator.role,
      request_count: 1,
      first_activity_at: `${oldDate}T00:00:00.000Z`,
      last_activity_at: `${oldDate}T00:00:00.000Z`,
    });

    expect(await userActivityService.purgeExpiredEvents(90)).toBeGreaterThanOrEqual(1);
    expect(await userActivityService.purgeExpiredDailySummaries(730)).toBe(1);
    expect(await database.db('user_activity_daily').where({ user_id: operator.id, activity_date: oldDate }).first()).toBeUndefined();
  });

  it('records one readable account action with separate actor and target', async () => {
    const resetResponse = await request(app)
      .post(`/api/users/${viewer.id}/reset-password`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ new_password: 'Replacement2!' });
    expect(resetResponse.status).toBe(200);

    const event = await waitForEvent({
      user_id: superadmin.id,
      target_user_id: viewer.id,
      action: 'ACCOUNT_PASSWORD_RESET',
    });
    expect(event).toBeDefined();
    expect(event.target_username_snapshot).toBe(viewer.username);

    const duplicateCount = await database.db('user_activity_events')
      .where({ user_id: superadmin.id, target_user_id: viewer.id, action: 'ACCOUNT_PASSWORD_RESET' })
      .count({ total: '*' })
      .first();
    expect(Number(duplicateCount.total)).toBe(1);

    const eventsResponse = await request(app)
      .get(`/api/users/activity-events?action=ACCOUNT_PASSWORD_RESET&targetUserId=${viewer.id}`)
      .set('Authorization', `Bearer ${superadminToken}`);
    expect(eventsResponse.status).toBe(200);
    expect(eventsResponse.body.data).toHaveLength(1);
    expect(eventsResponse.body.data[0].action_label).toBe('Reset password');
    expect(eventsResponse.body.data[0].actor.username).toBe(superadmin.username);
    expect(eventsResponse.body.data[0].target.username).toBe(viewer.username);
  });

  it('returns readable labels for historical GET_API events', async () => {
    await database.db('user_activity_events').insert({
      user_id: superadmin.id,
      role: 'superadmin',
      action: 'GET_API_VESSELS',
      http_method: 'GET',
      route_template: '/api/vessels',
      response_status: 200,
      occurred_at: new Date().toISOString(),
    });

    const response = await request(app)
      .get('/api/users/activity-events?action=GET_API_VESSELS')
      .set('Authorization', `Bearer ${superadminToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data[0].action_label).toBe('Viewed vessel dashboard');
  });

  it('classifies every role and excludes deactivated users from actual usage', async () => {
    const now = Date.now();
    await database.db('users').where('id', operator.id).update({
      last_login_at: new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString(),
      last_activity_at: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
      login_count: 2,
    });
    await database.db('users').where('id', deactivated.id).update({
      last_login_at: new Date(now - 60 * 1000).toISOString(),
      last_activity_at: new Date(now - 60 * 1000).toISOString(),
      login_count: 1,
    });

    const response = await request(app)
      .get('/api/users/activity-summary')
      .set('Authorization', `Bearer ${superadminToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.byRole).toEqual(expect.objectContaining({
      superadmin: expect.any(Object), admin: expect.any(Object),
      operator: expect.any(Object), viewer: expect.any(Object),
    }));
    expect(response.body.data.byRole.operator.inactiveOver30Days).toBe(1);
    expect(response.body.data.deactivated).toBe(1);
    expect(response.body.data.byRole.viewer.actuallyUsedIn30Days).toBe(1);
    expect(response.body.data.byRole.viewer.neverLoggedIn).toBe(1);
    expect(response.body.data.neverLoggedIn).toBeGreaterThanOrEqual(1);
  });

  it('allows only Superadmin to view summaries and events', async () => {
    const adminLogin = await login(admin.username);
    const adminToken = adminLogin.body.data.accessToken;
    for (const path of ['/api/users/activity-summary', '/api/users/activity-events']) {
      const denied = await request(app).get(path).set('Authorization', `Bearer ${adminToken}`);
      expect(denied.status).toBe(403);
      const allowed = await request(app).get(path).set('Authorization', `Bearer ${superadminToken}`);
      expect(allowed.status).toBe(200);
    }
  });

  it('supports role and usage filters without exposing credential fields', async () => {
    const usersRes = await request(app)
      .get('/api/users?role=viewer&activityStatus=active-30d')
      .set('Authorization', `Bearer ${superadminToken}`);
    expect(usersRes.status).toBe(200);
    expect(usersRes.body.data.every((user) => user.role === 'viewer' && user.is_active)).toBe(true);
    for (const user of usersRes.body.data) {
      expect(user).not.toHaveProperty('password_hash');
      expect(user).not.toHaveProperty('refresh_token_hash');
    }

    const eventsRes = await request(app)
      .get('/api/users/activity-events?role=viewer&limit=10')
      .set('Authorization', `Bearer ${superadminToken}`);
    expect(eventsRes.status).toBe(200);
    expect(eventsRes.body.data.every((event) => event.role === 'viewer')).toBe(true);
    expect(eventsRes.body.meta.total).toBeGreaterThan(0);
  });
});
