-- Run once as the database administrator after backing up grants/ownership.
-- This script does NOT set passwords or switch the running application's user.
-- Provision unique passwords through the provider or psql \password afterward.
-- Keep runtime and migration credentials in separate secret stores.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vessel_app') THEN
    CREATE ROLE vessel_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vessel_migrator') THEN
    CREATE ROLE vessel_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO vessel_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM vessel_app;
GRANT USAGE, CREATE ON SCHEMA public TO vessel_migrator;

DO $$
DECLARE
  app_table text;
  sequence_name text;
BEGIN
  FOREACH app_table IN ARRAY ARRAY[
    'users', 'password_history', 'audit_logs', 'terminals', 'vessels',
    'vessel_archive', 'user_activity_events', 'user_activity_daily',
    'security_rate_limits', 'schema_migrations', 'schema_migrations_lock'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM vessel_app', app_table);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', app_table);
    EXECUTE format('DROP POLICY IF EXISTS vessel_app_access ON public.%I', app_table);
    IF app_table IN ('schema_migrations', 'schema_migrations_lock') THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO vessel_app', app_table);
      EXECUTE format('CREATE POLICY vessel_app_access ON public.%I FOR SELECT TO vessel_app USING (true)', app_table);
    ELSE
      IF app_table = 'audit_logs' THEN
        EXECUTE format('GRANT SELECT, INSERT ON TABLE public.%I TO vessel_app', app_table);
      ELSIF app_table = 'users' THEN
        EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO vessel_app', app_table);
      ELSE
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO vessel_app', app_table);
      END IF;
      EXECUTE format('CREATE POLICY vessel_app_access ON public.%I FOR ALL TO vessel_app USING (true) WITH CHECK (true)', app_table);
    END IF;
    -- Transfer serial sequences together with their owning table.
    -- ALTER TABLE OWNER also transfers owned sequence ownership.
    EXECUTE format('ALTER TABLE public.%I OWNER TO vessel_migrator', app_table);
    FOR sequence_name IN
      SELECT pg_get_serial_sequence(format('public.%I', app_table), column_name)
      FROM information_schema.columns
      WHERE table_schema = 'public' AND information_schema.columns.table_name = app_table
    LOOP
      IF sequence_name IS NOT NULL AND app_table NOT IN ('schema_migrations', 'schema_migrations_lock') THEN
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO vessel_app', sequence_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Future tables need explicitly reviewed runtime grants and RLS policies.
ALTER DEFAULT PRIVILEGES FOR ROLE vessel_migrator IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE vessel_migrator IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE vessel_migrator IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE vessel_migrator IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE vessel_migrator IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE vessel_migrator IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
