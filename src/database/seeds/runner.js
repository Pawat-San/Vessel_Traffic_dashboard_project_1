const fs = require('fs');
const path = require('path');
const { db } = require('../connection');
const logger = require('../../utils/logger');

async function runSeeds() {
  logger.info('Starting database seeding...');

  const seedsDir = __dirname;
  const files = fs.readdirSync(seedsDir)
    .filter(file => file.endsWith('.js') && file !== 'runner.js')
    .sort();

  const executeTransaction = db.transaction(() => {
    for (const file of files) {
      logger.info(`Running seed: ${file}`);
      const seed = require(path.join(seedsDir, file));
      if (typeof seed.run === 'function') {
        seed.run(db);
      } else {
        logger.warn(`Seed file does not export a run function: ${file}`);
      }
    }
  });

  try {
    executeTransaction();
    logger.info('Database seeded successfully.');
  } catch (error) {
    logger.error('Seeding failed. Transaction rolled back.', { error: error.message });
    throw error;
  }
}

if (require.main === module) {
  runSeeds()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runSeeds };
