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
  config.db.client = 'sqlite';
  config.db.path = ':memory:';

  // eslint-disable-next-line global-require
  const database = require('../../src/database/knex');
  const db = database.connect();

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
