const { connect, close } = require('../../src/database/connection');
const { runMigrations } = require('../../src/database/migrations/runner');
const config = require('../../src/config');
const logger = require('../../src/utils/logger');

// Mute logs during testing
logger.transports.forEach((t) => {
  t.silent = true;
});

/**
 * Global test environment setup helper
 */
async function setupTestDb() {
  // Override database path to in-memory for testing
  config.db.path = ':memory:';
  
  // Establish connection
  const db = connect();

  // Run initial migrations
  await runMigrations();

  return db;
}

async function teardownTestDb() {
  close();
}

module.exports = {
  setupTestDb,
  teardownTestDb,
};
