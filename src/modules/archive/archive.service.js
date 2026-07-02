const archiveRepository = require('./archive.repository');
const logger = require('../../utils/logger');

class ArchiveService {
  /**
   * Get archived vessels with pagination and filters
   */
  async getArchivedVessels(filters = {}, pagination = { limit: 20, offset: 0 }) {
    return archiveRepository.findAndCount(filters, pagination);
  }

  /**
   * Purge records older than a set period (90 days by default)
   */
  async purgeOldArchive(days = 90) {
    const deletedCount = archiveRepository.purge(days);
    if (deletedCount > 0) {
      logger.info(`Purged ${deletedCount} archived vessel records older than ${days} days.`);
    }
    return deletedCount;
  }
}

module.exports = new ArchiveService();
