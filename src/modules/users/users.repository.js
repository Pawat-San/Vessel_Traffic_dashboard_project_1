const database = require('../../database/knex');

const SAFE_USER_COLUMNS = [
  'id', 'username', 'display_name', 'role', 'is_active', 'must_change_password', 'created_at', 'updated_at',
];

class UsersRepository {
  /**
   * List users with pagination and optional role filter (never selects password_hash/refresh_token_hash)
   */
  async findAndCount(filters = {}, pagination = { limit: 20, offset: 0 }) {
    const buildQuery = () => {
      let query = database.db('users');
      if (filters.role) {
        query = query.where('role', filters.role);
      }
      return query;
    };

    const { total } = await buildQuery().count({ total: '*' }).first();

    const data = await buildQuery()
      .select(SAFE_USER_COLUMNS)
      .orderBy('created_at', 'desc')
      .limit(pagination.limit)
      .offset(pagination.offset);

    return { totalCount: Number(total), data };
  }

  /**
   * Find a user by ID (safe columns only)
   */
  async findById(id, conn = database.db) {
    return conn('users').select(SAFE_USER_COLUMNS).where('id', id).first();
  }

  /**
   * Find a user by username (safe columns only)
   */
  async findByUsername(username, conn = database.db) {
    return conn('users').select(SAFE_USER_COLUMNS).where('username', username).first();
  }

  /**
   * Count active superadmins (used to prevent removing the last one)
   */
  async countActiveSuperadmins(conn = database.db) {
    const { total } = await conn('users')
      .where({ role: 'superadmin', is_active: 1 })
      .count({ total: '*' })
      .first();
    return Number(total);
  }

  /**
   * Create a new user account
   */
  async create(data, conn = database.db) {
    const [row] = await conn('users').insert(data).returning(SAFE_USER_COLUMNS);
    return row;
  }

  /**
   * Update a user's profile fields (display_name/role/is_active)
   */
  async update(id, data, conn = database.db) {
    const updateData = { ...data };
    if (typeof updateData.is_active === 'boolean') {
      // is_active is an integer column; Postgres has no implicit bool->integer cast.
      updateData.is_active = updateData.is_active ? 1 : 0;
    }
    await conn('users').where('id', id).update({ ...updateData, updated_at: conn.fn.now() });
    return this.findById(id, conn);
  }

  /**
   * Set a new password hash and force a password change on next login,
   * also revoking any existing session (refresh token).
   */
  async setPasswordAndForceChange(id, passwordHash, conn = database.db) {
    await conn('users').where('id', id).update({
      password_hash: passwordHash,
      must_change_password: true,
      refresh_token_hash: null,
      updated_at: conn.fn.now(),
    });
  }

  /**
   * Set a new password hash as part of a (voluntary or forced) self-service change.
   */
  async setOwnPassword(id, passwordHash, conn = database.db) {
    await conn('users').where('id', id).update({
      password_hash: passwordHash,
      must_change_password: false,
      updated_at: conn.fn.now(),
    });
  }

  /**
   * Fetch the internal record (including password_hash) for self-service password
   * verification. Never expose this method's result to a controller response.
   */
  async findCredentialsById(id, conn = database.db) {
    return conn('users').select('id', 'password_hash', 'must_change_password').where('id', id).first();
  }

  /**
   * Write an audit log entry (reuses the shared audit_logs table)
   */
  async createAuditLog(logEntry, conn = database.db) {
    const changesStr = typeof logEntry.changes === 'object'
      ? JSON.stringify(logEntry.changes)
      : logEntry.changes;

    await conn('audit_logs').insert({
      action: logEntry.action,
      entity_type: logEntry.entity_type,
      entity_id: logEntry.entity_id,
      changes: changesStr || null,
      user_id: logEntry.user_id,
      ip_address: logEntry.ip_address || null,
    });
  }
}

module.exports = new UsersRepository();
