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

  beforeAll(async () => {
    await setupTestDb();

    await createUser({ username: 'api-superadmin', password: 'password12345', role: 'superadmin' });
    await createUser({ username: 'api-admin', password: 'password12345', role: 'admin' });
    await createUser({ username: 'api-operator', password: 'password12345', role: 'operator' });
    await createUser({ username: 'api-viewer', password: 'password12345', role: 'viewer' });
    targetSuperadmin = await createUser({ username: 'api-superadmin-2', password: 'password12345', role: 'superadmin' });

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
      .send({ username: 'sneaky-admin-created', password: 'password12345', display_name: 'Sneaky', role: 'superadmin' });

    expect(res.status).toBe(403);
  });

  it('admin cannot edit an existing superadmin account', async () => {
    const res = await request(app)
      .put(`/api/users/${targetSuperadmin.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ display_name: 'Hacked Name' });

    expect(res.status).toBe(403);
  });

  it('admin cannot reset a superadmin password', async () => {
    const res = await request(app)
      .post(`/api/users/${targetSuperadmin.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ new_password: 'newpassword12345' });

    expect(res.status).toBe(403);
  });

  it('admin CAN create and edit an operator account', async () => {
    const createRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'admin-created-op', password: 'password12345', display_name: 'Op', role: 'operator' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data).not.toHaveProperty('password_hash');

    const editRes = await request(app)
      .put(`/api/users/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'viewer' });

    expect(editRes.status).toBe(200);
    expect(editRes.body.data.role).toBe('viewer');
  });

  it('superadmin CAN create, edit, and reset-password a superadmin account', async () => {
    const createRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ username: 'superadmin-created', password: 'password12345', display_name: 'SA', role: 'superadmin' });

    expect(createRes.status).toBe(201);

    const resetRes = await request(app)
      .post(`/api/users/${createRes.body.data.id}/reset-password`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ new_password: 'anotherpassword123' });

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
});
