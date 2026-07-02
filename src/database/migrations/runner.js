const fs = require('fs');
const path = require('path');
const connection = require('../connection');
const logger = require('../../utils/logger');

async function runMigrations() {
  logger.info('Starting schema migrations...');

  // Create migrations table if not exists
  connection.db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get applied migrations
  const appliedRows = connection.db.prepare('SELECT version FROM schema_migrations').all();
  const appliedVersions = new Set(appliedRows.map(r => r.version));

  // Read migration files
  const migrationsDir = __dirname;
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.js') && file !== 'runner.js')
    .sort();

  const migrationsToRun = [];

  for (const file of files) {
    const migration = require(path.join(migrationsDir, file));
    if (!migration.version || typeof migration.up !== 'function') {
      logger.warn(`Skipping invalid migration file: ${file}`);
      continue;
    }

    if (!appliedVersions.has(migration.version)) {
      migrationsToRun.push({
        version: migration.version,
        name: migration.name || file,
        up: migration.up,
        file
      });
    }
  }

  if (migrationsToRun.length === 0) {
    logger.info('Database schema is up to date. No migrations to run.');
    return;
  }

  logger.info(`Found ${migrationsToRun.length} pending migrations.`);

  const insertMigration = connection.db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');

  // Run in database transaction
  const executeTransaction = connection.db.transaction(() => {
    for (const migration of migrationsToRun) {
      logger.info(`Running migration: ${migration.name} (version ${migration.version})`);
      migration.up(connection.db);
      insertMigration.run(migration.version, migration.name);
    }
  });

  try {
    executeTransaction();
    logger.info('All migrations applied successfully.');
  } catch (error) {
    logger.error('Migration failed. Transaction rolled back.', { error: error.message });
    throw error;
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runMigrations };
