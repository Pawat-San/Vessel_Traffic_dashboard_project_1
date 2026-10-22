# Security Hardening: Implementation and Rollout

Date: 2026-10-22

## Implemented in this working tree

- Node 24.22.1 configured for the project, Render, CI, and Docker; the Docker image is pinned by digest. GitHub Actions use pinned v6 revisions.
- Updated compatible production dependencies, replaced `yamljs` with `yaml`, and refreshed vulnerable transitive dependencies. Production dependency audit reports zero vulnerabilities.
- Updated Jest to 30.5.2 and replaced Nodemon with the native `node --watch` command. Full dependency audit still reports 19 Moderate development-only findings through Istanbul's YAML configuration loader; none ship with `npm ci --omit=dev`. Do not run `npm audit fix --force` or downgrade Jest to an obsolete version to hide this chain.
- Access tokens expire in 15 minutes. Typed JWTs validate algorithm, issuer, audience, user ID, and account session version.
- Every protected request checks current account activity, role, password requirements, and session version in the database.
- Password reset/change, deactivation, role changes, logout, and a new login invalidate previous account sessions. The existing single-account-session design is retained: logging in on another device invalidates the previous device.
- Forced-change login returns only a ten-minute password-change token. It permits exactly password change and logout. No refresh credential is issued until normal login after changing the password.
- Refresh credentials are stored in HttpOnly, SameSite=Strict cookies, with Secure enabled in production. Access tokens and user state live in browser memory. Legacy localStorage credentials are removed.
- Refresh tokens rotate atomically; replay invalidates their account token family. Rotation preserves the original seven-day expiry. Browser refreshes are serialized within a page and across tabs using Web Locks where supported.
- The login page handles expired/reset passwords, including the live password checklist and confirmation. Reloading during this step requires login again; the limited token is deliberately not persisted.
- Login/refresh endpoints reject cross-origin browser requests. Password expiry during an existing session redirects to login to obtain a limited change token.
- Rate limits use atomic shared database counters with indexed expiry and one-minute cleanup, rather than process-local Maps. Five invalid credential attempts per account and 100 per IP are allowed in a fixed 15-minute window. Successes and HTTP 500/503 failures release their reservations. Different accounts sharing an office IP do not share the five-attempt account limit.
- Refresh and password-change endpoints have separate counters. General API traffic defaults to 1,000 requests per IP per 15 minutes; an existing `RATE_LIMIT_MAX` setting still takes precedence. Rate-store failure returns 503 rather than bypassing protection. Health checks bypass the traffic limiter and perform a real database readiness query.
- Manual archive purge is Superadmin-only, validates integer retention from 1 to 3,650 days, and writes deletion and audit data in one transaction. Scheduled retention remains 90 days.
- CSP disallows inline scripts; the inline login handler was moved into external JavaScript. Inline styles remain allowed pending a separate CSS cleanup.
- Swagger is disabled in production. Health output is minimal. Client request IDs are length/format bounded, with UUID replacement for invalid IDs.
- Production startup no longer runs migrations or seeds by default. Pending migrations cause a clear startup failure. The runtime database user does not need DDL rights.
- Database TLS verifies the peer by default and supports a trusted CA file through `DB_SSL_CA_FILE`. The explicit `DB_SSL_VERIFY=false` compatibility override logs a warning; it does not fix certificate trust.

## Database changes

Apply these additive migrations with deployment credentials, in their filename order:

1. `20261022000001_add_session_version.js`: adds `users.session_version` with default 1.
2. `20261022000002_add_security_rate_limits.js`: adds expiring hashed rate-limit counters.
3. `20261022000003_lock_down_data_api.js`: preserves RLS, revokes table/owned-sequence privileges from PUBLIC, anon, and authenticated, adds restrictive deny policies, and locks down default privileges for objects created by the migration role. PostgreSQL-specific changes are skipped on SQLite.

The lockdown migration deliberately does not restore broad grants in its down operation. Application rollback must not reopen the Data API. The original ten tables plus the new rate-limit table are protected.

`scripts/security/database-roles.sql` is a separate DBA-reviewed step. It prepares restricted `vessel_app` and `vessel_migrator` login roles without passwords, transfers application-table ownership to the migrator, grants explicit runtime operations, and creates runtime policies. It does not change the running application connection. Set unique credentials using the provider's secure facilities or interactive `psql \password`; never commit passwords.

Service-role privileges are not revoked automatically: first confirm whether external integrations, Edge Functions, or reporting jobs use them. Moving application tables or migration metadata into a private schema remains a later migration, after identifying external consumers.

## Verification performed

The original baseline was 157 tests across 17 suites. The expanded regression suite covers immediate session revocation, pre-reset token rejection, one-time forced password changes, refresh replay/concurrency, fixed refresh expiry, browser refresh queue failures, memory-only credentials, rate-limit atomicity/expiry, exclusion of HTTP 500 failures from login lockout, archive safety, transactional audit rollback, CSP, and request IDs.

SQLite and an isolated local PostgreSQL 18 cluster are used for verification. PostgreSQL additionally verifies that a permissive Data API policy cannot bypass the restrictive deny policy, and exercises login, password change, readiness, migration inspection, and rate limiting under `vessel_app`. It confirms that this role cannot create tables, TRUNCATE users, or delete audit logs. CI now tests both SQLite and PostgreSQL 17.

Recorded results: SQLite 179/179 tests; PostgreSQL 181/181 tests; 21 passing suites on each backend; ESLint zero errors and zero warnings; production npm audit zero vulnerabilities. Browser-session unit tests use an isolated JavaScript context, including the complete forced-change login flow; a staging browser smoke test remains a release gate.

The local validation runtime is a portable Node 24.22.1 download verified against the official SHA-256 checksum. The machine-wide Node installation was not replaced; its existing default is still 24.13.0. Install/switch the workstation's default to 24.22.1 before running the project from a fresh terminal. The verified portable binary is under `%LOCALAPPDATA%/vessel-dashboard-runtime/node-v24.22.1-win-x64/`.

Docker manifest/digest resolution was verified. A full local Docker build requires Docker Desktop's daemon, which was not running during this work; CI includes the build check.

## Production release gates

No production database migration, ownership transfer, credential change, or deployment has been performed by this implementation.

1. Back up production and export current object owners, grants, policies, migration versions, and current Render environment settings. Verify the restore procedure.
2. Download the database CA certificate from Supabase Dashboard > Database Settings > SSL Configuration. Mount it as a Render secret file and set `DB_SSL_CA_FILE` to that path, with `DB_SSL=true` and `DB_SSL_VERIFY=true`.
3. Verify the certificate and hostname against the actual deployment connection before deployment. A read-only local probe against the configured database returned `SELF_SIGNED_CERT_IN_CHAIN` with default system CAs. Enabling verification without provisioning the Supabase CA will prevent connectivity; this is a release blocker. Do not trust a certificate copied from an unverified live connection.
4. Confirm JWT, refresh, and cookie secrets are correctly configured, and retain the current secrets for the staged rollout. Check whether Render has an existing `NODE_VERSION` setting that overrides repository configuration; set it explicitly to 24.22.1 and verify the deploy log.
5. Inventory Data API and service-key consumers. Stage the new migrations against a restored, isolated PostgreSQL database. Never point the destructive test helper at production.
6. Run `npm ci`, `npm run lint`, `npm test`, and `npm audit --omit=dev --audit-level=high` using Node 24.22.1. Complete a staging browser smoke test for normal login, forced password change, page reload, multiple tabs, logout, account-management permissions, and password expiry.
7. Apply `npm run db:deploy` with the migration/deployment database credential. This command runs migrations only. Do not run the existing blanket `db:seed` command on a populated database: the terminal seed deletes/recreates terminal data.
8. Deploy the application with `RUN_MIGRATIONS_ON_STARTUP=false`. Initially retain the existing backend database role to keep the application release and the database credential cutover independently recoverable.
9. Announce that all existing sessions must log in again. Existing token formats and browser credential storage are intentionally invalidated. Coordinate routing cutover because old and new token protocols are incompatible during mixed-version traffic.
10. Verify the real readiness endpoint, login/reset/change/deactivation/role-change flows, audit events, activity metrics, 401/403/429/500 rates, database locks, pool usage, and request latency. Shared database counters add writes; measure the impact under the expected office polling load before approving wider rollout.
11. In a separate low-traffic change, review and run `database-roles.sql` with the administrator, provision role passwords, and test `vessel_app` from staging. Change Render's runtime `DB_USER`/`DB_PASSWORD` to the runtime role. Keep `vessel_migrator` credentials only in the migration job. The native free Render service may require a separately executed migration command because pre-deploy facilities vary by plan.
12. Recheck Supabase's advisor, grants, policies, and startup logs. Revoke unused `service_role` privileges only after the external-consumer inventory is complete.

## User impact and rollback

No schema data rewrite or password reset is required by the new session-version column. Additive migrations normally need only short database locks, but zero downtime is not guaranteed for a runtime upgrade, credential cutover, or a mixed-version authentication deployment. Schedule a low-traffic release and notify users about re-login.

If a rollout fails, keep the new additive columns/tables and Data API denials. Restore the last application release and its matching environment configuration, then require login again. Do not disable RLS or restore public grants. Keep database-role cutover separate: an old release that still runs migrations at startup cannot start with the restricted runtime role. Rehearse that rollback before the credential switch.

## References

- Node security release: https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- Render runtime selection: https://render.com/docs/node-version
- Supabase TLS verification and CA download: https://supabase.com/docs/guides/platform/ssl-enforcement
- Supabase row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security
