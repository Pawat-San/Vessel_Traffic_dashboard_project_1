const terminalRepository = require('./terminal.repository');
const cache = require('../../utils/cache');
const { ConflictError, NotFoundError } = require('../../utils/errors');
const logger = require('../../utils/logger');

function isForeignKeyViolation(error) {
  // Postgres: 23503 = foreign_key_violation. SQLite (better-sqlite3): message contains "FOREIGN KEY".
  return error.code === '23503' || /FOREIGN KEY/i.test(error.message || '');
}

class TerminalService {
  /**
   * Get terminals list (cache-aside with 5-minute TTL)
   */
  async getAllTerminals(activeOnly = false) {
    const cacheKey = activeOnly ? 'terminals:active' : 'terminals:all';

    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      logger.debug(`Cache HIT for key: ${cacheKey}`);
      return cachedData;
    }

    logger.debug(`Cache MISS for key: ${cacheKey}`);
    const terminals = activeOnly
      ? await terminalRepository.findActive()
      : await terminalRepository.findAll();

    cache.set(cacheKey, terminals, 300);
    return terminals;
  }

  /**
   * Get terminal by ID
   */
  async getTerminalById(id) {
    const terminal = await terminalRepository.findById(id);
    if (!terminal) {
      throw new NotFoundError('Terminal not found');
    }
    return terminal;
  }

  /**
   * Create a new terminal
   */
  async createTerminal(data) {
    const existing = await terminalRepository.findByCode(data.code);
    if (existing) {
      throw new ConflictError(`Terminal with code '${data.code}' already exists`);
    }

    const created = await terminalRepository.create(data);

    cache.del(['terminals:active', 'terminals:all']);
    logger.info(`Terminal created: ${created.code}`, { terminalId: created.id });

    return created;
  }

  /**
   * Update an existing terminal
   */
  async updateTerminal(id, data) {
    const terminal = await terminalRepository.findById(id);
    if (!terminal) {
      throw new NotFoundError('Terminal not found');
    }

    if (data.code && data.code !== terminal.code) {
      const existing = await terminalRepository.findByCode(data.code);
      if (existing) {
        throw new ConflictError(`Terminal with code '${data.code}' already exists`);
      }
    }

    const updated = await terminalRepository.update(id, data);

    cache.del(['terminals:active', 'terminals:all']);
    logger.info(`Terminal updated: ${updated.code}`, { terminalId: id });

    return updated;
  }

  /**
   * Delete a terminal
   */
  async deleteTerminal(id) {
    const terminal = await terminalRepository.findById(id);
    if (!terminal) {
      throw new NotFoundError('Terminal not found');
    }

    try {
      const result = await terminalRepository.delete(id);

      cache.del(['terminals:active', 'terminals:all']);
      logger.info(`Terminal deleted: ${terminal.code}`, { terminalId: id });

      return result;
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictError('Cannot delete terminal because it is currently referenced by active vessels');
      }
      throw error;
    }
  }
}

module.exports = new TerminalService();
