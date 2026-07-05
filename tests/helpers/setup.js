const config = require('../../src/config');
const logger = require('../../src/utils/logger');

// Mute logs during testing
logger.transports.forEach((t) => {
  t.silent = true;
});

/**
 * Global test environment setup helper.
 *
 * IMPORTANT: config.db.path must be repointed to ':memory:' BEFORE any module
 * that touches src/database/knex.js's `db` getter is first accessed, since the
 * underlying Knex instance is built (and cached) on first access. This helper
 * must run before any repository/service code executes.
 */
async function setupTestDb() {
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
