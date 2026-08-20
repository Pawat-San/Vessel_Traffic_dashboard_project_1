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
      .select('id', 'username', 'display_name', 'role', 'is_active', 'must_change_password', 'password_changed_at')
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
    return database.db.transaction(async (trx) => {
      await trx('users')
        .where('id', userId)
        .update({ password_hash: passwordHash, updated_at: trx.fn.now() });

      const latest = await trx('password_history')
        .select('id')
        .where('user_id', userId)
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .first();

      if (latest) {
        await trx('password_history').where('id', latest.id).update({ password_hash: passwordHash });
      } else {
        await trx('password_history').insert({
          user_id: userId,
          password_hash: passwordHash,
          created_at: new Date().toISOString(),
        });
      }
    });
  }
}

module.exports = new AuthRepository();
