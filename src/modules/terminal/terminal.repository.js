const connection = require('../../database/connection');

class TerminalRepository {
  /**
   * Find all terminals sorted by sort_order
   */
  findAll() {
    return connection.db.prepare('SELECT * FROM terminals ORDER BY sort_order ASC').all();
  }

  /**
   * Find only active terminals sorted by sort_order
   */
  findActive() {
    return connection.db.prepare('SELECT * FROM terminals WHERE is_active = 1 ORDER BY sort_order ASC').all();
  }

  /**
   * Find a terminal by ID
   */
  findById(id) {
    return connection.db.prepare('SELECT * FROM terminals WHERE id = ?').get(id);
  }

  /**
   * Find a terminal by its code
   */
  findByCode(code) {
    return connection.db.prepare('SELECT * FROM terminals WHERE code = ?').get(code);
  }

  /**
   * Create a new terminal
   */
  create(data) {
    const stmt = connection.db.prepare(`
      INSERT INTO terminals (code, name, group_name, sort_order, is_active)
      VALUES (@code, @name, @group_name, @sort_order, @is_active)
    `);
    const info = stmt.run(data);
    return { id: info.lastInsertRowid, ...data };
  }

  /**
   * Update an existing terminal
   */
  update(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;

    const merged = { ...existing, ...data };
    connection.db.prepare(`
      UPDATE terminals
      SET code = @code, name = @name, group_name = @group_name, sort_order = @sort_order, is_active = @is_active
      WHERE id = @id
    `).run({ id, ...merged });

    return merged;
  }

  /**
   * Delete a terminal by ID
   */
  delete(id) {
    const existing = this.findById(id);
    if (!existing) return false;

    connection.db.prepare('DELETE FROM terminals WHERE id = ?').run(id);
    return true;
  }
}

module.exports = new TerminalRepository();
