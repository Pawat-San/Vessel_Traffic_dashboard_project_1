const config = require('./config');
const app = require('./app');
const { connect } = require('./database/connection');
const { runMigrations } = require('./database/migrations/runner');
const { runSeeds } = require('./database/seeds/runner');
const { startArchiveJobs } = require('./jobs/archiveCleanup');
const logger = require('./utils/logger');

/**
 * Bootstraps the entire server stack
 */
async function bootstrap() {
  logger.info('Starting Vessel Traffic Dashboard Server bootstrap...');

  try {
    // 1. Establish Database Connection singleton
    const db = connect();

    // 2. Execute Pending Database Migrations
    await runMigrations();

    // 3. Populate Database seeds if empty
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount === 0) {
      logger.info('Database appears empty. Seeding initial configurations...');
      await runSeeds();
    }

    // 4. Start Background Schedulers (Archive, purge)
    startArchiveJobs();

    // 5. Start Listening on HTTP Port
    const server = app.listen(config.port, () => {
      logger.info(`=== SERVER BOOTSTRAP COMPLETE ===`);
      logger.info(`Environment : ${config.env}`);
      logger.info(`Port        : ${config.port}`);
      logger.info(`API Docs    : http://localhost:${config.port}/api/docs`);
      logger.info(`Dashboard   : http://localhost:${config.port}`);
    });

    // 6. Graceful Shutdown Handlers (SIGTERM, SIGINT)
    const handleGracefulShutdown = () => {
      logger.info('Termination signal received. Initiating graceful shutdown sequence...');
      
      server.close(() => {
        logger.info('HTTP Server connection pool closed.');
        
        const { close: closeDb } = require('./database/connection');
        closeDb();
        
        logger.info('Process exited cleanly.');
        process.exit(0);
      });

      // Force shutdown after 10s if connections remain stuck
      setTimeout(() => {
        logger.error('Graceful shutdown timeout exceeded. Forcing termination.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', handleGracefulShutdown);
    process.on('SIGINT', handleGracefulShutdown);

  } catch (error) {
    logger.error('FATAL Error during application bootstrap sequence', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Start application
bootstrap();
