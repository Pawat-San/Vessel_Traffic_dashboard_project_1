const archiveRepository = require('./archive.repository');
const logger = require('../../utils/logger');
const database = require('../../database/knex');
const usersRepository = require('../users/users.repository');
const { ValidationError } = require('../../utils/errors');

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
  async purgeOldArchive(days = 90, actor = null) {
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw new ValidationError('Retention days must be an integer from 1 through 3650');
    }
    const deletedCount = await database.db.transaction(async (trx) => {
      const count = await archiveRepository.purge(days, trx);
      await usersRepository.createAuditLog({
        action: 'ARCHIVE_PURGE', entity_type: 'vessel_archive',
        changes: { retentionDays: days, deletedCount: count, scheduled: !actor },
        user_id: actor ? actor.id : null, ip_address: actor ? actor.ip : null,
      }, trx);
      return count;
    });
    if (deletedCount > 0) {
      logger.info(`Purged ${deletedCount} archived vessel records older than ${days} days.`);
    }
    return deletedCount;
  }
}

module.exports = new ArchiveService();
