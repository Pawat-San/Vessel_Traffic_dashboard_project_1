const vesselRepository = require('./vessel.repository');
const terminalRepository = require('../terminal/terminal.repository');
const cache = require('../../utils/cache');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const connection = require('../../database/connection');

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
   * Helper to compute diff between old and new state for audit logs
   */
  calculateDiff(oldState, newState) {
    const changes = {};
    for (const key of Object.keys(newState)) {
      // Skip internal metadata dates if we only want to track user-facing fields
      if (['date_modify', 'created_at', 'updated_by_name', 'terminal_name', 'terminal_code'].includes(key)) {
        continue;
      }
      
      const oldVal = oldState[key];
      const newVal = newState[key];
      
      // Compare values, treating undefined or null equivalently for empty DB inputs
      const normalize = (v) => (v === undefined || v === null ? '' : String(v));
      if (normalize(oldVal) !== normalize(newVal)) {
        changes[key] = {
          old: oldVal === undefined ? null : oldVal,
          new: newVal === undefined ? null : newVal,
        };
      }
    }
    return Object.keys(changes).length > 0 ? changes : null;
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
    const result = vesselRepository.findAndCount(filters, pagination, sorting);
    
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

    const summary = vesselRepository.getSummary();
    cache.set(cacheKey, summary, 30);
    return summary;
  }

  /**
   * Get a vessel by its ID
   */
  async getVesselById(id) {
    const vessel = vesselRepository.findById(id);
    if (!vessel) {
      throw new NotFoundError(`Vessel with ID ${id} not found`);
    }
    return vessel;
  }

  /**
   * Create a new vessel
   */
  async createVessel(data, userId, clientIp) {
    // 1. Verify terminal is valid and active
    const terminal = terminalRepository.findById(data.terminal_id);
    if (!terminal || terminal.is_active !== 1) {
      throw new ValidationError(`Terminal ID ${data.terminal_id} is invalid or inactive`);
    }

    // 2. Add creator metadata
    // 3. Create vessel and insert audit log in a transaction
    const result = connection.db.transaction(() => {
      // 1. Validate payload and create vessel
      const createdVessel = vesselRepository.create({
        ...data,
        updated_by: userId,
      });

      // 2. Create audit log entry
      vesselRepository.createAuditLog({
        action: 'CREATE',
        entity_type: 'vessel',
        entity_id: createdVessel.id,
        changes: data,
        user_id: userId,
        ip_address: clientIp,
      });

      return createdVessel;
    })();
    
    // 4. Invalidate caches
    this.clearVesselsCache();
    logger.info(`Vessel created: ${result.vessel_name}`, { vesselId: result.id, userId });

    return this.getVesselById(result.id);
  }

  /**
   * Update an existing vessel
   */
  async updateVessel(id, data, userId, clientIp) {
    const existing = vesselRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Vessel with ID ${id} not found`);
    }

    // If changing terminal, verify it is valid and active
    if (data.terminal_id && data.terminal_id !== existing.terminal_id) {
      const terminal = terminalRepository.findById(data.terminal_id);
      if (!terminal || terminal.is_active !== 1) {
        throw new ValidationError(`Terminal ID ${data.terminal_id} is invalid or inactive`);
      }
    }

    const result = connection.db.transaction(() => {
      // Update vessel
      const updatedVessel = vesselRepository.update(id, {
        ...data,
        updated_by: userId,
      });

      // Create audit log
      vesselRepository.createAuditLog({
        action: 'UPDATE',
        entity_type: 'vessel',
        entity_id: id,
        changes: data, // In a real system, you might compute a diff here
        user_id: userId,
        ip_address: clientIp,
      });

      return updatedVessel;
    })();
    
    this.clearVesselsCache();
    logger.info(`Vessel updated: ${result.vessel_name}`, { vesselId: id, userId });

    return result;
  }

  /**
   * Delete a vessel
   */
  async deleteVessel(id, userId, clientIp) {
    const existing = vesselRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Vessel with ID ${id} not found`);
    }

    connection.db.transaction(() => {
      vesselRepository.delete(id);

      vesselRepository.createAuditLog({
        action: 'DELETE',
        entity_type: 'vessel',
        entity_id: id,
        changes: { deleted: true },
        user_id: userId,
        ip_address: clientIp,
      });

      return true;
    })();
    
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

    // Find vessels matching criteria
    const expiredVessels = vesselRepository.findExpiredForArchive(thresholdIso);

    if (expiredVessels.length === 0) {
      logger.debug('No expired vessels found to archive.');
      return 0;
    }

    logger.info(`Archiving ${expiredVessels.length} vessels departed before ${thresholdIso}`);

    const executeTransaction = connection.db.transaction(() => {
      const insertArchive = connection.db.prepare(`
        INSERT INTO vessel_archive (
          id, vessel_name, voy, type, terminal_code, activity, eta, etb, etd, atd, status, next_port, remark, updated_by_name, date_modify, created_at
        )
        VALUES (
          @id, @vessel_name, @voy, @type, @terminal_code, @activity, @eta, @etb, @etd, @atd, @status, @next_port, @remark, @updated_by_name, @date_modify, @created_at
        )
      `);

      for (const vessel of expiredVessels) {
        // Insert into archive
        insertArchive.run(vessel);

        // Create audit log for archive action
        vesselRepository.createAuditLog({
          action: 'ARCHIVE',
          entity_type: 'vessel',
          entity_id: vessel.id,
          changes: { reason: `Auto-archived: ATD (${vessel.atd}) older than ${hoursThreshold}h` },
          user_id: 1, // System user (Admin ID 1)
          ip_address: '127.0.0.1',
        }, connection.db);
      }

      // Delete from active vessels
      const ids = expiredVessels.map(v => v.id);
      vesselRepository.deleteMany(ids, connection.db);
    });

    executeTransaction();

    this.clearVesselsCache();
    logger.info(`Successfully archived ${expiredVessels.length} vessels.`);

    return expiredVessels.length;
  }
}

module.exports = new VesselService();
