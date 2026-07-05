/**
 * Initial schema (Knex). Enum-like columns (role/status/type) are plain
 * strings validated by Zod at the API boundary rather than DB CHECK
 * constraints, so the schema is identical across SQLite and Postgres.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('username').notNullable().unique();
    table.text('password_hash').notNullable();
    table.string('display_name').notNullable();
    table.string('role').notNullable().defaultTo('operator');
    table.text('refresh_token_hash');
    table.boolean('must_change_password').notNullable().defaultTo(false);
    table.integer('is_active').notNullable().defaultTo(1);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.index('username', 'idx_users_username');
    table.index('role', 'idx_users_role');
  });

  await knex.schema.createTable('terminals', (table) => {
    table.increments('id').primary();
    table.string('code').notNullable().unique();
    table.string('name');
    table.string('group_name');
    table.integer('sort_order');
    table.integer('is_active').notNullable().defaultTo(1);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('vessels', (table) => {
    table.increments('id').primary();
    table.string('vessel_name').notNullable();
    table.string('voy');
    table.string('type');
    table.integer('terminal_id').references('id').inTable('terminals').onDelete('RESTRICT');
    table.string('activity');
    table.string('eta');
    table.string('etb');
    table.string('etd');
    table.string('atd');
    table.string('status');
    table.string('next_port');
    table.string('remark');
    table.integer('updated_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('date_modify').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index(['status', 'terminal_id'], 'idx_vessels_status_terminal');
    table.index('eta', 'idx_vessels_eta');
    table.index('atd', 'idx_vessels_atd');
    table.index('vessel_name', 'idx_vessels_name');
  });

  await knex.schema.createTable('vessel_archive', (table) => {
    table.integer('id').primary();
    table.string('vessel_name');
    table.string('voy');
    table.string('type');
    table.string('terminal_code');
    table.string('activity');
    table.string('eta');
    table.string('etb');
    table.string('etd');
    table.string('atd');
    table.string('status');
    table.string('next_port');
    table.string('remark');
    table.string('updated_by_name');
    table.timestamp('date_modify');
    table.timestamp('created_at');
    table.timestamp('archived_at').defaultTo(knex.fn.now());
    table.index('archived_at', 'idx_archive_archived_at');
  });

  await knex.schema.createTable('audit_logs', (table) => {
    table.increments('id').primary();
    table.string('action');
    table.string('entity_type');
    table.integer('entity_id');
    table.text('changes');
    table.integer('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('ip_address');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index(['entity_type', 'entity_id'], 'idx_audit_entity');
    table.index('created_at', 'idx_audit_created');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('vessel_archive');
  await knex.schema.dropTableIfExists('vessels');
  await knex.schema.dropTableIfExists('terminals');
  await knex.schema.dropTableIfExists('users');
};
