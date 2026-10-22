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
    if (config.db.ssl && !config.db.sslVerify) {
      logger.warn('Database TLS certificate verification is disabled. Configure DB_SSL_CA_FILE and DB_SSL_VERIFY=true.');
    }
    // 1. Run pending database migrations
    if (!config.isProd || process.env.RUN_MIGRATIONS_ON_STARTUP === 'true') {
      await db.migrate.latest();
    } else {
      const [, pending] = await db.migrate.list();
      if (pending.length) throw new Error('Pending database migrations. Run npm run db:migrate before starting.');
    }

    // 2. Populate database seeds if empty
    const { count } = await db('users').count({ count: '*' }).first();
    if (Number(count) === 0) {
      if (config.isProd && process.env.ALLOW_INITIAL_SEED !== 'true') {
        throw new Error('Empty production database. Run the bootstrap seed explicitly with migration credentials.');
      }
      logger.info('Database appears empty. Seeding initial configurations...');
      await db.seed.run();
    }

    // 3. Start Background Schedulers (Archive, purge)
    startArchiveJobs();

    // 4. Start Listening on HTTP Port
    const server = app.listen(config.port, () => {
      logger.info(`=== SERVER BOOTSTRAP COMPLETE ===`);
      logger.info(`Environment : ${config.env}`);
      logger.info(`Node runtime: ${process.version}`);
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
