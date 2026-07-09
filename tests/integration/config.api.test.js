const request = require('supertest');
const { setupTestDb, teardownTestDb } = require('../helpers/setup');
const app = require('../../src/app');

describe('Config API integration', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('GET /api/config returns the app title with no authentication required', async () => {
    const res = await request(app).get('/api/config');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.appTitle).toBe('string');
    expect(res.body.data.appTitle.length).toBeGreaterThan(0);
  });
});
