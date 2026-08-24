const database = require('../../database/knex');

const ACTIVITY_USER_COLUMNS = [
  'id', 'username', 'display_name', 'role', 'is_active',
  'last_login_at', 'last_activity_at', 'login_count',
];

class UserActivityRepository {
  async insertEvent(event, conn = database.db) {
    const [row] = await conn('user_activity_events').insert(event).returning([
      'id', 'user_id', 'role', 'action', 'http_method', 'route_template',
      'response_status', 'ip_address', 'user_agent', 'target_user_id',
      'target_username_snapshot', 'target_display_name_snapshot', 'occurred_at',
    ]);
    return row;
  }

  async recordLogin(user, metadata, tokenHash, conn = database.db) {
    const occurredAt = metadata.occurred_at || new Date().toISOString();
    await conn('users').where('id', user.id).update({
      refresh_token_hash: tokenHash,
      last_login_at: occurredAt,
      last_activity_at: occurredAt,
      login_count: conn.raw('COALESCE(??, 0) + 1', ['login_count']),
      updated_at: conn.fn.now(),
    });
    return this.insertEvent({
      user_id: user.id,
      role: user.role,
      action: 'AUTH_LOGIN',
      http_method: 'POST',
      route_template: '/api/auth/login',
      response_status: 200,
      ip_address: metadata.ip_address || null,
      user_agent: metadata.user_agent || null,
      target_user_id: null,
      target_username_snapshot: null,
      target_display_name_snapshot: null,
      occurred_at: occurredAt,
    }, conn);
  }

  async recordActivity(user, metadata, conn = database.db) {
    const occurredAt = metadata.occurred_at || new Date().toISOString();
    await conn('users')
      .where('id', user.id)
      .where((query) => query.whereNull('last_activity_at').orWhere('last_activity_at', '<', occurredAt))
      .update({ last_activity_at: occurredAt });

    return this.insertEvent({
      user_id: user.id,
      role: user.role,
      action: metadata.action,
      http_method: metadata.http_method,
      route_template: metadata.route_template,
      response_status: metadata.response_status,
      ip_address: metadata.ip_address || null,
      user_agent: metadata.user_agent || null,
      target_user_id: metadata.target_user_id || null,
      target_username_snapshot: metadata.target_username_snapshot || null,
      target_display_name_snapshot: metadata.target_display_name_snapshot || null,
      occurred_at: occurredAt,
    }, conn);
  }

  async findUsersForSummary(conn = database.db) {
    return conn('users').select(ACTIVITY_USER_COLUMNS);
  }

  async findEventsAndCount(filters, pagination, conn = database.db) {
    const buildQuery = () => {
      let query = conn('user_activity_events as activity')
        .leftJoin('users as actor', 'actor.id', 'activity.user_id')
        .leftJoin('users as target', 'target.id', 'activity.target_user_id');
      if (filters.userId) query = query.where('activity.user_id', filters.userId);
      if (filters.targetUserId) query = query.where('activity.target_user_id', filters.targetUserId);
      if (filters.role) query = query.where('activity.role', filters.role);
      if (filters.action) query = query.where('activity.action', filters.action);
      if (filters.startDate) query = query.where('activity.occurred_at', '>=', filters.startDate);
      if (filters.endDate) query = query.where('activity.occurred_at', '<=', filters.endDate);
      return query;
    };

    const countRow = await buildQuery().count({ total: 'activity.id' }).first();
    const data = await buildQuery()
      .select(
        'activity.id', 'activity.user_id',
        { username: 'actor.username', display_name: 'actor.display_name' },
        'activity.role', 'activity.action', 'activity.http_method',
        'activity.route_template', 'activity.response_status', 'activity.ip_address',
        'activity.user_agent', 'activity.target_user_id',
        'activity.target_username_snapshot', 'activity.target_display_name_snapshot',
        { target_username_current: 'target.username', target_display_name_current: 'target.display_name' },
        'activity.occurred_at'
      )
      .orderBy('activity.occurred_at', 'desc')
      .orderBy('activity.id', 'desc')
      .limit(pagination.limit)
      .offset(pagination.offset);

    return { totalCount: Number(countRow.total), data };
  }

  async purgeOlderThan(cutoff, conn = database.db) {
    return conn('user_activity_events').where('occurred_at', '<', cutoff).del();
  }
}

module.exports = new UserActivityRepository();
