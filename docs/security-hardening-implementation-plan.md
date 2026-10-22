# Security Hardening Implementation Plan

Implementation update (2026-10-22): see [Security Hardening Rollout](security-hardening-rollout.md) for implemented controls, verification results, remaining deployment gates, and the new Supabase CA requirement. Production changes and credential cutover have not been executed.

## 1. Objective

Harden the Vessel Dashboard against account takeover, stale authorization, destructive input, token theft, brute-force abuse, dependency vulnerabilities, and browser-based attacks.

This plan is ordered by exploit impact and implementation dependency. Session invalidation and authorization freshness must be completed before browser token-storage changes, rate-limiter infrastructure, or lower-risk hardening.

The plan covers:

- Immediate invalidation of sessions after account deactivation, role changes, password reset, or password change.
- A safe forced-password-change flow that cannot be completed with a stolen pre-reset access token.
- Short-lived access tokens and rotated refresh tokens stored in secure cookies.
- Validation and authorization for destructive maintenance operations.
- Distributed and bounded rate limiting.
- Dependency and container supply-chain controls.
- A strict Content Security Policy and reduced public information exposure.
- Automated security regression tests on both SQLite and PostgreSQL.

---

## 2. Confirmed Findings

| Priority | Finding | Impact |
|---|---|---|
| P0 | Access tokens trust the role and account state embedded at login | Deactivated or demoted users can retain access and old privileges for up to 8 hours |
| P0 | Password reset clears the refresh token but does not invalidate existing access tokens | A stolen pre-reset token can potentially complete the forced-password-change flow and take over the account |
| P1 | Refresh tokens are stored in `localStorage` | Any successful XSS can steal a reusable 7-day credential |
| P1 | Archive purge accepts unbounded, zero, negative, and invalid retention values | An authorized or compromised Admin can accidentally or deliberately purge the complete archive |
| P1 | API and login limits are stored in process-local `Map` objects | Limits reset on restart, are inconsistent across instances, can lock a shared office IP, and retain stale keys |
| P1 | Refresh tokens are not rotated after use | A stolen refresh token remains replayable until expiry, logout, or another login replaces it |
| P1 | Production dependencies have known DoS advisories | Malformed inputs or vulnerable transitive behavior may affect availability; fixes are available |
| P2 | CSP permits inline scripts and styles | Browser protection against injected inline code is weakened |
| P2 | Swagger and detailed health information are public in production | Unauthenticated users receive unnecessary application and API reconnaissance information |
| P2 | Client-supplied request IDs are accepted without format or length validation | Logs and response metadata accept unnecessary untrusted identifiers |

### Existing Controls That Must Be Preserved

- Password hashing uses Argon2id, with legacy bcrypt migration on successful login.
- Password strength, 90-day expiry, and five-password history are enforced by the backend.
- Account Management and user-activity reporting are restricted to `superadmin`.
- Knex parameter binding and sort-field allowlists protect current database queries from SQL injection.
- User-controlled values rendered through `innerHTML` are escaped by the frontend helper.
- Production startup rejects missing or known fallback JWT and cookie secrets.
- Password and refresh-token hashes are not returned through user APIs.

---

## 3. Target Security Model

### 3.1 Authentication Tokens

| Token | Target lifetime | Storage | Revocation behavior |
|---|---:|---|---|
| Access token | 15 minutes | JavaScript memory only | Rejected immediately when the account session version changes |
| Refresh token | 7 days maximum | `HttpOnly`, `Secure`, `SameSite=Strict` cookie | Rotated after every successful refresh and revoked on reuse, logout, password change, reset, deactivation, or role change |
| Forced-change access token | 10 minutes maximum | JavaScript memory only | Limited to password change and logout; valid only after authenticating with the temporary password |

### 3.2 Authorization Source of Truth

The database is the source of truth for:

- `is_active`
- Current role
- `session_version`
- `must_change_password`
- `password_changed_at`

JWT claims are hints, not permanent authorization facts. Every protected request must verify the current account state before authorization is evaluated.

### 3.3 Session Invalidation Events

Increment `users.session_version` atomically when any of the following succeeds:

- Password reset by a Superadmin
- Voluntary or forced self-service password change
- Account deactivation
- Role change
- Explicit “sign out all sessions” operation
- Security recovery performed by an operator or database administrator

Display-name-only changes do not require session invalidation.

---

## 4. Priority and Dependency Order

| Order | Priority | Workstream | Dependency |
|---:|---|---|---|
| 1 | P0 | Baseline, backup, and PostgreSQL test environment | None |
| 2 | P0 | Server-side session versioning and fresh authorization | Database migration |
| 3 | P0 | Safe forced-password-change and password-reset flow | Session versioning |
| 4 | P1 | Refresh-token cookie storage and rotation | Stable session invalidation |
| 5 | P1 | Destructive endpoint validation and authorization | None; may run after P0 to reduce release risk |
| 6 | P1 | Distributed rate limiting and abuse protection | Redis or equivalent shared store |
| 7 | P1 | Dependency and supply-chain remediation | Test baseline |
| 8 | P2 | CSP, Swagger, health, logging, and browser hardening | Cookie authentication flow |
| 9 | P2 | Security monitoring, documentation, and rollout | All preceding phases |

---

## 5. Implementation Phases

## Phase 0 — Baseline, Backup, and Test Infrastructure

### Tasks

1. Back up the production PostgreSQL database and verify that the backup can be restored.
2. Record the current migration version, active-user count, role counts, and active Superadmin count.
3. Run and record the existing Jest and ESLint baseline.
4. Add a PostgreSQL integration-test job. SQLite remains useful for fast tests, but it cannot be the only database used by CI.
5. Use an isolated PostgreSQL database or schema for tests. Never run destructive integration tests against production.
6. Add test helpers for issuing tokens, changing roles, deactivating accounts, advancing token versions, and inspecting refresh-token state without exposing tokens in output.
7. Add `npm audit --omit=dev` to the security check, initially as a reporting step until the known advisories are resolved.

### Exit Criteria

- A restorable backup exists.
- SQLite and PostgreSQL test jobs both run in CI.
- Existing behavior is captured before authentication changes begin.

---

## Phase 1 — Server-Side Session Versioning

### Database Migration

Add an additive migration; do not edit a migration that may already be deployed.

```text
users.session_version INTEGER NOT NULL DEFAULT 1
```

Consider an index on `users.id` sufficient for the per-request lookup because `id` is already the primary key. Do not add a standalone index on `session_version` unless a real query requires it.

### Login and Token Issuance

1. Include `sessionVersion` in access and refresh token claims.
2. Include an explicit token type such as `type: access` or `type: refresh`.
3. Verify `issuer`, `audience`, token type, algorithm, expiry, user ID, and session version when decoding.
4. Use separate, strong secrets or signing keys for access and refresh tokens.
5. Reduce the access-token lifetime from 8 hours to 15 minutes after the refresh flow is ready.

### Authentication Middleware

After signature validation:

1. Fetch the current account using the token user ID.
2. Reject the request when the account does not exist.
3. Reject the request when `is_active` is false.
4. Reject the request when the token session version differs from `users.session_version`.
5. Populate `req.user.role`, username, and display name from the current database row, not from stale JWT claims.
6. Evaluate password-change requirements using the same current database row to avoid a second lookup.
7. Run authorization middleware only after the fresh account state has been attached.

### Sensitive Account Updates

Perform each state change, session-version increment, refresh-token revocation, and audit write in one database transaction.

- Deactivation: set `is_active = false`, increment `session_version`, clear refresh-token state.
- Role change: set the new role, increment `session_version`, clear refresh-token state.
- Password reset/change: set password state, increment `session_version`, clear refresh-token state.
- No-op role updates must not increment the version unnecessarily.

### Required Tests

- A token issued before deactivation receives `401` immediately after deactivation.
- A Superadmin token issued before demotion cannot access Account Management after demotion.
- A token with an old session version is rejected.
- A token for a deleted account is rejected.
- A valid token uses the current database role rather than the role claim supplied in the JWT.
- State change and audit log roll back together if either operation fails.

### Exit Criteria

- No deactivated, demoted, reset, or password-changed account can continue using an older token.

---

## Phase 2 — Safe Forced-Password-Change Flow

### Required Flow

1. A Superadmin resets a user's password to a temporary password.
2. The reset transaction increments `session_version` and revokes all previous refresh tokens.
3. The user authenticates with the temporary password.
4. The server returns a short-lived, purpose-limited forced-change access token and does not issue a normal refresh token yet.
5. The forced-change token can access only:
   - `POST /api/users/me/change-password`
   - `POST /api/auth/logout`
6. After a successful password change, increment `session_version` again and invalidate the forced-change token.
7. Require a normal login with the new password before issuing the normal access/refresh pair.

### Important Rules

- An ordinary access token issued before the reset must never be accepted for forced password change.
- `must_change_password = true` alone is not proof that the current caller knows the temporary password.
- The forced-change token must carry an explicit purpose claim and a short expiry.
- The backend, not the frontend, enforces the route allowlist.
- A successful password change must not return or log the password or any password hash.

### Required Tests

- A pre-reset access token cannot change the reset account's password.
- An old refresh token cannot obtain a new access token after reset.
- Incorrect temporary passwords do not receive a forced-change token.
- A forced-change token cannot read vessels, users, activity reports, terminals, or archives.
- A forced-change token can change the password exactly once.
- After changing the password, the user must log in normally.

### Exit Criteria

- A stolen token issued before reset cannot take control of the account.

---

## Phase 3 — Secure Refresh Tokens and Rotation

### Cookie Design

Set refresh tokens only through a response cookie configured with:

```text
HttpOnly=true
Secure=true in production
SameSite=Strict
Path=/api/auth
Max-Age matching the server-side refresh lifetime
```

Do not return refresh tokens in JSON and do not store them in `localStorage` or `sessionStorage`.

### Rotation Design

1. Store a hashed refresh-token identifier and token-family identifier.
2. On every refresh, atomically mark the current token as consumed and issue a replacement.
3. If a consumed token is presented again, revoke the entire token family and require login.
4. Rotate the CSRF value if a CSRF token is used.
5. Clear the cookie on logout, reset, password change, deactivation, role change, and refresh failure caused by revoked state.
6. Decide whether multiple devices are supported. If yes, store one refresh-token family per device/session instead of one hash on the user row.

### Browser Changes

1. Keep the access token in JavaScript memory.
2. On page load, silently call the refresh endpoint using the HttpOnly cookie.
3. Use `credentials: 'same-origin'` or the explicitly required credential mode.
4. Remove all refresh-token reads and writes from `public/js/api.js`.
5. Clear in-memory access and user state on logout or refresh failure.

### CSRF Controls

Bearer access tokens are not automatically sent by the browser, but the refresh cookie is. Preserve `SameSite=Strict` and verify `Origin`/`Referer` on cookie-authenticated state-changing authentication endpoints. If cross-site operation is required later, add a synchronizer or double-submit CSRF token before loosening `SameSite`.

### Required Tests

- JavaScript cannot read the refresh cookie.
- A refresh operation rotates the token.
- Reuse of the previous token revokes the family.
- Logout clears the cookie and invalidates server-side refresh state.
- Cross-origin refresh requests are rejected.
- Access tokens expire at the configured short lifetime.

### Exit Criteria

- No reusable refresh credential exists in browser-accessible storage.

---

## Phase 4 — Destructive Operation Safety

### Archive Purge

1. Add a Zod query schema for `days`.
2. Accept only an integer in an agreed range, for example `1` through `3650`.
3. Reject `0`, negative values, decimals, `NaN`, empty strings, repeated parameters, and values above the maximum.
4. Prefer removing the manual purge route if the scheduled retention job is sufficient.
5. If manual purge remains, decide explicitly whether only Superadmin should be allowed. The safer default is Superadmin-only.
6. Add a dry-run endpoint or confirmation token that returns the candidate row count before deletion.
7. Write a tamper-resistant audit event containing actor, cutoff, deleted count, request ID, and timestamp.
8. Execute the count, delete, and audit operation transactionally where supported.

### Other Destructive Routes

Review vessel delete, terminal delete, account deactivation, bulk import, and maintenance jobs for:

- Validated identifiers
- Explicit role checks
- Maximum batch sizes
- Transaction boundaries
- Audit logs
- Idempotency or duplicate-submit protection where appropriate

### Required Tests

- Negative, zero, non-numeric, decimal, and excessive retention values return `400` without deleting rows.
- Unauthorized roles receive `403`.
- A valid purge deletes only rows older than the calculated cutoff.
- Audit failure rolls back the purge if atomic auditing is required.

### Exit Criteria

- No malformed query can broaden a destructive operation beyond the intended scope.

---

## Phase 5 — Distributed Rate Limiting and Abuse Protection

### Architecture

Replace process-local `Map` stores with Redis or another shared store that supports atomic increments and TTL expiration.

Implement independent controls for:

- General API traffic per IP
- Login attempts per IP
- Login attempts per normalized username/account
- Password-change attempts per account
- Refresh attempts per token family and IP
- Expensive report/export/import endpoints

### Login Behavior

1. Normalize usernames exactly as authentication does before generating the limiter key.
2. Do not reveal whether a username exists.
3. Avoid locking an entire shared office IP after failures against one account.
4. Prefer progressive delay and combined account/IP controls over a single global hard lock.
5. Apply bounded TTLs so limiter keys expire automatically.
6. Define safe behavior if Redis is unavailable and alert on that condition.
7. Add standard `Retry-After` headers to `429` responses.

### Operational Controls

- Monitor failed-login rate, unique source IPs, account targeting, and lockout frequency.
- Alert on distributed password spraying and repeated Superadmin targeting.
- Never log supplied passwords or complete bearer/refresh tokens.

### Required Tests

- Failures for one username do not lock unrelated usernames sharing an IP.
- Distributed failures against one username are limited.
- Limits persist across application restarts and instances.
- Expired limiter entries are removed.
- Successful login applies the agreed reset behavior without enabling brute-force bypass.

### Exit Criteria

- Rate limiting is consistent across instances, bounded in storage, and resistant to shared-IP denial of service.

---

## Phase 6 — Dependency and Supply-Chain Remediation

### Immediate Dependency Work

1. Update the vulnerable `body-parser` transitive dependency to a fixed release through a compatible Express update or lockfile resolution.
2. Update or replace the `yamljs -> glob -> minimatch -> brace-expansion` chain.
3. Prefer a maintained YAML parser that does not require the vulnerable glob dependency for loading one known OpenAPI file.
4. Run `npm audit --omit=dev` after each lockfile change.
5. Run all unit and integration tests after dependency updates.
6. Review dependency license and maintenance status before introducing replacements.

### CI Controls

- Fail CI for exploitable Critical vulnerabilities.
- Require explicit risk acceptance for High vulnerabilities.
- Generate a software bill of materials for releases where practical.
- Pin GitHub Actions to commit SHAs.
- Keep `package-lock.json` committed and use `npm ci` in CI and production.
- Consider pinning the Docker base image by digest instead of relying only on `node:22-alpine`.

### Exit Criteria

- Known production advisories are fixed or have a documented, time-bounded risk acceptance.

---

## Phase 7 — CSP and Browser Hardening

### Content Security Policy

1. Move the inline login submit handler into an external JavaScript file.
2. Move repeated inline style attributes into CSS classes.
3. Remove `'unsafe-inline'` from `script-src` first.
4. Remove `'unsafe-inline'` from `style-src` after inline styles are eliminated or use nonces/hashes for the smallest unavoidable set.
5. Keep `default-src 'self'` and define explicit `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, and `form-action 'self'` directives.
6. Test the policy in report-only mode before enforcement.
7. Add a CSP violation reporting destination only if it can be operated securely and without collecting unnecessary personal data.

### DOM Safety

- Continue escaping every user-controlled value interpolated into `innerHTML`.
- Prefer `textContent`, `createElement`, and property assignment for new UI work.
- Add tests using payloads containing HTML, quotes, event handlers, and SVG-based XSS strings.
- Never insert API error stacks or raw server messages directly into HTML.

### Exit Criteria

- Production pages run without `script-src 'unsafe-inline'` and without browser CSP violations.

---

## Phase 8 — API, Documentation, Health, and Logging Hardening

### API Documentation

- Disable Swagger UI in production by default or require Superadmin authentication.
- Keep the OpenAPI document available in development and CI.
- Ensure examples contain no real hostnames, usernames, tokens, or credentials.

### Health Endpoints

- Separate liveness from readiness.
- Liveness should disclose only that the process is alive.
- Readiness should perform a bounded database check but return only a minimal status publicly.
- Do not expose exact version, uptime, dependency versions, database provider, or stack details unless operational monitoring requires them and access is restricted.

### Request IDs and Logs

1. Generate request IDs server-side with `crypto.randomUUID()`.
2. If upstream request IDs must be honored, validate their length and character set.
3. Do not log Authorization, Cookie, password, refresh-token, or reset-token values.
4. Sanitize or omit sensitive query parameters before logging URLs.
5. Limit production stack traces to protected logs and enforce log retention/access controls.
6. Review IP address and User-Agent retention against the organization's privacy policy.

### Exit Criteria

- Public endpoints reveal only the information needed for their function, and logs contain no reusable credentials.

---

## Phase 9 — Additional Account Protection

These controls should follow the P0/P1 fixes and may be scheduled separately:

- MFA for all Superadmin accounts, preferably WebAuthn/passkeys or TOTP with recovery codes.
- Step-up authentication before password reset, role change, deactivation, or destructive purge.
- Superadmin security notifications for password reset, role changes, and new device login.
- A “sign out all sessions” action.
- Device/session management with last-used time, IP summary, and revocation.
- Detection for impossible travel, password spraying, and abnormal activity-report access.
- Recovery procedures requiring dual control for the last active Superadmin.

---

## 6. Test Matrix

| Area | Required success case | Required denial/abuse case |
|---|---|---|
| Session version | Current active session is accepted | Old version, inactive account, deleted account, and stale role are rejected |
| Password reset | Temporary password produces a limited forced-change token | Pre-reset access/refresh tokens cannot change the password or refresh |
| Refresh rotation | Current refresh token produces one replacement | Reused, expired, revoked, cross-origin, or wrong-family token is rejected |
| Authorization | Current role can access only its approved routes | Demoted role loses access immediately |
| Archive purge | Valid bounded retention deletes the correct rows | Zero, negative, invalid, and excessive retention delete nothing |
| Rate limiting | Normal office usage and polling continue | Shared-IP abuse, account spraying, and distributed brute force are controlled |
| XSS/CSP | Normal UI renders correctly | Stored and reflected payloads remain inert and inline script is blocked |
| Dependencies | Clean install and startup succeed | CI reports or blocks unaccepted advisories |
| PostgreSQL | All auth/activity transactions succeed | Dialect-specific SQL regressions fail CI before deployment |

---

## 7. Deployment Sequence

1. Back up production and verify the PostgreSQL CI job.
2. Deploy the additive `session_version` migration.
3. Deploy backend token-version validation and transactional invalidation.
4. Intentionally invalidate all existing sessions once and notify users that they must log in again.
5. Deploy the forced-password-change fix.
6. Deploy refresh-cookie rotation and the corresponding frontend changes together.
7. Deploy archive validation and the shared rate limiter.
8. Deploy dependency updates and CSP changes after staging verification.
9. Enable monitoring and review authentication errors, `401`, `403`, `429`, refresh reuse, and forced-change failures.
10. Keep the previous application image available for rollback, but do not roll back the additive database column.

### Rollback Principles

- Prefer additive, backward-compatible migrations.
- Do not restore old authentication code if doing so would re-enable stale tokens.
- If the refresh-cookie release must be rolled back, force logout rather than restoring browser-stored refresh tokens.
- Preserve security audit records during application rollback.

---

## 8. User Communication

Before the authentication deployment, notify users that:

- Everyone will be signed out once after the security update.
- They will need to log in again.
- Users with a temporary or expired password will be required to change it before using the dashboard.
- Password-reset links or temporary credentials must not be shared.
- Repeated failed login attempts may introduce a delay, but one user should no longer lock all users on the same network.
- Suspected unauthorized access must be reported immediately so all sessions can be revoked.

---

## 9. Definition of Done

The security-hardening work is complete only when:

1. Deactivation, role change, password reset, and password change invalidate prior sessions immediately.
2. Authorization uses the current database role and active state.
3. A stolen pre-reset token cannot complete the forced-password-change flow.
4. Refresh tokens are absent from browser-accessible storage and rotate after every use.
5. Archive purge rejects unsafe retention values and cannot exceed its authorized scope.
6. Rate limits are shared, bounded, observable, and do not lock unrelated users behind one IP.
7. Known production dependency vulnerabilities are fixed or formally accepted with an expiry date.
8. CSP no longer allows inline scripts in production.
9. Swagger, health responses, request IDs, and logs follow the reduced-exposure rules.
10. SQLite and PostgreSQL security regression suites pass.
11. Operational documentation, rollback steps, and user communication are approved.
12. No passwords, password hashes, access tokens, refresh tokens, cookie values, or signing secrets appear in API responses, logs, audit events, fixtures, or committed files.
