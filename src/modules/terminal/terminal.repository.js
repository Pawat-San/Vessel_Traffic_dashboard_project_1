const database = require('../../database/knex');

class TerminalRepository {
  /**
   * Find all terminals sorted by sort_order
   */
  async findAll(conn = database.db) {
    return conn('terminals').orderBy('sort_order', 'asc');
  }

  /**
   * Find only active terminals sorted by sort_order
   */
  async findActive(conn = database.db) {
    return conn('terminals').where('is_active', 1).orderBy('sort_order', 'asc');
  }

  /**
   * Find a terminal by ID
   */
  async findById(id, conn = database.db) {
    return conn('terminals').where('id', id).first();
  }

  /**
   * Find a terminal by its code
   */
  async findByCode(code, conn = database.db) {
    return conn('terminals').where('code', code).first();
  }

  /**
   * Create a new terminal
   */
  async create(data, conn = database.db) {
    const [row] = await conn('terminals').insert(data).returning('*');
    return row;
  }

  /**
   * Update an existing terminal
   */
  async update(id, data, conn = database.db) {
    const existing = await this.findById(id, conn);
    if (!existing) return null;

    const merged = { ...existing, ...data };
    await conn('terminals').where('id', id).update(merged);

    return merged;
  }

  /**
   * Delete a terminal by ID
   */
  async delete(id, conn = database.db) {
    const existing = await this.findById(id, conn);
    if (!existing) return false;

    await conn('terminals').where('id', id).del();
    return true;
  }
}

module.exports = new TerminalRepository();
