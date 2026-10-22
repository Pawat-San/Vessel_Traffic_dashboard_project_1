const database = require('../../database/knex');
const { AuthenticationError } = require('../../utils/errors');

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
   * Internal authentication state. Never serialize this row to an API response.
   * @param {number} id
   * @returns {Promise<object|undefined>} Account and hashed refresh state
   */
  async findById(id) {
    return database.db('users')
      .select('id', 'username', 'display_name', 'role', 'is_active', 'must_change_password', 'password_changed_at', 'session_version', 'refresh_token_hash')
      .where('id', id)
      .first();
  }

  /**
   * Update the user's refresh token hash
   * @param {number} userId
   * @param {string|null} tokenHash
   */
  async updateRefreshToken(userId, tokenHash, conn = database.db) {
    return conn('users')
      .where('id', userId)
      .update({ refresh_token_hash: tokenHash, updated_at: conn.fn.now() });
  }

  async revokeSessions(userId, conn = database.db, expectedVersion) {
    let query = conn('users').where('id', userId);
    if (expectedVersion !== undefined) query = query.where('session_version', expectedVersion);
    return query.update({
      session_version: conn.raw('?? + 1', ['session_version']),
      refresh_token_hash: null,
      updated_at: conn.fn.now(),
    });
  }

  async rotateRefreshToken(userId, sessionVersion, previousHash, nextHash) {
    return database.db('users').where({
      id: userId, is_active: 1, session_version: sessionVersion,
      refresh_token_hash: previousHash,
    }).update({ refresh_token_hash: nextHash, updated_at: database.db.fn.now() });
  }

  /**
   * Update a user's password hash (used for lazy bcrypt->argon2 rehash)
   * @param {number} userId
   * @param {string} passwordHash
   */
  async updatePasswordHash(userId, passwordHash, previousHash) {
    return database.db.transaction(async (trx) => {
      const updated = await trx('users')
        .where({ id: userId, password_hash: previousHash, is_active: 1 })
        .update({ password_hash: passwordHash, updated_at: trx.fn.now() });
      if (!updated) throw new AuthenticationError('Account changed during login. Please log in again.');

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
