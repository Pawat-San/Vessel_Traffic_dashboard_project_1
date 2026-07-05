const config = require('./config');
const app = require('./app');
const { db, close } = require('./database/knex');
const { startArchiveJobs } = require('./jobs/archiveCleanup');
const logger = require('./utils/logger');

/**
 * Bootstraps the entire server stack
 */
async function bootstrap() {
  logger.info('Starting Vessel Traffic Dashboard Server bootstrap...');

  try {
    // 1. Run pending database migrations
    await db.migrate.latest();

    // 2. Populate database seeds if empty
    const { count } = await db('users').count({ count: '*' }).first();
    if (Number(count) === 0) {
      logger.info('Database appears empty. Seeding initial configurations...');
      await db.seed.run();
    }

    // 3. Start Background Schedulers (Archive, purge)
    startArchiveJobs();

    // 4. Start Listening on HTTP Port
    const server = app.listen(config.port, () => {
      logger.info(`=== SERVER BOOTSTRAP COMPLETE ===`);
      logger.info(`Environment : ${config.env}`);
      logger.info(`Port        : ${config.port}`);
      logger.info(`API Docs    : http://localhost:${config.port}/api/docs`);
      logger.info(`Dashboard   : http://localhost:${config.port}`);
    });

    // 5. Graceful Shutdown Handlers (SIGTERM, SIGINT)
    const handleGracefulShutdown = () => {
      logger.info('Termination signal received. Initiating graceful shutdown sequence...');

      server.close(async () => {
        logger.info('HTTP Server connection pool closed.');

        await close();

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
