const database = require('../../database/knex');

const SAFE_USER_COLUMNS = [
  'id', 'username', 'display_name', 'role', 'is_active', 'must_change_password',
  'created_at', 'updated_at',
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
   * Atomically update password-related account state. The caller supplies the
   * surrounding transaction that also writes history and audit data.
   */
  async setPasswordSecurityState(id, data, conn = database.db) {
    await conn('users').where('id', id).update({
      password_hash: data.password_hash,
      password_changed_at: data.password_changed_at,
      must_change_password: data.must_change_password ? 1 : 0,
      refresh_token_hash: null,
      updated_at: conn.fn.now(),
    });
  }

  async findRecentPasswordHashes(userId, limit = 5, conn = database.db) {
    return conn('password_history')
      .select('id', 'password_hash', 'created_at')
      .where('user_id', userId)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit);
  }

  async insertPasswordHistory(userId, passwordHash, conn = database.db) {
    const [row] = await conn('password_history').insert({
      user_id: userId,
      password_hash: passwordHash,
      // Use one timestamp format across SQLite and Postgres so lexical order
      // remains chronological in both clients.
      created_at: new Date().toISOString(),
    }).returning(['id', 'user_id', 'created_at']);
    return row;
  }

  async prunePasswordHistory(userId, limit = 5, conn = database.db) {
    const retained = await conn('password_history')
      .select('id')
      .where('user_id', userId)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit);

    const retainedIds = retained.map((row) => row.id);
    if (retainedIds.length === 0) return 0;

    return conn('password_history')
      .where('user_id', userId)
      .whereNotIn('id', retainedIds)
      .del();
  }

  /**
   * Fetch the internal record (including password_hash) for self-service password
   * verification. Never expose this method's result to a controller response.
   */
  async findCredentialsById(id, conn = database.db) {
    return conn('users')
      .select('id', 'password_hash', 'must_change_password', 'password_changed_at')
      .where('id', id)
      .first();
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
