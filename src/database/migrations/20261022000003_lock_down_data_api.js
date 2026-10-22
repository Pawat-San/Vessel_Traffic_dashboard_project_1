const TABLES = [
  'users', 'password_history', 'audit_logs', 'terminals', 'vessels',
  'vessel_archive', 'user_activity_events', 'user_activity_daily',
  'schema_migrations', 'schema_migrations_lock', 'security_rate_limits',
];

exports.up = async function (knex) {
  if (knex.client.config.client !== 'pg') return;
  const roles = await knex('pg_roles').select('rolname')
    .whereIn('rolname', ['anon', 'authenticated']);
  for (const table of TABLES) {
    await knex.raw('ALTER TABLE public.?? ENABLE ROW LEVEL SECURITY', [table]);
    await knex.raw('REVOKE ALL PRIVILEGES ON TABLE public.?? FROM PUBLIC', [table]);
    for (const { rolname } of roles) {
      await knex.raw('REVOKE ALL PRIVILEGES ON TABLE public.?? FROM ??', [table, rolname]);
    }
    if (roles.length) {
      const identifiers = roles.map(() => '??').join(', ');
      await knex.raw(`CREATE POLICY deny_data_api_access ON public.?? AS RESTRICTIVE
        FOR ALL TO ${identifiers} USING (false) WITH CHECK (false)`,
      [table, ...roles.map((role) => role.rolname)]);
    }
    // Only touch sequences owned by these application tables.
    const columns = await knex('information_schema.columns').select('column_name')
      .where({ table_schema: 'public', table_name: table });
    for (const { column_name: column } of columns) {
      const { rows } = await knex.raw('SELECT pg_get_serial_sequence(?, ?) AS name', [`public.${table}`, column]);
      if (!rows[0].name) continue;
      // pg_get_serial_sequence supplies a schema-qualified, quoted identifier.
      const sequenceName = rows[0].name;
      await knex.raw(`REVOKE ALL PRIVILEGES ON SEQUENCE ${sequenceName} FROM PUBLIC`);
      for (const { rolname } of roles) {
        await knex.raw(`REVOKE ALL PRIVILEGES ON SEQUENCE ${sequenceName} FROM ??`, [rolname]);
      }
    }
  }
  for (const role of ['public', ...roles.map(({ rolname }) => rolname)]) {
    // Applies to objects created by the migration connection role.
    const target = role === 'public' ? 'PUBLIC' : '??';
    const bindings = role === 'public' ? [] : [role];
    for (const objectType of ['TABLES', 'SEQUENCES', 'FUNCTIONS']) {
      await knex.raw(`ALTER DEFAULT PRIVILEGES IN SCHEMA public
        REVOKE ALL PRIVILEGES ON ${objectType} FROM ${target}`, bindings);
    }
  }
};

// Never reopen Data API grants as a side effect of an application rollback.
exports.down = async function () {};
