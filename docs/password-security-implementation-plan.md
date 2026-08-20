# Password Security and Authentication Implementation Plan

## 1. Objective

Improve the Vessel Dashboard authentication and password-management system with the following capabilities:

- Passwords must contain at least 8 characters.
- Passwords must contain at least one lowercase letter.
- Passwords must contain at least one number.
- Passwords must contain at least one special character.
- Whitespace is not allowed in passwords.
- Users cannot reuse any of their 5 most recent passwords.
- Passwords expire after 90 days.
- Password forms display a real-time password requirements checklist.
- Password forms include a Confirm Password field.
- Only `superadmin` users can create accounts.
- Only `superadmin` users can reset another user's password.
- Every authenticated role can still change its own password.
- Existing sessions are revoked after a password reset or change.
- Plain-text passwords and password hashes must never be exposed through APIs, audit logs, or application logs.

This plan is ordered by dependency and risk so each part can be implemented and verified without unnecessarily disrupting the existing system.

---

## 2. Agreed Security Rules

### 2.1 Password Policy

Every new password must satisfy all of the following rules:

| Requirement | Rule |
|---|---|
| Minimum length | 8 characters |
| Maximum length | 100 characters |
| Lowercase letter | At least one character from `a-z` |
| Number | At least one character from `0-9` |
| Special character | At least one character such as `!@#$%^&*` |
| Whitespace | Not allowed |
| Password history | Must not match the current password or the previous 4 passwords |
| Password lifetime | 90 days from `password_changed_at` |

An uppercase letter is not required under the current requirements.

### 2.2 Definition of the “Last 5 Passwords”

- The current password counts as password number 1.
- The system retains no more than 5 password hashes per user.
- Before accepting a new password, the application verifies it against all 5 retained hashes with `verifyPassword()`.
- Hash strings must never be compared directly because Argon2 uses a random salt and can generate different hashes for the same password.
- After a successful password change, the new hash is inserted and entries older than the fifth most recent entry are deleted.

### 2.3 Role and Permission Matrix

| Capability | Superadmin | Admin | Operator | Viewer |
|---|---:|---:|---:|---:|
| View the account list | Yes | Yes | No | No |
| Create an account | Yes | No | No | No |
| Reset another user's password | Yes | No | No | No |
| Change own password | Yes | Yes | Yes | Yes |
| Edit ordinary account details | Yes | Yes, subject to existing policy | No | No |
| Manage a Superadmin account | Yes | No | No | No |

Hiding controls in the frontend is only a user-experience measure. The backend must enforce authorization on every request.

---

## 3. Priority Order

| Priority | Work | Reason |
|---|---|---|
| P0 | Database migration and backups | Password age and history depend on the schema, and database work carries the highest data risk. |
| P0 | Backend password policy | The backend is the primary security boundary for every password flow. |
| P0 | Password history and transactions | Password reuse protection requires consistent, atomic data updates. |
| P0 | Password expiration and route protection | The 90-day rule must affect both new logins and sessions that are already open. |
| P0 | RBAC for account creation and reset | Admin users must also be blocked from calling the APIs directly. |
| P1 | Session revocation and auditing | Existing sessions must not remain reusable after credentials change. |
| P1 | Frontend password checklist | The checklist helps users satisfy the policy before submitting a form. |
| P1 | Automated tests | Authentication and authorization changes require regression protection. |
| P2 | OpenAPI, environment, and operational documentation | Deployment and ongoing maintenance must remain clear and repeatable. |

---

## 4. Implementation Phases

## Phase 0 — Preparation and Backups

### Tasks

1. Inspect all existing migrations and confirm their execution order.
2. Confirm that the existing VOY migration can be applied successfully before adding the new password-security migration.
3. Back up the SQLite database before testing migrations locally or in staging.
4. Back up the PostgreSQL production database before the production deployment.
5. Record the current user count and migration version for post-migration verification.
6. Run the existing test suite and record the baseline result.

### Important Constraints

- Do not modify old migrations that may already have been deployed.
- Add a new migration with a later timestamp.
- Test the migration against both SQLite and PostgreSQL because the project supports both clients.
- Do not start the production application against an unverified migration.

### Completion Criteria

- All existing migrations apply successfully.
- A recoverable database backup exists.
- The existing test suite passes before feature implementation begins.

---

## Phase 1 — Add the Database Foundation

### Files

- `src/database/migrations/<timestamp>_add_password_security.js`
- `src/database/knex.js`
- `knexfile.js`

### 1.1 Add a Column to `users`

Add:

```text
password_changed_at TIMESTAMP NULL
```

Do not use `updated_at` to calculate password age. That field also changes when a display name, role, or account status is updated.

### 1.2 Create `password_history`

Recommended structure:

```text
password_history
├── id                 primary key
├── user_id            foreign key -> users.id
├── password_hash      text, not null
└── created_at         timestamp, not null
```

Add the following indexes:

- An index on `user_id`.
- A composite index on `(user_id, created_at)`.

Use `ON DELETE CASCADE` for the user foreign key so password history does not remain after a future hard deletion of an account.

### 1.3 Backfill Existing Users

The migration must:

1. Set `password_changed_at` for existing users to the migration time.
2. Copy each user's current `users.password_hash` into `password_history` as the first history entry.
3. Avoid expiring every existing account immediately after deployment.
4. Allow the application to treat a future `NULL password_changed_at` value as expired, using a fail-closed approach for invalid data.

### 1.4 Rollback

The rollback should:

1. Drop `password_history`.
2. Drop `users.password_changed_at`.

Before rolling back production, determine whether password history must be retained for security investigation or audit purposes.

### Completion Criteria

- Every existing user has a `password_changed_at` value.
- Every existing user has at least one password-history record.
- The migration never prints a password hash to the console or logs.
- Foreign keys and indexes work in both SQLite and PostgreSQL.

---

## Phase 2 — Create a Central Backend Password Policy

### New File

- `src/utils/passwordPolicy.js`

### Responsibilities

The utility should expose functions such as:

```text
validatePasswordStrength(password)
getPasswordPolicyErrors(password)
isPasswordExpired(passwordChangedAt, maxAgeDays)
```

`getPasswordPolicyErrors()` should return stable error codes, for example:

```text
PASSWORD_TOO_SHORT
PASSWORD_TOO_LONG
PASSWORD_REQUIRES_LOWERCASE
PASSWORD_REQUIRES_NUMBER
PASSWORD_REQUIRES_SPECIAL
PASSWORD_CONTAINS_WHITESPACE
```

User-facing messages can be mapped from these codes. This keeps tests stable and prevents security logic from depending on a specific display language.

### Environment Configuration

Add the following settings to `src/config/index.js` and `.env.example`:

```env
PASSWORD_MAX_AGE_DAYS=90
PASSWORD_HISTORY_LIMIT=5
```

Both values must be validated as positive integers. Use 90 and 5 as defaults when the variables are not set.

### Completion Criteria

- Every password-policy rule has unit tests.
- The policy utility has no dependency on Express or the database.
- Password-strength regular expressions are not duplicated across backend modules.

---

## Phase 3 — Update the Zod Validation Schemas

### Files

- `src/modules/users/users.schema.js`
- `src/modules/auth/auth.schema.js` if another password-setting endpoint is added later

### Schemas That Must Use the Central Policy

- `createUserSchema.password`
- `adminResetPasswordSchema.new_password`
- `selfChangePasswordSchema.new_password`

Each schema must call the central password-policy utility instead of defining separate regular expressions.

### API Error Format

Preserve the existing response structure and return only the failed requirements. Example:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "new_password",
        "message": "Password requires at least one special character"
      }
    ]
  }
}
```

Never return password-history hashes, timestamps, or matching positions.

### Completion Criteria

- Create, reset, forced-change, and voluntary-change flows reject weak passwords consistently.
- Validation errors remain compatible with the existing API client.
- A password satisfying every rule is accepted.

---

## Phase 4 — Add Password-History Repository Operations

### Files

- `src/modules/users/users.repository.js`
- Optionally `src/modules/users/passwordHistory.repository.js` if password history is separated into its own repository

### Required Repository Functions

```text
findRecentPasswordHashes(userId, limit, trx)
insertPasswordHistory(userId, passwordHash, trx)
prunePasswordHistory(userId, limit, trx)
setPasswordAndSecurityState(userId, data, trx)
```

Every repository function used by a password-change flow must accept a transaction object. This prevents a partial update in which the user password changes but history or audit data does not.

### Password-Reuse Check

1. Load no more than the 5 most recent hashes, newest first.
2. Call `verifyPassword(candidatePassword, storedHash)` for each hash.
3. If any check succeeds, throw an application error with a stable code such as `PASSWORD_RECENTLY_USED`.
4. Do not reveal which history entry matched.

### Completion Criteria

- The current password and previous 4 passwords are rejected.
- A password older than the retained 5 entries can be reused.
- Each user retains no more than 5 entries after a successful transaction.
- Password hashes never leave the service/repository boundary through an API response.

---

## Phase 5 — Consolidate Password Changes in a Central Service

### Files

- `src/modules/users/users.service.js`
- `src/modules/users/users.repository.js`
- `src/utils/password.js`
- `src/utils/errors.js`

### Recommended Service Helper

Create a private or internal helper such as:

```text
setUserPassword({
  targetUserId,
  newPassword,
  mustChangePassword,
  actorUserId,
  auditAction,
  auditReason,
  clientIp
})
```

### Transaction Order

Execute the following steps in one database transaction:

```text
1. Validate the password policy.
2. Load the 5 most recent password hashes.
3. Reject a reused password.
4. Hash the new password with Argon2.
5. Update users.password_hash.
6. Set users.password_changed_at to the current time.
7. Set users.must_change_password for the relevant flow.
8. Clear users.refresh_token_hash.
9. Insert the new password-history entry.
10. Prune history to 5 entries.
11. Insert an audit-log entry.
12. Commit the transaction.
```

If any operation fails, the entire transaction must roll back.

### Behavior by Flow

#### Create Account

- Only a Superadmin can perform the action.
- The temporary password must satisfy the password policy.
- Store it as the first password-history entry.
- Set `must_change_password = true`.
- Set `password_changed_at` to the current time.

#### Reset Another User's Password

- Only a Superadmin can perform the action.
- The temporary password must satisfy the password policy.
- It must not match any of the target user's 5 most recent passwords.
- Set `must_change_password = true`.
- Revoke the existing refresh token.
- Write a `PASSWORD_RESET` audit event.

#### Forced Password Change

- The account owner can perform it after authenticating with a temporary or expired password.
- The current password does not need to be submitted again because the user has authenticated and is already inside the forced-change flow.
- The new password must not match any of the 5 most recent passwords.
- Set `must_change_password = false`.
- Refresh `password_changed_at`.
- Revoke the existing refresh token.

#### Voluntary Password Change

- Require the current password, preserving the existing behavior.
- The new password must not match any of the 5 most recent passwords.
- Set `must_change_password = false`.
- Refresh `password_changed_at`.
- Revoke the existing refresh token.

#### Legacy bcrypt-to-Argon2 Rehash

- Change only the storage algorithm.
- Do not update `password_changed_at`.
- Either update the latest history record to the new Argon2 hash or ensure password-history verification continues to support legacy bcrypt hashes.
- Do not count the rehash as a new password.

### Completion Criteria

- Every password-setting flow uses the shared service logic.
- No flow bypasses the password policy or password-history check.
- A failure during the audit or history write rolls back the user update.
- The previous refresh token is revoked after reset or change.

---

## Phase 6 — Enforce the 90-Day Password Lifetime

### Files

- `src/modules/auth/auth.service.js`
- `src/modules/auth/auth.repository.js`
- `src/middleware/requirePasswordChange.js`
- `src/config/index.js`

### 6.1 Check During Login

After the username and password are verified:

1. Read `must_change_password`.
2. Read `password_changed_at`.
3. Calculate expiration using `PASSWORD_MAX_AGE_DAYS`.
4. Return state to the frontend, for example:

```json
{
  "mustChangePassword": true,
  "passwordExpired": true
}
```

`mustChangePassword` remains the combined flag used to open the blocking modal. `passwordExpired` lets the frontend display the correct explanation.

### 6.2 Check Every Authenticated Request

Update `requirePasswordChange` to re-read the user from the database and block the request when:

```text
must_change_password is true
OR
password_changed_at is null
OR
password_changed_at + 90 days <= current time
```

This ensures an already-open session is restricted as soon as the password reaches its expiration time.

### 6.3 Routes Allowed While Restricted

- `POST /api/users/me/change-password`
- `POST /api/auth/logout`

All other APIs must return `PASSWORD_CHANGE_REQUIRED`.

### Completion Criteria

- A password aged 89 days remains valid.
- A password expires at 90 days.
- A `NULL password_changed_at` value is treated as expired.
- An open session becomes restricted after expiration.
- The user can resume normal access after a successful password change and reauthentication.

---

## Phase 7 — Restrict Account Creation and Password Reset to Superadmin

### Files

- `src/modules/users/users.routes.js`
- `src/modules/users/users.policy.js`
- `src/modules/users/users.service.js`

### Route-Level Authorization

Change the following endpoint permissions:

```text
POST /api/users                     -> superadmin only
POST /api/users/:id/reset-password  -> superadmin only
```

Keep other endpoint policies unchanged unless a separate requirement changes them.

### Service-Level Authorization

Enforce the same rules inside the service so internal code cannot bypass the Express middleware:

- `createUser()` rejects every actor that is not a Superadmin.
- `resetPassword()` rejects every actor that is not a Superadmin.
- `changeOwnPassword()` remains available to every authenticated role.

An Admin calling either restricted API directly must receive `403 Forbidden`.

### Completion Criteria

- An Admin cannot create an account.
- An Admin cannot reset another user's password.
- A Superadmin can perform both actions.
- Operator and Viewer roles remain blocked.
- Changing one's own password continues to work for every role.

---

## Phase 8 — Revoke Sessions and Improve Auditing

### Session Behavior

When a password is reset or changed:

- Set `refresh_token_hash = NULL`.
- Existing refresh tokens must no longer be usable.
- Access tokens may still be cryptographically valid, so middleware must continue to re-read password state where required.
- After a user changes their own password, the frontend should clear local tokens and return to the login page so a fresh token set is issued.
- A Superadmin reset must invalidate the target user's previous refresh token immediately.

### Audit Actions

Use clear audit actions:

- `PASSWORD_RESET`
- `PASSWORD_SELF_CHANGE`
- Optionally `PASSWORD_EXPIRED_CHANGE` if expired changes need separate reporting

Audit records may contain:

- Actor user ID
- Target user ID
- Action
- Client IP
- Timestamp
- A reason such as `admin_reset`, `forced_change`, or `expired`

Audit records and application logs must never contain:

- Plain-text passwords
- Password hashes
- Password-history entries
- Request bodies that contain password fields

### Completion Criteria

- A refresh token issued before a reset or change is rejected afterward.
- Application and audit logs contain no credentials.
- The audit event identifies the actor and target account.

---

## Phase 9 — Add the Frontend Password Checklist

### Files

- `public/js/app.js`
- `public/js/validation.js`
- `public/index.html`
- `public/css/style.css`
- `public/login.html` if password-setting UI is added there later

### 9.1 Forms That Need the Checklist

- Create Account modal
- Reset Password modal
- Forced Password Change modal
- Voluntary Change Password modal, if a separate one is introduced

### 9.2 Checklist Behavior

Display and update these rules in real time:

```text
○ At least 8 characters
○ At least one lowercase letter
○ At least one number
○ At least one special character
○ No whitespace
○ Password and Confirm Password match
```

Required behavior:

- Update on every password or confirmation `input` event.
- Show a neutral circle or cross before a requirement is satisfied.
- Show a green check mark after a requirement is satisfied.
- Disable the submit button until all client-side requirements pass.
- Always validate again on the backend.
- Use text and icons in addition to color for accessibility.
- Use `aria-live` carefully so screen readers receive useful updates without announcing every checklist item on every keystroke.

### 9.3 Confirm Password

Add Confirm Password to every form that defines a new password.

- Confirm Password is a browser-side validation field.
- Do not send it to the backend.
- If it is accidentally sent, decide explicitly whether the Zod schema strips it or rejects the unknown field.

### 9.4 Password-History Error

The browser cannot safely validate the “last 5 passwords” requirement in real time because password-history data must never be sent to the client.

When the backend returns `PASSWORD_RECENTLY_USED`, display:

> This password was used recently. Please choose a password different from your last 5 passwords.

Do not reveal which history position matched.

### 9.5 Role-Based UI

For Admin users:

- Hide the Create Account button.
- Hide Reset Password actions on every account row.
- Keep Edit and Deactivate controls according to the existing policy.

For Superadmin users:

- Show the Create Account button.
- Show Reset Password actions.

### Completion Criteria

- Checklist items update immediately while typing.
- Submission is blocked when the checklist or confirmation does not pass.
- Admin users do not see Create or Reset controls.
- Superadmin users can access both controls.
- Backend errors are displayed clearly without exposing sensitive data.

---

## Phase 10 — Automated Tests

### 10.1 Password Policy Unit Tests

- Reject a password shorter than 8 characters.
- Reject a password longer than 100 characters.
- Reject a password without a lowercase letter.
- Reject a password without a number.
- Reject a password without a special character.
- Reject a password containing whitespace.
- Accept a password satisfying every requirement.

### 10.2 Password History Tests

- Reject the current password.
- Reject passwords in history positions 2 through 5.
- Permit a password older than the retained 5 entries.
- Retain no more than 5 history records.
- Ensure one user's history does not affect another user.
- Verify that legacy bcrypt hashes can still be checked.

### 10.3 Password Expiration Tests

- A password aged 89 days is not expired.
- A password aged exactly 90 days is expired.
- A password older than 90 days is expired.
- A `NULL password_changed_at` value is expired.
- A successful password change refreshes the timestamp.
- A bcrypt-to-Argon2 rehash does not refresh the timestamp.

### 10.4 RBAC Integration Tests

- Admin receives `403` from `POST /api/users`.
- Admin receives `403` from `POST /api/users/:id/reset-password`.
- Superadmin can create an account.
- Superadmin can reset another user's password.
- Operator and Viewer receive `403`.
- Every role can change its own password when the required current password is correct.

### 10.5 Authentication Integration Tests

- Login with an expired password returns `mustChangePassword: true`.
- An expired user cannot access other protected endpoints.
- An expired user can access Change Password and Logout.
- An old refresh token fails after reset or change.
- A user can log in with the new password after a successful change.
- The old password no longer works.

### 10.6 Transaction Tests

- If inserting password history fails, the user password remains unchanged.
- If inserting the audit event fails, both the user update and history insert roll back.
- If updating the user fails, no password-history record is inserted.

### 10.7 Frontend Tests

- Checklist state changes in response to input.
- Submit remains disabled until every requirement passes.
- A mismatched Confirm Password prevents submission.
- Admin visibility rules hide Create and Reset controls.
- Superadmin visibility rules show Create and Reset controls.
- `PASSWORD_RECENTLY_USED` displays the correct message.

### Verification Commands

```bash
npm test
npm run test:coverage
npm run lint
```

Security-critical services, policies, and middleware should have both success-path and failure-path coverage.

---

## Phase 11 — Update Documentation and Configuration

### Files

- `.env.example`
- `docs/openapi.yaml`
- Relevant deployment documentation

### OpenAPI Updates

Document:

- Password requirements in request schemas.
- `403` responses for Admin on Create Account and Reset Password.
- `PASSWORD_RECENTLY_USED`.
- `PASSWORD_CHANGE_REQUIRED`.
- `passwordExpired` in the login response.

### Environment Variables

Add:

```env
PASSWORD_MAX_AGE_DAYS=90
PASSWORD_HISTORY_LIMIT=5
```

### Operational Notes

- Existing users begin their 90-day period on the migration deployment date.
- Document a recovery procedure for the case where no active Superadmin account remains accessible.
- Do not edit roles or passwords directly in the database except through an approved, audited break-glass procedure.

---

## Phase 12 — Staging and Production Rollout

### 12.1 Before Deployment

1. Back up the database.
2. Run tests and lint.
3. Test the migration against a copy of production data.
4. Compare user counts before and after migration.
5. Confirm every user has password history and `password_changed_at`.

### 12.2 Staging Verification

Test in this order:

1. Existing accounts can log in.
2. Admin users do not see Create or Reset controls.
3. Admin receives `403` when calling Create or Reset APIs directly.
4. Superadmin can create an account.
5. A new user is forced to change the temporary password.
6. The password checklist works for every relevant form.
7. Reused passwords are rejected.
8. Password reset invalidates the previous session.
9. A password older than 90 days triggers the forced-change flow.
10. Logs contain no passwords or hashes.

### 12.3 Production Deployment

1. Announce a maintenance window if required.
2. Back up the production database.
3. Deploy the application and migration as one coordinated release.
4. Check the health endpoint.
5. Verify the applied migration version.
6. Test login with an authorized Superadmin account.
7. Inspect audit and error logs.
8. Monitor login failures, `403` responses, forced-change events, and database errors during the initial post-deployment period.

### Rollback Criteria

Consider rollback when:

- The migration is incomplete or history data does not correspond to users.
- A large number of existing users unexpectedly cannot log in.
- Superadmin cannot create accounts or reset passwords.
- A password-change transaction leaves inconsistent data.
- Refresh-token or forced-change behavior creates an authentication loop.

---

## 5. Recommended Change Sets

Split implementation into reviewable change sets.

### Change Set 1 — Database Foundation

- Add `password_changed_at`.
- Add `password_history`.
- Backfill existing users.
- Add indexes and migration tests.

### Change Set 2 — Backend Password Security

- Add the central password-policy utility.
- Update Zod schemas.
- Add password-history repository operations.
- Add the transactional password service.
- Add unit tests.

### Change Set 3 — Expiration and Authentication

- Enforce the 90-day lifetime.
- Update the login response.
- Update forced-change middleware.
- Revoke sessions.
- Add authentication integration tests.

### Change Set 4 — RBAC

- Restrict Create Account to Superadmin.
- Restrict Reset Password to Superadmin.
- Add service-level authorization.
- Add RBAC integration tests.

### Change Set 5 — Frontend User Experience

- Add the password checklist.
- Add Confirm Password.
- Apply role-based control visibility.
- Add expired-password and reused-password messages.
- Add frontend tests.

### Change Set 6 — Documentation and Rollout

- Update OpenAPI.
- Update `.env.example`.
- Add deployment notes.
- Complete staging verification.

---

## 6. Definition of Done

The feature is complete only when all of the following are true:

- The backend enforces the password policy for every password-setting flow.
- Password Checklist and Confirm Password work in every relevant form.
- Users cannot reuse any of their 5 most recent passwords.
- Passwords expire after 90 days.
- Expired users are blocked from every endpoint except Change Password and Logout.
- Only Superadmin can create accounts or reset another user's password.
- Admin receives `403` when calling either restricted API directly.
- Existing refresh tokens are revoked after reset or change.
- Password update, password history, and audit writing occur in one transaction.
- APIs and logs never expose a password or password hash.
- Migrations work with both SQLite and PostgreSQL.
- Existing users do not all expire immediately after migration.
- Automated tests and lint pass.
- OpenAPI and `.env.example` are current.
- Staging verification is complete before production deployment.

---

## 7. Condensed Execution Order

```text
1. Back up the database and verify existing migrations.
2. Add password_changed_at and password_history.
3. Create the central password policy.
4. Update Zod validation schemas.
5. Add password-history repository operations.
6. Consolidate password changes in one transactional service.
7. Enforce the 90-day password lifetime.
8. Restrict Create Account and Reset Password to Superadmin.
9. Revoke sessions and improve auditing.
10. Add Password Checklist and Confirm Password to the frontend.
11. Add unit, integration, transaction, and frontend tests.
12. Update OpenAPI and environment documentation.
13. Verify the complete flow in staging.
14. Back up and deploy to production.
15. Monitor authentication and database behavior after deployment.
```
