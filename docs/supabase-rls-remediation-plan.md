# Supabase RLS Remediation Plan

## 1. Objective

Resolve the Supabase `RLS Enabled No Policy` findings without exposing backend-only application data through the Supabase Data API or interrupting the existing Express/Knex backend.

The remediation must:

- Keep all application tables inaccessible to Supabase `anon` and `authenticated` roles.
- Add explicit RLS policies so the intended denial is documented and the linter finding is resolved.
- Revoke unnecessary table, sequence, and future-object privileges from Data API roles.
- Preserve the current Express API while the immediate fix is deployed.
- Replace the backend's long-term use of the `postgres`/`BYPASSRLS` connection with dedicated least-privilege roles.
- Move Knex migration metadata and, optionally, all backend-only tables out of the exposed `public` schema in a later controlled phase.

Do not create broad `USING (true)` policies for `anon` or `authenticated`. This application does not use Supabase Auth or direct browser-to-database access, and broad policies would expose sensitive tables through the Data API.

---

## 2. Verified Current State

The production Supabase catalog was inspected read-only on 24 September 2026.

### 2.1 Tables

All ten application tables are in `public`, have RLS enabled, have `FORCE ROW LEVEL SECURITY` disabled, and have no policies:

1. `public.audit_logs`
2. `public.password_history`
3. `public.schema_migrations`
4. `public.schema_migrations_lock`
5. `public.terminals`
6. `public.user_activity_daily`
7. `public.user_activity_events`
8. `public.users`
9. `public.vessel_archive`
10. `public.vessels`

The live table is named `public.vessels`, not `public.vessel`.

### 2.2 Policies and Grants

- `pg_policies` contains no policies for these tables.
- `anon`, `authenticated`, and `service_role` currently have all table privileges, including `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `TRIGGER`, and `REFERENCES`.
- RLS with no policy currently denies rows to `anon` and `authenticated`, but the excessive grants remain in place.
- Adding a policy does not revoke an existing grant. Grants and policies must both be corrected.

### 2.3 Backend Connection

- The Express/Knex backend connects as `postgres`.
- The connection role has `BYPASSRLS`.
- The tables are owned by `postgres`.
- Consequently, the current backend bypasses every RLS policy. RLS protects the Data API roles but does not protect against compromise of the backend database credential.
- The frontend calls the Express API under `/api`; it does not query Supabase tables directly.

### 2.4 Why the Application Still Works

PostgreSQL applies deny-by-default behavior when RLS is enabled and no applicable policy exists. Table owners and roles with `BYPASSRLS`, including the current backend role, are not restricted by those policies. The current configuration therefore blocks Data API rows but still permits the backend.

The Supabase warning is valid because the access model is implicit, grants are overbroad, and a future accidental RLS disablement would expose the tables to roles that already hold broad privileges.

---

## 3. Target Access Model

| Principal | Intended access |
|---|---|
| `anon` | No access to application tables, sequences, or functions |
| `authenticated` | No direct database access; users authenticate through the Express API |
| `service_role` | No access if unused by this project; otherwise grant only explicitly documented server operations |
| `vessel_app` | Runtime operations required by the Express API; no DDL, ownership, `TRUNCATE`, `BYPASSRLS`, or role-management privileges |
| `vessel_migrator` | Schema migrations only; credential available only to the deployment migration job |
| Supabase `postgres` | Emergency/database administration only; never used by the running application |

The immediate release may continue using the existing backend credential temporarily to avoid an outage. The role separation in Phase 2 is required to complete the security hardening.

---

## 4. Priority Order

| Order | Priority | Work | Outcome |
|---:|---|---|---|
| 1 | P0 | Backup and baseline | Enables safe rollback and verifies the current application |
| 2 | P0 | Revoke Data API grants and add explicit deny policies | Resolves the warning without exposing data |
| 3 | P0 | Add default-privilege protection | Prevents future tables from reopening the issue |
| 4 | P1 | Introduce dedicated runtime and migration roles | Removes the application's `BYPASSRLS` credential |
| 5 | P1 | Separate migration execution from application startup | Allows strict least privilege at runtime |
| 6 | P2 | Move migration metadata to a private schema | Removes Knex internals from the Data API schema |
| 7 | P2 | Consider moving every backend-only table to a private schema | Provides the clearest long-term boundary |
| 8 | P1 | Add automated grant/RLS tests and monitoring | Prevents regression |

---

## 5. Phase 0 — Backup and Baseline

### Tasks

1. Create a Supabase database backup and verify the recovery procedure.
2. Record the current migration version and row counts for all ten tables.
3. Export the current table owners, grants, RLS flags, and policies from the PostgreSQL catalog.
4. Run the existing Jest suite and a PostgreSQL smoke test.
5. Verify that no frontend code uses a Supabase publishable/anon key or calls the Supabase Data API directly.
6. Confirm whether `service_role` is used by any external automation, Edge Function, report, or integration.
7. Schedule the grant migration during a low-traffic period even though the intended change should not interrupt the existing `postgres` backend.

### Exit Criteria

- A restorable backup exists.
- Every current database consumer has been identified.
- It is confirmed that application users access data only through Express.

---

## 6. Phase 1 — Immediate Data API Lockdown

Create a new additive PostgreSQL migration. Do not edit migrations that have already been applied.

Suggested migration name:

```text
20260924000001_lock_down_supabase_data_api.js
```

### 6.1 Revoke Existing Data API Grants

Revoke all privileges from `anon` and `authenticated` on every application table:

```sql
revoke all privileges on table
  public.audit_logs,
  public.password_history,
  public.schema_migrations,
  public.schema_migrations_lock,
  public.terminals,
  public.user_activity_daily,
  public.user_activity_events,
  public.users,
  public.vessel_archive,
  public.vessels
from anon, authenticated;
```

Also revoke access to application-owned sequences because integer identity/serial columns may otherwise remain callable:

```sql
revoke all privileges on all sequences in schema public
from anon, authenticated;
```

If the project does not use a Supabase secret/service key for these application tables, revoke the same privileges from `service_role`. This must be confirmed before deployment because `service_role` bypasses RLS and cannot be restricted by a policy alone.

### 6.2 Add Explicit Deny Policies

Create one clearly named deny policy on each table for the Data API roles:

```sql
drop policy if exists "deny_data_api_access" on public.users;

create policy "deny_data_api_access"
on public.users
for all
to anon, authenticated
using (false)
with check (false);
```

Apply the same policy to all ten tables. Generate table identifiers from a fixed allowlist inside the migration; never accept runtime/user input as a table name.

The explicit deny policy has two purposes:

- It records the deliberate backend-only design in the database.
- It resolves the `RLS Enabled No Policy` condition without granting row access.

The revoked grants remain the first access-control boundary. The deny policy is defense in depth and documentation.

### 6.3 Preserve RLS

Ensure RLS remains enabled on every table:

```sql
alter table public.users enable row level security;
```

Do not disable RLS to remove the warning. Do not add `USING (true)` policies for `anon` or `authenticated`.

### 6.4 Protect Future Objects

Change default privileges for objects created by the `postgres` role in `public`:

```sql
alter default privileges for role postgres in schema public
revoke all privileges on tables from anon, authenticated;

alter default privileges for role postgres in schema public
revoke all privileges on sequences from anon, authenticated;

alter default privileges for role postgres in schema public
revoke execute on functions from anon, authenticated;
```

If `service_role` is confirmed unused, include it in the corresponding default-privilege revocations.

Default privileges are specific to the role that creates future objects. Repeat the rule for any future migration-owner role introduced in Phase 2.

### 6.5 Migration Safety

- Apply the change only for PostgreSQL; SQLite has no RLS roles or policies.
- Use identifier bindings or a fixed internal table list.
- Keep the migration transactional.
- Make policy creation deterministic with `DROP POLICY IF EXISTS` followed by `CREATE POLICY`.
- The down migration must not restore broad `anon`/`authenticated` grants. A rollback that silently re-exposes data is unsafe. Either make `down` a documented no-op for grants or require an explicit manual recovery procedure.

### Exit Criteria

- Every flagged table has at least one explicit policy.
- `anon` and `authenticated` have no table or sequence privileges on application objects.
- Express login, vessel operations, account management, activity tracking, cleanup, and migrations still work.
- Supabase Security Advisor no longer reports `RLS Enabled No Policy` for these tables.

---

## 7. Phase 2 — Dedicated Least-Privilege Database Roles

The Phase 1 policy fixes the Data API boundary but the running backend still uses `postgres`, which bypasses RLS and owns the tables. Replace that credential.

### 7.1 Create Roles

Create two roles through a controlled administrative procedure:

```text
vessel_app       Runtime Express/Knex queries only
vessel_migrator  Migration and schema-change operations only
```

Requirements:

- `NOSUPERUSER`
- `NOCREATEDB`
- `NOCREATEROLE`
- `NOREPLICATION`
- `NOBYPASSRLS`
- Strong generated passwords stored only in the deployment secret manager
- No passwords committed to migrations, documentation, logs, or source control

### 7.2 Runtime Privilege Matrix

The exact matrix must be validated against repository methods before applying it.

| Table | Runtime privileges |
|---|---|
| `users` | `SELECT`, `INSERT`, `UPDATE`; no `DELETE` or `TRUNCATE` |
| `password_history` | `SELECT`, `INSERT`, `DELETE`; no `UPDATE` or `TRUNCATE` |
| `audit_logs` | `INSERT`; add `SELECT` only if an approved API actually reads it |
| `terminals` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |
| `vessels` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |
| `vessel_archive` | `SELECT`, `INSERT`, `DELETE`; grant `UPDATE` only if required |
| `user_activity_events` | `SELECT`, `INSERT`, `DELETE` for reporting and retention cleanup |
| `user_activity_daily` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` for aggregation and retention cleanup |
| `schema_migrations` | No runtime access |
| `schema_migrations_lock` | No runtime access |

Grant sequence `USAGE`/`SELECT` only for sequences used by runtime inserts. Never grant `TRUNCATE`, `TRIGGER`, ownership, or schema DDL to `vessel_app`.

### 7.3 Runtime RLS Policies

Because the backend performs application authorization and does not set a Supabase Auth identity in PostgreSQL, runtime policies may allow the dedicated backend role to access rows while table grants restrict operations:

```sql
create policy "vessel_app_runtime_access"
on public.vessels
for all
to vessel_app
using (true)
with check (true);
```

Create policies only for tables and operations the runtime requires. Never include `anon` or `authenticated` in these allow policies.

An alternative is moving backend tables to a non-exposed schema in Phase 4 and relying on grants there. The policy approach is the smaller intermediate change.

### 7.4 Remove `postgres` from Runtime

1. Add separate deployment secrets for runtime and migration database credentials.
2. Run migrations in a deployment/pre-start job with `vessel_migrator`.
3. Start the web application with `vessel_app` credentials.
4. Remove automatic `db.migrate.latest()` from normal web-process startup after the migration job is reliable.
5. Rotate the existing `postgres` database password after the application no longer depends on it.
6. Confirm that only database administrators retain the `postgres` credential.

### Required Tests

- Runtime startup succeeds with `vessel_app`.
- Runtime cannot create/drop tables, alter schemas, manage roles, truncate tables, or read migration metadata.
- Runtime can perform every approved Express API operation.
- Runtime is rejected from unapproved operations in the privilege matrix.
- `anon` and `authenticated` remain denied even when a table has a runtime allow policy.
- A migration succeeds with `vessel_migrator` and fails with `vessel_app`.

### Exit Criteria

- The running application no longer uses a table owner or `BYPASSRLS` role.

---

## 8. Phase 3 — Move Knex Metadata to a Private Schema

Knex migration metadata has no reason to exist in an exposed Data API schema.

### Target

```text
vessel_private.schema_migrations
vessel_private.schema_migrations_lock
```

### Tasks

1. Create a non-exposed schema such as `vessel_private`.
2. Revoke schema access from `PUBLIC`, `anon`, `authenticated`, and unused `service_role`.
3. Grant schema usage and required table privileges only to `vessel_migrator`.
4. Move both migration tables together during a maintenance window.
5. Configure Knex migrations with:

```js
{
  tableName: 'schema_migrations',
  schemaName: 'vessel_private',
}
```

6. Update both `src/database/knex.js` and the root `knexfile.js` consistently.
7. Verify `migrate:list`, `migrate:latest`, `migrate:rollback` in staging before production.

Moving migration metadata while Knex is actively executing a normal migration can cause lock/tracking problems. Treat this as a controlled administrative migration with the application stopped, then deploy the new Knex configuration immediately.

### Exit Criteria

- Supabase Data API cannot enumerate or access migration state.
- Knex reads the same completed migration history from the private schema.

---

## 9. Phase 4 — Optional Full Private-Schema Migration

Because every application table is backend-only, the clearest long-term design is to move all application data from `public` to a private, non-exposed schema such as `vessel_private`.

### Benefits

- Tables are outside the default Supabase Data API boundary.
- Accidental future grants in `public` cannot expose application data.
- Backend-only design is represented structurally rather than only through policies.
- Supabase security warnings for backend tables in `public` are reduced.

### Required Changes

1. Confirm `vessel_private` is not listed as an exposed Data API schema.
2. Move tables in a controlled transaction/maintenance window while preserving foreign keys and sequences.
3. Configure the dedicated roles' `search_path` to `vessel_private, public`, or use explicit Knex `.withSchema()` calls.
4. Update raw SQL that currently hardcodes `public`.
5. Ensure all new PostgreSQL migrations create objects in `vessel_private`.
6. Keep SQLite behavior unchanged through dialect-specific configuration.
7. Retest migrations, seeds, jobs, API routes, backups, and restore procedures.

This phase is optional for resolving the immediate warning. It should not be combined with Phase 1 in one production release because it changes object location, connection behavior, and migration tracking simultaneously.

---

## 10. Verification Plan

### 10.1 Catalog Checks

Verify the following after each deployment:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

```sql
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role', 'vessel_app')
order by table_name, grantee, privilege_type;
```

### 10.2 Denial Tests

Within a rollback-only test transaction or isolated test database:

- `SET LOCAL ROLE anon` cannot select, insert, update, delete, or truncate any application table.
- `SET LOCAL ROLE authenticated` has the same denial.
- A Supabase REST request using the publishable key cannot read table rows or mutate data.
- A policy must never expose `users.password_hash`, `users.refresh_token_hash`, or `password_history.password_hash`.
- Unused `service_role` access is denied through revoked grants.

### 10.3 Application Tests

- Login and refresh flows work.
- Vessel and terminal CRUD follows application RBAC.
- Superadmin Account Management works and remains hidden/forbidden for other roles.
- Password history and password reset work.
- Activity event insertion, daily upsert, reporting, heartbeat throttling, and cleanup work.
- Scheduled archive and retention jobs work.
- Knex can read and update migration state.
- PostgreSQL integration tests run in CI; SQLite-only coverage is insufficient for this change.

### 10.4 Security Advisor

Run Supabase Security Advisor again after the catalog and application tests pass. Treat the advisor as a final signal, not as the only verification. A green advisor does not replace explicit grant and denial tests.

---

## 11. Downtime and User Impact Assessment

### 11.1 Summary

The immediate `RLS Enabled No Policy` remediation does not require planned downtime when deployed exactly as Phase 1 describes. The existing Express backend connects directly as `postgres`, so revoking Data API grants and adding deny policies for `anon`/`authenticated` does not change the backend's current access path.

Completing every optional hardening phase, especially moving live tables to `vessel_private`, should include one short maintenance window unless an expand-and-contract schema migration is designed and rehearsed. The maintenance window is caused by the schema move and application configuration switch, not by RLS policy creation itself.

### 11.2 Impact Matrix

| Change | Planned downtime | User-visible impact | Main risk |
|---|---:|---|---|
| Backup and catalog baseline | None | None | Backup load may add minor database load |
| Revoke `anon`/`authenticated` grants | None for Express users | None | Any undiscovered client using a Supabase publishable key will stop working immediately |
| Add explicit deny policies | None | None | An incorrect table list or accidental allow policy could expose or block data |
| Change default privileges | None | None | Affects only objects created in the future |
| Revoke unused `service_role` grants | None for Express users | External automation using a secret/service key will fail | Undiscovered integrations |
| Create `vessel_app` and `vessel_migrator` | None | None | Incorrect grants are not visible until the new role is exercised |
| Switch the backend to `vessel_app` | Normally none with a verified health-gated deploy | A failed grant check can cause a rejected deploy or temporary API errors | Incomplete privilege matrix or weak readiness check |
| Separate migrations from web startup | None when the migration job is available and tested | None | The current Render free plan does not provide the paid pre-deploy command |
| Rotate the old `postgres` credential | None when done after all old instances drain | None | Rotating too early can break old instances or background jobs that reconnect |
| Move Knex metadata to `vessel_private` | Prefer a controlled 1–5 minute operational window | Usually none if the old app remains serving and no deploy starts concurrently | Migration-lock split or startup failure |
| Move all live application tables to `vessel_private` | Recommend a 5–15 minute maintenance window | API reads/writes temporarily unavailable; dashboard polling may show errors | Old instances query `public` while new tables have moved |

The time estimates are planning ranges, not guarantees. Rehearse the exact migration against a production-like PostgreSQL copy to measure lock and deployment time before announcing a window.

### 11.3 Expected User Effects

For Phase 1 only:

- Users remain logged in.
- Existing access and refresh tokens remain valid.
- Passwords, roles, and account state do not change.
- Vessel, terminal, archive, account-management, and activity features should continue normally.
- No frontend release is required solely for the policy/grant change.

For the dedicated-role release:

- Users should remain logged in because JWT secrets and account records are unchanged.
- The new application instance must pass login, dashboard, write, activity, cleanup, and migration checks before receiving traffic.
- Background cleanup jobs must be tested with the new role because they require `DELETE` privileges on retention tables.

For the full private-schema move:

- Existing sessions can remain valid after the service returns.
- Requests made during the maintenance window should receive a clear maintenance response rather than inconsistent `500` errors.
- Users performing edits or CSV imports must be warned to finish or pause before the window.
- Dashboard polling should retry after service restoration without duplicating writes.

### 11.4 Zero-Downtime Requirements

To keep Phases 1 and 2 at zero planned downtime:

1. Use additive and backward-compatible changes first.
2. Create policies, roles, and grants before changing application credentials.
3. Test the new runtime role against a staging database and every background job.
4. Keep the old production instance serving until the new instance proves database readiness.
5. Change `/api/health` from a static response to a bounded readiness check that executes a harmless database query.
6. Do not revoke or rotate the old `postgres` credential until the new deployment is healthy and all old instances have drained.
7. Keep migration SQL short and transactional; set bounded PostgreSQL `lock_timeout` and `statement_timeout` values for the migration session.
8. If a lock cannot be acquired quickly, abort and retry later rather than waiting while blocking application traffic.

Render normally starts the new web-service instance while the previous instance continues serving and switches traffic only after the new instance is healthy. This protection depends on an accurate health check. The current `/api/health` response claims that the database is connected without actually querying it, so it must be improved before relying on health-gated credential or schema changes.

### 11.5 Render Free-Plan Constraint

The current `render.yaml` declares `plan: free`. Render's pre-deploy command for database migrations is available only on paid web services, private services, and background workers. Choose one of these approaches before separating migration and runtime roles:

1. Upgrade to a plan that supports `preDeployCommand`, then run `npm run db:migrate` with `vessel_migrator` before the new instance starts.
2. Run a controlled one-off/manual migration from CI using the migrator credential, then deploy the runtime service.
3. Temporarily retain startup migrations for additive changes, but do not call this a completed least-privilege design because the runtime process still needs migration privileges.

Never embed the migrator password in `render.yaml`, the repository, build logs, or command arguments visible to users.

### 11.6 Conditions Requiring a Maintenance Window

Enable maintenance mode or otherwise stop application writes when any of the following is true:

- All live tables are moved between schemas.
- A migration requires a long `ACCESS EXCLUSIVE` lock.
- Old and new application versions cannot operate against the same intermediate schema.
- Migration metadata is moved while another instance may run `db.migrate.latest()`.
- Database credentials must be rotated before old instances can drain safely.
- Staging has not reproduced the production role, grants, pooler mode, and schema configuration.

### 11.7 Recommended Practical Rollout

Use two releases:

**Release A — No planned downtime**

- Back up and inventory integrations.
- Revoke `anon` and `authenticated` grants.
- Add explicit deny policies.
- Apply secure default privileges.
- Verify Express APIs and rerun Supabase Security Advisor.

**Release B — Least privilege, with rollback readiness**

- Create and test dedicated roles.
- Add a real database readiness check.
- Deploy the runtime credential using health-gated rollout.
- Drain old instances, then rotate the `postgres` credential.
- Move Knex metadata in a controlled operation.

Schedule the optional full private-schema move as a separate Release C with a 5–15 minute maintenance window. It is not required to clear the immediate Supabase warning.

---

## 12. Deployment Sequence

1. Back up Supabase and record the baseline catalog state.
2. Confirm `service_role` and direct Data API usage across all integrations.
3. Deploy the Phase 1 additive migration to staging.
4. Run catalog, role-denial, Express API, background-job, and migration tests.
5. Run Supabase Security Advisor in staging.
6. Deploy Phase 1 to production during a low-traffic window.
7. Monitor database permission errors, login failures, background jobs, and activity writes.
8. Create and test `vessel_app` and `vessel_migrator` in staging.
9. Separate migration execution from web startup.
10. Deploy dedicated roles, rotate the old backend credential, and monitor again.
11. Move Knex metadata and optionally all tables to `vessel_private` in separate later releases.

---

## 13. Rollback Strategy

- Do not disable RLS as a rollback shortcut.
- Do not automatically re-grant privileges to `anon` or `authenticated`.
- If the backend fails after Phase 1, verify that it is still connecting as the expected server role; Phase 1 is intended not to affect the existing `postgres` backend.
- If the dedicated runtime role lacks a required privilege, grant only that specific operation after confirming the repository call that requires it.
- Keep the old `postgres` credential available only for a time-bounded emergency rollback, then rotate it again.
- Back up policy and grant definitions before every role/schema migration.
- Treat a private-schema move as a separately reversible maintenance operation; do not combine it with unrelated application features.

---

## 14. Definition of Done

The Supabase RLS remediation is complete when:

1. Every application table has an explicit, reviewed RLS policy.
2. `anon` and `authenticated` hold no privileges on application tables or sequences.
3. Default privileges prevent future application objects from being granted to Data API roles automatically.
4. No policy grants direct browser access to password hashes, refresh-token hashes, audit logs, or user activity records.
5. Supabase Security Advisor no longer reports `RLS Enabled No Policy` for the listed tables.
6. PostgreSQL denial tests and the complete Express API test suite pass.
7. The running backend uses `vessel_app`, not `postgres`, table ownership, or a `BYPASSRLS` role.
8. Schema migrations run under a separate controlled role.
9. Knex migration metadata is stored in a private, non-exposed schema.
10. Database credentials are stored only in the deployment secret manager and have been rotated after the role migration.
11. Backup, recovery, monitoring, and rollback procedures have been tested and documented.
