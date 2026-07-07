const vesselRepository = require('./vessel.repository');
const terminalRepository = require('../terminal/terminal.repository');
const cache = require('../../utils/cache');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const database = require('../../database/knex');

class VesselService {
  /**
   * Helper to clear all cache keys associated with vessels
   */
  clearVesselsCache() {
    const keys = cache.keys();
    const vesselKeys = keys.filter((key) => key.startsWith('vessels:'));
    if (vesselKeys.length > 0) {
      cache.del(vesselKeys);
      logger.debug(`Invalidated vessel cache keys: ${vesselKeys.join(', ')}`);
    }
  }

  /**
   * Get filtered, sorted, paginated vessels list (Cache-Aside with 30s TTL)
   */
  async getVessels(filters = {}, pagination = { limit: 20, offset: 0 }, sorting = { sortBy: 'eta', sortDir: 'ASC' }) {
    const cacheKey = `vessels:list:${JSON.stringify({ filters, pagination, sorting })}`;

    const cached = cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache HIT for key: ${cacheKey}`);
      return cached;
    }

    logger.debug(`Cache MISS for key: ${cacheKey}`);
    const result = await vesselRepository.findAndCount(filters, pagination, sorting);

    cache.set(cacheKey, result, 30);
    return result;
  }

  /**
   * Get status counts summary (Cache-Aside with 30s TTL)
   */
  async getVesselSummary() {
    const cacheKey = 'vessels:summary';

    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const summary = await vesselRepository.getSummary();
    cache.set(cacheKey, summary, 30);
    return summary;
  }

  /**
   * Get a vessel by its ID
   */
  async getVesselById(id) {
    const vessel = await vesselRepository.findById(id);
    if (!vessel) {
      throw new NotFoundError(`Vessel with ID ${id} not found`);
    }
    return vessel;
  }

  /**
   * Create a new vessel
   */
  async createVessel(data, userId, clientIp) {
    const terminal = await terminalRepository.findById(data.terminal_id);
    if (!terminal || terminal.is_active !== 1) {
      throw new ValidationError(`Terminal ID ${data.terminal_id} is invalid or inactive`);
    }

    const result = await database.db.transaction(async (trx) => {
      const createdVessel = await vesselRepository.create({
        ...data,
        updated_by: userId,
      }, trx);

      await vesselRepository.createAuditLog({
        action: 'CREATE',
        entity_type: 'vessel',
        entity_id: createdVessel.id,
        changes: data,
        user_id: userId,
        ip_address: clientIp,
      }, trx);

      return createdVessel;
    });

    this.clearVesselsCache();
    logger.info(`Vessel created: ${result.vessel_name}`, { vesselId: result.id, userId });

    return this.getVesselById(result.id);
  }

  /**
   * Bulk-create vessels from a parsed CSV import.
   *
   * Rows may reference a terminal by `terminal_id` OR by `terminal_code`
   * (that is what the CSV export writes). Codes are resolved once up-front to
   * avoid an N+1 lookup. Valid rows are inserted; individually invalid rows
   * (unknown/inactive terminal) are collected and reported so a single bad row
   * never blocks the whole batch. The insert + audit logs run in one
   * transaction, so an unexpected DB error rolls the batch back atomically.
   *
   * @returns {{ inserted: number, failed: Array<{ row: number, vessel_name: string, reason: string }> }}
   */
  async createVesselsBulk(rows, userId, clientIp) {
    // Build a code -> id map for active terminals (case-insensitive on code).
    const terminals = await terminalRepository.findActive();
    const codeToId = new Map();
    for (const t of terminals) {
      codeToId.set(String(t.code).toUpperCase(), t.id);
    }
    const activeIds = new Set(terminals.map((t) => t.id));

    const failed = [];
    const resolved = [];

    rows.forEach((row, index) => {
      const { terminal_code, ...rest } = row;
      let terminalId = rest.terminal_id;

      if (terminalId == null && terminal_code) {
        terminalId = codeToId.get(String(terminal_code).toUpperCase());
      }

      if (terminalId == null || !activeIds.has(terminalId)) {
        failed.push({
          row: index + 1,
          vessel_name: row.vessel_name,
          reason: `Unknown or inactive terminal: ${terminal_code || rest.terminal_id}`,
        });
        return;
      }

      resolved.push({ ...rest, terminal_id: terminalId });
    });

    let inserted = 0;
    if (resolved.length > 0) {
      await database.db.transaction(async (trx) => {
        for (const data of resolved) {
          const createdVessel = await vesselRepository.create({
            ...data,
            updated_by: userId,
          }, trx);

          await vesselRepository.createAuditLog({
            action: 'CREATE',
            entity_type: 'vessel',
            entity_id: createdVessel.id,
            changes: { ...data, source: 'csv_import' },
            user_id: userId,
            ip_address: clientIp,
          }, trx);

          inserted += 1;
        }
      });

      this.clearVesselsCache();
    }

    logger.info(`Bulk import by user ${userId}: ${inserted} inserted, ${failed.length} failed`);

    return { inserted, failed };
  }

  /**
   * Update an existing vessel
   */
  async updateVessel(id, data, userId, clientIp) {
    const existing = await vesselRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Vessel with ID ${id} not found`);
    }

    if (data.terminal_id && data.terminal_id !== existing.terminal_id) {
      const terminal = await terminalRepository.findById(data.terminal_id);
      if (!terminal || terminal.is_active !== 1) {
        throw new ValidationError(`Terminal ID ${data.terminal_id} is invalid or inactive`);
      }
    }

    const result = await database.db.transaction(async (trx) => {
      const updatedVessel = await vesselRepository.update(id, {
        ...data,
        updated_by: userId,
      }, trx);

      await vesselRepository.createAuditLog({
        action: 'UPDATE',
        entity_type: 'vessel',
        entity_id: id,
        changes: data,
        user_id: userId,
        ip_address: clientIp,
      }, trx);

      return updatedVessel;
    });

    this.clearVesselsCache();
    logger.info(`Vessel updated: ${result.vessel_name}`, { vesselId: id, userId });

    return result;
  }

  /**
   * Delete a vessel
   */
  async deleteVessel(id, userId, clientIp) {
    const existing = await vesselRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Vessel with ID ${id} not found`);
    }

    await database.db.transaction(async (trx) => {
      await vesselRepository.delete(id, trx);

      await vesselRepository.createAuditLog({
        action: 'DELETE',
        entity_type: 'vessel',
        entity_id: id,
        changes: { deleted: true },
        user_id: userId,
        ip_address: clientIp,
      }, trx);
    });

    this.clearVesselsCache();
    logger.info(`Vessel deleted: ${existing.vessel_name} (ID: ${id})`, { userId });

    return true;
  }

  /**
   * Archive departed vessels with ATD older than 24 hours
   */
  async archiveExpiredVessels(hoursThreshold = 24) {
    const thresholdDate = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);
    const thresholdIso = thresholdDate.toISOString();

    const expiredVessels = await vesselRepository.findExpiredForArchive(thresholdIso);

    if (expiredVessels.length === 0) {
      logger.debug('No expired vessels found to archive.');
      return 0;
    }

    logger.info(`Archiving ${expiredVessels.length} vessels departed before ${thresholdIso}`);

    await database.db.transaction(async (trx) => {
      for (const vessel of expiredVessels) {
        const {
          id, vessel_name, voy, type, terminal_code, activity, eta, etb, etd, atd,
          status, next_port, remark, updated_by_name, date_modify, created_at,
        } = vessel;

        await trx('vessel_archive').insert({
          id, vessel_name, voy, type, terminal_code, activity, eta, etb, etd, atd,
          status, next_port, remark, updated_by_name, date_modify, created_at,
        });

        await vesselRepository.createAuditLog({
          action: 'ARCHIVE',
          entity_type: 'vessel',
          entity_id: vessel.id,
          changes: { reason: `Auto-archived: ATD (${vessel.atd}) older than ${hoursThreshold}h` },
          user_id: 1,
          ip_address: '127.0.0.1',
        }, trx);
      }

      const ids = expiredVessels.map((v) => v.id);
      await vesselRepository.deleteMany(ids, trx);
    });

    this.clearVesselsCache();
    logger.info(`Successfully archived ${expiredVessels.length} vessels.`);

    return expiredVessels.length;
  }
}

module.exports = new VesselService();
