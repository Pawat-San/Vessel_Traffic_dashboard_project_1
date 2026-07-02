const terminalRepository = require('./terminal.repository');
const cache = require('../../utils/cache');
const { ConflictError, NotFoundError } = require('../../utils/errors');
const logger = require('../../utils/logger');

class TerminalService {
  /**
   * Get terminals list (cache-aside with 5-minute TTL)
   */
  async getAllTerminals(activeOnly = false) {
    const cacheKey = activeOnly ? 'terminals:active' : 'terminals:all';
    
    // Check cache
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      logger.debug(`Cache HIT for key: ${cacheKey}`);
      return cachedData;
    }

    logger.debug(`Cache MISS for key: ${cacheKey}`);
    const terminals = activeOnly
      ? terminalRepository.findActive()
      : terminalRepository.findAll();

    // Cache with 5 minutes TTL (300 seconds)
    cache.set(cacheKey, terminals, 300);
    return terminals;
  }

  /**
   * Get terminal by ID
   */
  async getTerminalById(id) {
    const terminal = terminalRepository.findById(id);
    if (!terminal) {
      throw new NotFoundError('Terminal not found');
    }
    return terminal;
  }

  /**
   * Create a new terminal
   */
  async createTerminal(data) {
    const existing = terminalRepository.findByCode(data.code);
    if (existing) {
      throw new ConflictError(`Terminal with code '${data.code}' already exists`);
    }

    const created = terminalRepository.create(data);
    
    // Invalidate cache
    cache.del(['terminals:active', 'terminals:all']);
    logger.info(`Terminal created: ${created.code}`, { terminalId: created.id });
    
    return created;
  }

  /**
   * Update an existing terminal
   */
  async updateTerminal(id, data) {
    const terminal = terminalRepository.findById(id);
    if (!terminal) {
      throw new NotFoundError('Terminal not found');
    }

    if (data.code && data.code !== terminal.code) {
      const existing = terminalRepository.findByCode(data.code);
      if (existing) {
        throw new ConflictError(`Terminal with code '${data.code}' already exists`);
      }
    }

    const updated = terminalRepository.update(id, data);
    
    // Invalidate cache
    cache.del(['terminals:active', 'terminals:all']);
    logger.info(`Terminal updated: ${updated.code}`, { terminalId: id });
    
    return updated;
  }

  /**
   * Delete a terminal
   */
  async deleteTerminal(id) {
    const terminal = terminalRepository.findById(id);
    if (!terminal) {
      throw new NotFoundError('Terminal not found');
    }

    try {
      const result = terminalRepository.delete(id);
      
      // Invalidate cache
      cache.del(['terminals:active', 'terminals:all']);
      logger.info(`Terminal deleted: ${terminal.code}`, { terminalId: id });
      
      return result;
    } catch (error) {
      if (error.code === 'ERR_SQLITE_ERROR' && error.message.includes('FOREIGN KEY')) {
        throw new ConflictError('Cannot delete terminal because it is currently referenced by active vessels');
      }
      throw error;
    }
  }
}

module.exports = new TerminalService();
