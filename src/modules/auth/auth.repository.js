const database = require('../../database/knex');

class AuthRepository {
  /**
   * Find an active user by their username (includes password_hash for verification)
   * @param {string} username
   * @returns {Promise<object|undefined>} User record
   */
  async findByUsername(username) {
    return database.db('users').where({ username, is_active: 1 }).first();
  }

  /**
   * Find a user by their ID (safe columns only, no credentials)
   * @param {number} id
   * @returns {Promise<object|undefined>} User record (excluding sensitive credentials)
   */
  async findById(id) {
    return database.db('users')
      .select('id', 'username', 'display_name', 'role', 'is_active', 'must_change_password')
      .where('id', id)
      .first();
  }

  /**
   * Update the user's refresh token hash
   * @param {number} userId
   * @param {string|null} tokenHash
   */
  async updateRefreshToken(userId, tokenHash) {
    return database.db('users')
      .where('id', userId)
      .update({ refresh_token_hash: tokenHash, updated_at: database.db.fn.now() });
  }

  /**
   * Update a user's password hash (used for lazy bcrypt->argon2 rehash)
   * @param {number} userId
   * @param {string} passwordHash
   */
  async updatePasswordHash(userId, passwordHash) {
    return database.db('users')
      .where('id', userId)
      .update({ password_hash: passwordHash, updated_at: database.db.fn.now() });
  }
}

module.exports = new AuthRepository();
