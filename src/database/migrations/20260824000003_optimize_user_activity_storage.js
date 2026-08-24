/**
 * Adds state used to coalesce dashboard polling into heartbeats and a compact
 * daily rollup for long-term usage reporting without retaining every raw row.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.timestamp('last_activity_heartbeat_at').nullable();
    table.string('last_user_agent_hash', 64).nullable();
  });

  await knex.schema.createTable('user_activity_daily', (table) => {
    table.increments('id').primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.date('activity_date').notNullable();
    table.string('role', 32).notNullable();
    table.integer('request_count').notNullable().defaultTo(1);
    table.timestamp('first_activity_at').notNullable();
    table.timestamp('last_activity_at').notNullable();
    table.unique(['user_id', 'activity_date'], { indexName: 'uq_activity_daily_user_date' });
    table.index('activity_date', 'idx_activity_daily_date');
    table.index(['role', 'activity_date'], 'idx_activity_daily_role_date');
  });

  if (knex.client.config.client === 'pg') {
    await knex.raw('ALTER TABLE public."user_activity_daily" ENABLE ROW LEVEL SECURITY');
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('user_activity_daily');
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('last_user_agent_hash');
    table.dropColumn('last_activity_heartbeat_at');
  });
};
