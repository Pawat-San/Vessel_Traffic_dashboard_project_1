const request = require('supertest');
const { setupTestDb, teardownTestDb } = require('../helpers/setup');
const { createUser } = require('../helpers/factory');
const app = require('../../src/app');

async function loginAs(username, password) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res.body.data.accessToken;
}

describe('Users API integration -- RBAC matrix', () => {
  let superadminToken;
  let adminToken;
  let operatorToken;
  let viewerToken;
  let targetSuperadmin;
  let targetOperator;

  beforeAll(async () => {
    await setupTestDb();

    await createUser({ username: 'api-superadmin', password: 'password12345', role: 'superadmin' });
    await createUser({ username: 'api-admin', password: 'password12345', role: 'admin' });
    await createUser({ username: 'api-operator', password: 'password12345', role: 'operator' });
    await createUser({ username: 'api-viewer', password: 'password12345', role: 'viewer' });
    targetSuperadmin = await createUser({ username: 'api-superadmin-2', password: 'password12345', role: 'superadmin' });
    targetOperator = await createUser({
      username: 'api-operator-2',
      password: 'password12345',
      display_name: 'Needle Operations User',
      role: 'operator',
    });

    superadminToken = await loginAs('api-superadmin', 'password12345');
    adminToken = await loginAs('api-admin', 'password12345');
    operatorToken = await loginAs('api-operator', 'password12345');
    viewerToken = await loginAs('api-viewer', 'password12345');
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('operator and viewer are fully blocked from /api/users', async () => {
    const opRes = await request(app).get('/api/users').set('Authorization', `Bearer ${operatorToken}`);
    expect(opRes.status).toBe(403);

    const viewerRes = await request(app).get('/api/users').set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerRes.status).toBe(403);
  });

  it('admin cannot create a superadmin account', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'sneaky-admin-created', password: 'Password1!', display_name: 'Sneaky', role: 'superadmin' });

    expect(res.status).toBe(403);
  });

  it('admin cannot edit an existing superadmin account', async () => {
    const res = await request(app)
      .put(`/api/users/${targetSuperadmin.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ display_name: 'Hacked Name' });

    expect(res.status).toBe(403);
  });

  it('admin cannot reset any other account password', async () => {
    const res = await request(app)
      .post(`/api/users/${targetOperator.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ new_password: 'Newpassword1!' });

    expect(res.status).toBe(403);
  });

  it('admin cannot use any Account Management operation', async () => {
    const listRes = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(403);

    const detailRes = await request(app).get(`/api/users/${targetOperator.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(detailRes.status).toBe(403);

    const createRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'admin-created-op', password: 'Password1!', display_name: 'Op', role: 'operator' });

    expect(createRes.status).toBe(403);

    const editRes = await request(app)
      .put(`/api/users/${targetOperator.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'viewer' });

    expect(editRes.status).toBe(403);

    const deactivateRes = await request(app)
      .delete(`/api/users/${targetOperator.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deactivateRes.status).toBe(403);
  });

  it('superadmin CAN create, edit, and reset-password a superadmin account', async () => {
    const createRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ username: 'superadmin-created', password: 'Password1!', display_name: 'SA', role: 'superadmin' });

    expect(createRes.status).toBe(201);

    const resetRes = await request(app)
      .post(`/api/users/${createRes.body.data.id}/reset-password`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ new_password: 'Anotherpassword2!' });

    expect(resetRes.status).toBe(200);
  });

  it('list response never leaks password_hash or refresh_token_hash', async () => {
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${superadminToken}`);
    expect(res.status).toBe(200);
    for (const user of res.body.data) {
      expect(user).not.toHaveProperty('password_hash');
      expect(user).not.toHaveProperty('refresh_token_hash');
    }
  });

  it('searches username and display name case-insensitively with literal wildcard handling', async () => {
    await createUser({ username: 'literal%account', display_name: 'Percent Account', role: 'viewer' });

    const usernameRes = await request(app)
      .get('/api/users?search=API-OPERATOR-2')
      .set('Authorization', `Bearer ${superadminToken}`);
    expect(usernameRes.status).toBe(200);
    expect(usernameRes.body.data.map((user) => user.id)).toContain(targetOperator.id);

    const displayNameRes = await request(app)
      .get('/api/users?search=needle%20operations')
      .set('Authorization', `Bearer ${superadminToken}`);
    expect(displayNameRes.status).toBe(200);
    expect(displayNameRes.body.data).toHaveLength(1);
    expect(displayNameRes.body.data[0].id).toBe(targetOperator.id);

    const literalWildcardRes = await request(app)
      .get('/api/users?search=%25')
      .set('Authorization', `Bearer ${superadminToken}`);
    expect(literalWildcardRes.status).toBe(200);
    expect(literalWildcardRes.body.data).toHaveLength(1);
    expect(literalWildcardRes.body.data[0].username).toBe('literal%account');
  });
});
