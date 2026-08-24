# User Activity Tracking and Superadmin-Only Account Management Plan

## 1. Objective

Add user-activity visibility for every role while restricting all activity reports and all Account Management capabilities to `superadmin` users only.

The feature must answer:

- Which users are active now?
- Which users have never logged in?
- Which users have not used the system for 30 days or more?
- How many users in each role actually use the system?
- When did each user last log in and last perform authenticated activity?
- What authenticated actions did each user perform?

Activity must be collected for every authenticated role: `superadmin`, `admin`, `operator`, and `viewer`.

---

## 2. Agreed Definitions

### 2.1 Account and Usage Statuses

| Status | Definition |
|---|---|
| Enabled Account | `users.is_active = true` |
| Deactivated | `users.is_active = false` |
| Active Now | The latest successful authenticated activity occurred within the last 15 minutes |
| Active in 30 Days | The latest successful authenticated activity occurred within the last 30 days |
| Inactive for 30 Days or More | The user has logged in before, but the latest activity is at least 30 days old |
| Never Logged In | `users.last_login_at IS NULL` |

`Never Logged In` must remain separate from `Inactive for 30 Days or More`. A user who has never logged in has no historical usage and must not be presented as merely inactive.

### 2.2 Definition of an Actually Used Account

This metric applies to every role, not only Viewer.

An account is counted as **Actually Used in 30 Days** when:

```text
is_active = true
AND last_activity_at >= current time - 30 days
```

The dashboard must provide this metric for:

- All roles combined
- Superadmin
- Admin
- Operator
- Viewer

For each role, display at least:

- Total accounts
- Enabled accounts
- Ever logged in
- Actually used in the last 30 days
- Active now
- Never logged in
- Inactive for 30 days or more

### 2.3 Meaning of “Record Everything”

The system must account for activity from every role and every successful authenticated API request. Meaningful actions receive raw events; automatic dashboard polling is coalesced into one heartbeat event per user every 15 minutes. Every request still updates `last_activity_at` and the compact daily summary.

It must record metadata such as:

- User ID
- Role at the time of the action
- HTTP method
- Normalized route or action name
- Response status
- Activity timestamp in UTC
- Client IP, if required by the organization's privacy policy
- User agent, if required for operational investigation

It must never record:

- Plain-text passwords
- Password hashes
- Access tokens or refresh tokens
- Cookies or authorization headers
- Request or response bodies containing sensitive data
- Secrets or environment variables

Use an allowlist of safe metadata. Do not persist entire request or response objects.

---

## 3. Permission Matrix

| Capability | Superadmin | Admin | Operator | Viewer |
|---|---:|---:|---:|---:|
| Have own activity recorded | Yes | Yes | Yes | Yes |
| View activity summary | Yes | No | No | No |
| View per-user activity | Yes | No | No | No |
| View activity event history | Yes | No | No | No |
| Open Account Management | Yes | No | No | No |
| List or view accounts | Yes | No | No | No |
| Create an account | Yes | No | No | No |
| Edit another account | Yes | No | No | No |
| Deactivate another account | Yes | No | No | No |
| Reset another user's password | Yes | No | No | No |
| Change own password | Yes | Yes | Yes | Yes |

Frontend visibility is only a user-experience rule. Every restricted backend endpoint must independently require `superadmin`; hiding Account Management from Admin is not a sufficient security boundary.

---

## 4. Priority and Execution Order

| Priority | Work | Reason |
|---|---|---|
| P0 | Enforce Superadmin-only authorization on Account Management APIs | Prevents Admin from bypassing a hidden UI by calling APIs directly |
| P0 | Hide Account Management from every non-Superadmin role | Applies the new access requirement in the UI |
| P0 | Add database fields and activity-event storage | All reporting and classification depend on reliable data |
| P0 | Record successful login and authenticated activity for every role | Produces the source data for all metrics |
| P1 | Add Superadmin-only summary and detail APIs | Exposes data without weakening RBAC |
| P1 | Add the activity dashboard, filters, and account table columns | Makes the data useful to Superadmin |
| P1 | Add automated security and classification tests | Protects permission boundaries and date calculations |
| P2 | Add retention, privacy, operational, and API documentation | Controls long-term data growth and compliance risk |

---

## 5. Implementation Phases

## Phase 1 — Lock Account Management to Superadmin

### Backend

Update `src/modules/users/users.routes.js` so every Account Management endpoint is Superadmin-only:

```text
GET    /api/users                     -> superadmin only
GET    /api/users/:id                 -> superadmin only
POST   /api/users                     -> superadmin only
PUT    /api/users/:id                 -> superadmin only
DELETE /api/users/:id                 -> superadmin only
POST   /api/users/:id/reset-password  -> superadmin only
```

Keep this self-service route available to every authenticated role:

```text
POST /api/users/me/change-password
```

Also enforce the Superadmin-only rule in the policy/service layer so an internal caller cannot bypass route middleware.

### Frontend

Update `public/js/app.js` so `#accounts-tools-container` is displayed only when:

```text
user.role === 'superadmin'
```

Do not load the account list for an Admin. If a stale modal is already open when the user's role/session changes, close it and clear its account data.

Update the Account Management comment in `public/index.html` to state `Superadmin Only`.

### Completion Criteria

- Admin, Operator, and Viewer cannot see Account Management.
- Direct calls from Admin, Operator, or Viewer to Account Management APIs return `403 Forbidden`.
- Superadmin retains all Account Management functions.
- Every role can still change its own password.

---

## Phase 2 — Add User Activity Database Fields

Add a new migration. Do not modify a migration that may already be deployed.

Add to `users`:

```text
last_login_at     TIMESTAMP NULL
last_activity_at  TIMESTAMP NULL
login_count       INTEGER NOT NULL DEFAULT 0
```

Do not update `users.updated_at` when only touching activity fields.

Add indexes for:

- `last_login_at`
- `last_activity_at`
- `(role, last_activity_at)`
- `(is_active, last_activity_at)`

Existing accounts must be backfilled with `NULL`, `NULL`, and `0`. Historical login or activity data cannot be reconstructed reliably. The UI must show the activity-tracking start date so `Never Logged In` is not misinterpreted as a statement about usage before deployment.

### Completion Criteria

- The migration works on SQLite and PostgreSQL.
- Existing accounts remain valid.
- Date fields are stored in UTC.
- Rollback removes only the newly added activity fields and indexes.

---

## Phase 3 — Add an Activity Event Table

Create `user_activity_events`:

```text
id                primary key
user_id           foreign key -> users.id
role              role snapshot, not null
action             normalized action name, not null
http_method        string, not null
route_template     string, not null
response_status    integer, not null
ip_address         nullable string
user_agent         nullable string
occurred_at        timestamp, not null
```

Recommended indexes:

- `(user_id, occurred_at)`
- `(role, occurred_at)`
- `(action, occurred_at)`
- `occurred_at`

Use a normalized route template such as `/api/vessels/:id`, not a raw path containing arbitrary IDs or query values.

Retain raw events for 90 days and compact daily summaries for 730 days, both configurable through environment variables. Retention cleanup must never delete summary fields from `users`.

### Completion Criteria

- Events contain only approved metadata.
- Events from all four roles can be stored and queried.
- The event table has a documented retention policy.
- Sensitive headers, tokens, credentials, and bodies are absent.

---

## Phase 4 — Record Successful Login

After credentials and account status are verified successfully, update in one transaction:

```text
last_login_at = now UTC
last_activity_at = now UTC
login_count = login_count + 1
refresh token state
insert LOGIN_SUCCESS activity event
```

Rules:

- Record every successful login for every role.
- Do not increment `login_count` for failed login attempts.
- Authentication security logs may separately record failed attempts, but they must not expose the submitted password.
- A transaction failure must not leave partial login activity state.

### Completion Criteria

- Login timestamps and counts update for Superadmin, Admin, Operator, and Viewer.
- Failed logins do not count as usage.
- Login events never contain credentials or tokens.

---

## Phase 5 — Record Every Successful Authenticated Activity

Add activity middleware after authentication and password-expiration checks.

For every completed authenticated request:

1. Capture the authenticated user ID and role.
2. Capture the normalized route/action and response status.
3. Update `users.last_activity_at`.
4. Increment the user's UTC `user_activity_daily` row.
5. Insert a raw event for meaningful actions.
6. Coalesce `DASHBOARD_VIEWED` polling into at most one raw heartbeat event every 15 minutes per user.
7. Do not fail the user's primary request if activity recording fails; send the failure to operational logs and monitoring.

Do not throttle security or data-changing actions. Throttle only automatic dashboard polling events; `last_activity_at` and the daily request count must remain complete.

Store User-Agent on login and when its hash changes. Do not duplicate the same User-Agent value on every heartbeat or repeated request.

Background dashboard refreshes count as activity because they are successful authenticated system usage. This is especially relevant for Viewer accounts used on continuously displayed dashboards. If the organization later wants to distinguish human interaction from an open screen, add a separate `interaction` event type rather than changing the meaning of authenticated activity.

Exclude or classify carefully:

- Health checks without authentication must not create user activity.
- Failed unauthorized requests must not count as successful usage.
- Logout may be recorded as an event before the session is cleared.
- Activity report requests made by Superadmin should also be recorded.

### Completion Criteria

- Successful authenticated actions from every role create events.
- `last_activity_at` represents the latest successful authenticated usage.
- Event-recording failure does not break vessel-dashboard operations.
- Duplicate middleware registration does not create duplicate events.

---

## Phase 6 — Add Superadmin-Only Activity APIs

Add routes before `/:id` to avoid Express treating a fixed route name as a user ID:

```text
GET /api/users/activity-summary
GET /api/users/activity-events
GET /api/users/:id/activity-events
GET /api/users?activityStatus=active-now|active-30d|inactive-30d|never-login
```

Every route must require `superadmin` at both route and service/policy levels.

The summary response should include:

```json
{
  "totalAccounts": 0,
  "enabledAccounts": 0,
  "activeNow": 0,
  "actuallyUsedIn30Days": 0,
  "inactiveOver30Days": 0,
  "neverLoggedIn": 0,
  "deactivated": 0,
  "byRole": {
    "superadmin": {},
    "admin": {},
    "operator": {},
    "viewer": {}
  }
}
```

Event endpoints must use server-side pagination, date-range filters, user filters, role filters, and action filters. Do not allow an unbounded download of the full event table.

### Completion Criteria

- Superadmin can retrieve summary, user status, and event history.
- Every other role receives `403 Forbidden`.
- Thirty-day and fifteen-minute boundaries are calculated consistently in UTC.
- Event APIs are paginated and validated.

---

## Phase 7 — Add the Superadmin Activity UI

Place activity reporting inside Account Management, which is visible only to Superadmin.

Add summary cards:

- Total Accounts
- Active Now
- Actually Used in 30 Days
- Inactive for 30 Days or More
- Never Logged In
- Deactivated

Add a per-role breakdown for Superadmin, Admin, Operator, and Viewer.

Add account table columns:

- Username
- Display Name
- Role
- Account Status
- Usage Status
- Last Login
- Last Activity
- Login Count
- Actions

Add status badges:

- `ACTIVE NOW`
- `ACTIVE 30D`
- `INACTIVE 30D+`
- `NEVER LOGGED IN`
- `DEACTIVATED`

Add filters:

- Search
- Role
- Account status
- Usage status
- Activity date range
- Action type for event history

Display dates in the user's local timezone but preserve UTC values in API payloads and the database.

### Completion Criteria

- Only Superadmin can see or open the activity UI.
- Counts update consistently with the filtered account data.
- All roles appear in the breakdown.
- Empty and pre-tracking states are explained clearly.

---

## Phase 8 — Tests

### RBAC

- Account list, detail, edit, deactivate, create, and reset APIs return `403` for Admin.
- The same APIs return `403` for Operator and Viewer.
- Activity summary and event APIs return `403` for every non-Superadmin role.
- Superadmin can use all Account Management and activity-reporting functions.
- Every role can change its own password.

### Login and Activity

- Successful login updates both timestamps and increments `login_count`.
- Failed login does not update activity fields or counts.
- Every successful authenticated request creates exactly one safe activity event.
- Failed or unauthenticated requests do not count as successful usage.
- Activity recording works for every role.
- Activity-event failure does not change the primary API response.

### Classification

- Activity inside 15 minutes is Active Now.
- Activity older than 15 minutes but inside 30 days is Active in 30 Days.
- Activity exactly 30 days old is Inactive for 30 Days or More.
- `last_login_at IS NULL` is Never Logged In.
- A deactivated account is not counted as Actually Used even if its last activity is recent.
- Per-role metrics equal the underlying account classifications.

### Data Safety

- Passwords, hashes, tokens, cookies, authorization headers, and sensitive bodies never appear in events.
- Raw paths and query strings containing user input are not stored.
- Pagination and date filters reject invalid or excessive values.
- SQLite and PostgreSQL produce the same classifications.

---

## 6. Rollout Sequence

```text
1. Back up the database and run the existing tests.
2. Restrict every Account Management API to Superadmin.
3. Hide Account Management from Admin, Operator, and Viewer.
4. Add user summary fields and the activity-event table.
5. Add repository operations and safe metadata allowlists.
6. Record successful login for every role.
7. Record meaningful authenticated actions and coalesced dashboard heartbeats for every role.
8. Add Superadmin-only summary and event APIs.
9. Add Superadmin-only activity UI, role metrics, filters, and event history.
10. Add RBAC, classification, safety, and database compatibility tests.
11. Update OpenAPI, privacy, retention, and operational documentation.
12. Verify with a production-like database in staging.
13. Deploy the migration and application together.
14. Monitor event volume, database size, write failures, and API latency.
```

---

## 7. Definition of Done

- Activity is recorded for Superadmin, Admin, Operator, and Viewer.
- Every successful authenticated action creates a safe activity event.
- The system stores `last_login_at`, `last_activity_at`, and `login_count` for each user.
- Actual usage is reported for all roles, including an all-roles total.
- Only Superadmin can view activity summaries, account usage, or activity events.
- Only Superadmin can open or use Account Management.
- Admin cannot access Account Management through either the UI or direct API calls.
- Every role can still change its own password.
- No activity record contains credentials, tokens, sensitive headers, or sensitive bodies.
- Activity data has a documented retention policy.
- UTC boundary tests and RBAC tests pass on SQLite and PostgreSQL.
- OpenAPI and operational documentation match the implemented behavior.
