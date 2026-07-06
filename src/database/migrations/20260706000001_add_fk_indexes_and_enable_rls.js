/**
 * Adds covering indexes for foreign key columns (Postgres doesn't create
 * these automatically the way some other engines do), and enables Row Level
 * Security on every public table when running against Postgres.
 *
 * RLS is enabled with NO policies attached. This is deliberate: our app
 * never uses Supabase's PostgREST/anon API -- it connects directly as the
 * table-owning role, and Postgres always lets the owning role (and any
 * superuser) bypass RLS regardless of whether policies exist. Enabling RLS
 * with no policies simply blocks PostgREST's anon/authenticated roles from
 * reading these tables via Supabase's public REST endpoint, which is
 * otherwise exposed by default for every table in `public`.
 *
 * RLS has no SQLite equivalent, so that half is skipped entirely on the
 * sqlite client (local dev / test).
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('vessels', (table) => {
    table.index('terminal_id', 'idx_vessels_terminal_id');
    table.index('updated_by', 'idx_vessels_updated_by');
  });

  await knex.schema.alterTable('audit_logs', (table) => {
    table.index('user_id', 'idx_audit_logs_user_id');
  });

  if (knex.client.config.client === 'pg') {
    const tables = [
      'users', 'terminals', 'vessels', 'vessel_archive', 'audit_logs',
      'schema_migrations', 'schema_migrations_lock',
    ];
    for (const table of tables) {
      await knex.raw(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY`);
    }
  }
};

exports.down = async function down(knex) {
  if (knex.client.config.client === 'pg') {
    const tables = [
      'users', 'terminals', 'vessels', 'vessel_archive', 'audit_logs',
      'schema_migrations', 'schema_migrations_lock',
    ];
    for (const table of tables) {
      await knex.raw(`ALTER TABLE public."${table}" DISABLE ROW LEVEL SECURITY`);
    }
  }

  await knex.schema.alterTable('audit_logs', (table) => {
    table.dropIndex('user_id', 'idx_audit_logs_user_id');
  });

  await knex.schema.alterTable('vessels', (table) => {
    table.dropIndex('updated_by', 'idx_vessels_updated_by');
    table.dropIndex('terminal_id', 'idx_vessels_terminal_id');
  });
};
