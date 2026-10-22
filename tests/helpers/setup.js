const config = require('../../src/config');
const logger = require('../../src/utils/logger');

// Mute logs during testing
logger.transports.forEach((t) => {
  t.silent = true;
});

/**
 * Global test environment setup helper.
 *
 * IMPORTANT: config.db.client/path must be forced to sqlite/':memory:' BEFORE
 * any module that touches src/database/knex.js's `db` getter is first
 * accessed, since the underlying Knex instance is built (and cached) on
 * first access. This helper must run before any repository/service code
 * executes.
 *
 * This deliberately ignores whatever DB_CLIENT/DB_HOST/etc a developer's
 * local .env is pointed at (e.g. a real Postgres/Supabase instance) --
 * tests must never touch an external database. Several tests call .del()
 * on tables between cases, which would be destructive against real data.
 */
async function setupTestDb() {
  const postgres = process.env.TEST_DB_CLIENT === 'pg';
  config.db.client = postgres ? 'pg' : 'sqlite';
  config.db.path = ':memory:';
  if (postgres) {
    // Never fall back to the application's .env or a remote database.
    config.db.host = '127.0.0.1';
    config.db.port = Number(process.env.TEST_DB_PORT || 55432);
    config.db.name = 'vessel_dashboard_test';
    config.db.user = 'postgres';
    config.db.password = process.env.TEST_DB_PASSWORD || 'isolated-test-only';
    config.db.ssl = false;
  }

  // eslint-disable-next-line global-require
  const database = require('../../src/database/knex');
  const db = database.connect();
  if (postgres) {
    const identity = await db.raw('SELECT current_database() AS name');
    if (identity.rows[0].name !== 'vessel_dashboard_test') throw new Error('Refusing to reset a non-test database');
    await db.raw('DROP SCHEMA public CASCADE');
    await db.raw('CREATE SCHEMA public');
    for (const role of ['anon', 'authenticated']) {
      const existing = await db('pg_roles').where('rolname', role).first();
      if (!existing) await db.raw('CREATE ROLE ?? NOLOGIN', [role]);
      await db.raw('GRANT USAGE ON SCHEMA public TO ??', [role]);
    }
  }

  await db.migrate.latest();

  return db;
}

async function teardownTestDb() {
  // eslint-disable-next-line global-require
  const database = require('../../src/database/knex');
  await database.close();
}

module.exports = {
  setupTestDb,
  teardownTestDb,
};
