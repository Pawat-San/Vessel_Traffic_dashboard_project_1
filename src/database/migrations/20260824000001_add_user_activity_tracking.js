/**
 * Adds per-user activity summary fields and a safe, append-only activity log.
 * Existing accounts intentionally remain NULL/0 because usage before this
 * migration cannot be reconstructed reliably.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.timestamp('last_login_at').nullable();
    table.timestamp('last_activity_at').nullable();
    table.integer('login_count').notNullable().defaultTo(0);
    table.index('last_login_at', 'idx_users_last_login');
    table.index('last_activity_at', 'idx_users_last_activity');
    table.index(['role', 'last_activity_at'], 'idx_users_role_last_activity');
    table.index(['is_active', 'last_activity_at'], 'idx_users_active_last_activity');
  });

  await knex.schema.createTable('user_activity_events', (table) => {
    table.increments('id').primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('role', 32).notNullable();
    table.string('action', 120).notNullable();
    table.string('http_method', 12).notNullable();
    table.string('route_template', 255).notNullable();
    table.integer('response_status').notNullable();
    table.string('ip_address', 255).nullable();
    table.text('user_agent').nullable();
    table.timestamp('occurred_at').notNullable();
    table.index(['user_id', 'occurred_at'], 'idx_activity_user_occurred');
    table.index(['role', 'occurred_at'], 'idx_activity_role_occurred');
    table.index(['action', 'occurred_at'], 'idx_activity_action_occurred');
    table.index('occurred_at', 'idx_activity_occurred');
  });

  if (knex.client.config.client === 'pg') {
    await knex.raw('ALTER TABLE public."user_activity_events" ENABLE ROW LEVEL SECURITY');
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('user_activity_events');
  await knex.schema.alterTable('users', (table) => {
    table.dropIndex(['is_active', 'last_activity_at'], 'idx_users_active_last_activity');
    table.dropIndex(['role', 'last_activity_at'], 'idx_users_role_last_activity');
    table.dropIndex('last_activity_at', 'idx_users_last_activity');
    table.dropIndex('last_login_at', 'idx_users_last_login');
    table.dropColumn('login_count');
    table.dropColumn('last_activity_at');
    table.dropColumn('last_login_at');
  });
};
