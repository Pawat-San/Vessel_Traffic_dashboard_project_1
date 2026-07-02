const connection = require('../../database/connection');

class AuthRepository {
  /**
   * Find an active user by their username
   * @param {string} username 
   * @returns {object|undefined} User record
   */
  findByUsername(username) {
    return connection.db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
  }

  /**
   * Find a user by their ID
   * @param {number} id 
   * @returns {object|undefined} User record (excluding sensitive credentials)
   */
  findById(id) {
    return connection.db.prepare('SELECT id, username, display_name, role, is_active FROM users WHERE id = ?').get(id);
  }

  /**
   * Update the user's refresh token hash
   * @param {number} userId 
   * @param {string|null} tokenHash 
   */
  updateRefreshToken(userId, tokenHash) {
    return connection.db.prepare(`
      UPDATE users 
      SET refresh_token_hash = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(tokenHash, userId);
  }
}

module.exports = new AuthRepository();
