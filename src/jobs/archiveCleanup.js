const vesselService = require('../modules/vessel/vessel.service');
const archiveService = require('../modules/archive/archive.service');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Initializes and starts the background cleaning and archiving tasks
 */
function startArchiveJobs() {
  if (config.isTest) {
    logger.info('Scheduled background jobs disabled in test environment.');
    return;
  }

  logger.info('Starting background database maintenance jobs...');

  // 1. Run vessel archiving check every hour (departed > 24 hours ago)
  const ARCHIVE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  
  setInterval(async () => {
    try {
      logger.info('Executing scheduled vessel auto-archiving job...');
      const count = await vesselService.archiveExpiredVessels(24);
      if (count > 0) {
        logger.info(`Scheduled auto-archive complete. Moved ${count} vessel(s) to archive.`);
      }
    } catch (error) {
      logger.error('Scheduled vessel archiving job failed', { error: error.message });
    }
  }, ARCHIVE_INTERVAL_MS);

  // 2. Run historical archive purge every 24 hours (records > 90 days old)
  const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  setInterval(async () => {
    try {
      logger.info('Executing scheduled 90-day archive purge job...');
      const count = await archiveService.purgeOldArchive(90);
      if (count > 0) {
        logger.info(`Scheduled archive purge complete. Removed ${count} record(s) older than 90 days.`);
      }
    } catch (error) {
      logger.error('Scheduled archive purge job failed', { error: error.message });
    }
  }, PURGE_INTERVAL_MS);

  // Execute once immediately on server startup
  logger.info('Executing initial startup cleanup tasks...');
  vesselService.archiveExpiredVessels(24)
    .then((count) => {
      if (count > 0) logger.info(`Startup auto-archiving completed: ${count} vessel(s) archived.`);
    })
    .catch((err) => logger.error('Startup auto-archiving failed', { error: err.message }));

  archiveService.purgeOldArchive(90)
    .then((count) => {
      if (count > 0) logger.info(`Startup archive purge completed: ${count} record(s) purged.`);
    })
    .catch((err) => logger.error('Startup archive purge failed', { error: err.message }));
}

module.exports = { startArchiveJobs };
