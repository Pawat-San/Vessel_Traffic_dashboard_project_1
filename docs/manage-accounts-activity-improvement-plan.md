# Manage Accounts and Recent Activity Improvement Plan

## 1. Objective

Improve the Superadmin-only Manage Accounts experience in three areas:

1. Make it easy to identify and select a specific user.
2. Fix the Edit, Reset Password, and Deactivate buttons remaining stuck while the Manage Accounts table is horizontally scrolled.
3. Replace technical activity names such as `GET_API_*` with clear, human-readable descriptions that identify both the actor and the affected account where applicable.

This work must not weaken the existing Superadmin-only authorization rules.

---

## 2. Confirmed Current Causes

### 2.1 A Specific User Cannot Be Identified Quickly

The current Manage Accounts filters support Role and Usage Status, but there is no username/display-name search and no direct user selector. Superadmin must manually scan the table.

Recent Activity contains the actor's `user_id`, username, and role, but account-management events do not store a separate target account. For example, a password reset can show who made the request but not clearly show whose password was reset.

### 2.2 Account Action Buttons Remain Stuck During Horizontal Scrolling

The global CSS selector below applies sticky positioning to every table cell using `action-cell`:

```css
.fids-cell.action-cell {
  position: sticky;
  right: 0;
}
```

Manage Accounts reuses `action-cell`, so Edit, Reset Password, and Deactivate remain pinned while the rest of the account columns scroll. Its Actions header is not pinned by the same rule, which can also cause header/body misalignment and overlapping content.

### 2.3 Recent Activity Displays `GET_API_*`

`src/middleware/trackUserActivity.js` currently generates an action by combining the HTTP method and normalized route:

```text
GET + /api/vessels -> GET_API_VESSELS
GET + /api/users   -> GET_API_USERS
```

This is technically useful for logging but unsuitable as the primary UI label. It describes the transport layer rather than the user's intent and does not identify a target account.

---

## 3. Target User Experience

### 3.1 Find a Specific Account

Add a Search field to Manage Accounts:

```text
Search by username or display name
```

Expected behavior:

- Search is case-insensitive.
- Search matches both `username` and `display_name`.
- Search works together with Role and Usage Status filters.
- Search is server-side so it continues to work when there are more than 100 accounts.
- Input is debounced by approximately 300 milliseconds to avoid an API request on every keystroke.
- The result count and empty state clearly reflect the active filters.
- Provide a Clear Filters action.

The account row must continue to show both Username and Display Name. Username is the stable visible identifier; Display Name is the human-friendly name.

### 3.2 Clearly Identify Actor and Target in Recent Activity

Recent Activity should use separate columns:

| Column | Meaning |
|---|---|
| Time | When the activity occurred |
| Performed By | Username and display name of the actor |
| Actor Role | Actor's role at the time |
| Activity | Human-readable action |
| Affected Account | Target username/display name when the action affects another account |
| Result | Success status |
| IP | Source IP |

Example rows:

```text
ui-superadmin | Reset password       | somchai.viewer
ui-superadmin | Deactivated account  | old.viewer
ui-superadmin | Updated account role | operator.one
ui-viewer     | Viewed vessel board  | —
```

Use `—` when an activity has no target account.

### 3.3 Horizontal Scrolling

For the Manage Accounts table:

- Edit, Reset Password, and Deactivate must scroll horizontally with their row.
- The Actions column must not remain pinned over Role, Account, Usage, or timestamp columns.
- The header and body columns must remain aligned.
- The entire Actions cell must remain reachable by scrolling to the right.
- Buttons must remain on one line, with enough minimum width for all three actions.

Do not remove sticky Actions behavior from the main Vessel table if it is still required there. Scope sticky CSS to the Vessel table rather than using a global `action-cell` selector.

---

## 4. Data Model Changes

## Phase 1 — Add Target-Account Metadata

Add a new migration for `user_activity_events`:

```text
target_user_id             INTEGER NULL, FK -> users.id, ON DELETE SET NULL
target_username_snapshot   STRING NULL
target_display_name_snapshot STRING NULL
```

Why store snapshots:

- `target_user_id` supports filtering and joining current account details.
- Snapshots preserve who the event referred to if the username/display name changes later.
- If hard deletion is introduced later, the historical event remains understandable after the foreign key becomes `NULL`.

Do not store password values, password hashes, tokens, request bodies, or other credential data in target metadata.

Add an index on:

```text
(target_user_id, occurred_at)
```

### Completion Criteria

- An account-management event identifies both actor and target.
- Existing activity rows remain valid with `NULL` target fields.
- The migration works on SQLite and PostgreSQL.

---

## 5. Backend Implementation

## Phase 2 — Add Account Search

### Files

- `src/modules/users/users.schema.js`
- `src/modules/users/users.repository.js`
- `src/modules/users/users.controller.js`
- `docs/openapi.yaml`

Add a validated query parameter:

```text
GET /api/users?search=<username-or-display-name>
```

Rules:

- Trim leading/trailing whitespace.
- Maximum length: 100 characters.
- Escape wildcard characters appropriately.
- Use a parameterized Knex query.
- Match username and display name case-insensitively on both SQLite and PostgreSQL.
- Preserve pagination and existing Role/Usage Status filters.

### Completion Criteria

- Superadmin can locate a specific account by partial username or display name.
- Search cannot bypass Superadmin-only authorization.
- Search does not permit SQL injection or an unbounded query.

---

## Phase 3 — Replace Transport Codes with Domain Activity Codes

Introduce stable activity codes that describe user intent:

```text
AUTH_LOGIN
AUTH_LOGOUT
AUTH_REFRESH
DASHBOARD_VIEWED
ACCOUNT_LIST_VIEWED
ACCOUNT_DETAILS_VIEWED
ACCOUNT_CREATED
ACCOUNT_UPDATED
ACCOUNT_DEACTIVATED
ACCOUNT_PASSWORD_RESET
ACTIVITY_REPORT_VIEWED
VESSEL_CREATED
VESSEL_UPDATED
VESSEL_DELETED
VESSEL_IMPORTED
ARCHIVE_VIEWED
```

Implementation approach:

1. Add a route/action registry for ordinary read requests.
2. Let controllers or services set explicit activity metadata for domain mutations.
3. For account-management mutations, include `target_user_id` and target snapshots.
4. Record exactly one activity event per successful request.
5. Suppress the generic route-derived event when explicit domain metadata exists.
6. Retain `http_method` and `route_template` as technical detail fields for investigation.

The middleware fallback may still create a generic internal code for an unmapped route, but the API must return a human-readable fallback label and the UI must not expose raw `GET_API_*` text as its primary activity description.

### Avoid Duplicate Events

Account operations already write to `audit_logs`. Do not create two `user_activity_events` rows for one request.

Recommended flow:

```text
Controller/service sets res.locals.activity metadata
        ↓
Request completes successfully
        ↓
Activity middleware writes one event
        ↓
Existing audit_logs transaction remains unchanged
```

### Completion Criteria

- A password reset displays who performed it and which account was reset.
- Account creation, update, deactivation, and reset each produce one activity event.
- General page views have readable activity names.
- Technical method and route data remain available for troubleshooting.

---

## Phase 4 — Return Human-Readable Activity Data

Update the activity-event API response to include:

```json
{
  "action": "ACCOUNT_PASSWORD_RESET",
  "actionLabel": "Reset password",
  "actor": {
    "id": 1,
    "username": "ui-superadmin",
    "displayName": "Superadmin"
  },
  "target": {
    "id": 20,
    "username": "somchai.viewer",
    "displayName": "Somchai"
  }
}
```

For existing historical `GET_API_*` events:

- Map known codes to readable labels.
- Example: `GET_API_VESSELS` becomes `Viewed vessel dashboard`.
- Example: `GET_API_USERS` becomes `Viewed account list`.
- Unknown legacy codes use a safe humanized fallback, not the raw underscore string.
- Do not rewrite old event rows unless a separate data migration is justified.

Add filtering by:

- Actor user ID
- Target user ID
- Role
- Domain action code
- Date range

Use a controlled Action dropdown in the UI instead of requiring Superadmin to type `GET_API_*` manually.

---

## 6. Frontend Implementation

## Phase 5 — Fix Manage Accounts Table Scrolling

### Files

- `public/index.html`
- `public/css/style.css`

Add specific table identifiers/classes:

```text
#vessels-table
#accounts-table
```

Replace the global sticky selector with a Vessel-table-specific selector. Manage Accounts Actions cells should use normal table positioning.

Also define:

- A minimum width for the account table.
- A minimum width for the Actions column.
- `white-space: nowrap` for the button group.
- Normal horizontal scrolling on the table container.
- Correct focus visibility for action buttons after scrolling.

Test at:

- Desktop modal width
- 1024 px tablet width
- 768 px width
- 640 px phone width
- Dark and light themes

### Completion Criteria

- Account action buttons move with the table instead of remaining stuck.
- No action button covers Role, Account, Usage, Last Login, or Last Activity.
- Header/body alignment remains correct across responsive widths.
- The Vessel table's intended sticky behavior is unchanged.

---

## Phase 6 — Improve Recent Activity Presentation

### Files

- `public/index.html`
- `public/js/app.js`
- `public/css/style.css`

Changes:

- Rename `User` to `Performed By`.
- Display username prominently and display name as secondary text.
- Add `Affected Account`.
- Render `actionLabel`, not raw `action`.
- Replace the free-text technical action filter with a controlled Action dropdown.
- Keep Method and Route behind a Details expander or tooltip so technical fields do not dominate the table.
- Show a clear empty state when filters return no activity.
- Ensure actor/target information is readable without relying on color.

Recommended primary row format:

```text
24-Aug-2026 14:30 | ui-superadmin (Superadmin) | Reset password | somchai.viewer (Somchai) | Success
```

### Accessibility

- Buttons and filters must be keyboard accessible.
- Sticky/scrolled content must preserve a visible focus indicator.
- Use semantic table headers with correct scope.
- Do not communicate Success/Failure using color alone.
- Provide full text through accessible labels when content is visually shortened.

---

## 7. Automated Tests

### Account Search

- Search matches username.
- Search matches display name.
- Search is case-insensitive on SQLite and PostgreSQL.
- Search combines correctly with Role and Usage Status.
- Non-Superadmin search receives `403`.
- Invalid or oversized search input receives `400`.

### Actor and Target

- Create Account records the Superadmin actor and newly created target.
- Edit Account records actor and target.
- Reset Password records actor and target without any password data.
- Deactivate Account records actor and target.
- Self-service actions have no target or use the actor as the target according to the documented convention.
- Renaming an account does not change historical target snapshots.

### Activity Labels

- Known domain codes return the expected `actionLabel`.
- Historical `GET_API_*` codes receive readable labels.
- Unknown codes use a safe readable fallback.
- The API never returns credentials, tokens, cookies, or request bodies.
- One successful request creates exactly one activity event.

### Table Behavior

- Manage Accounts receives its own table class/id.
- Global sticky Actions CSS no longer applies to the Accounts table.
- Vessel Actions remain sticky if still required.
- Account action buttons remain reachable after horizontal scrolling.

---

## 8. Priority and Execution Order

```text
1. Add target-account fields to user_activity_events.
2. Add safe server-side account search.
3. Define domain activity codes and readable labels.
4. Add explicit actor/target metadata for account-management actions.
5. Prevent duplicate generic and domain activity events.
6. Update activity-event API response and filters.
7. Scope sticky Actions CSS to the Vessel table only.
8. Add Account search and Clear Filters controls.
9. Redesign Recent Activity columns and action filter.
10. Add backend, API, UI, security, and responsive regression tests.
11. Update OpenAPI and activity documentation.
12. Verify in staging using Superadmin and non-Superadmin accounts.
```

---

## 9. Definition of Done

- Superadmin can find a specific account by username or display name.
- Recent Activity clearly identifies the actor.
- Account-management events clearly identify the affected account.
- Edit, Reset Password, and Deactivate scroll normally with the Manage Accounts table.
- Account action buttons never overlap account-data columns.
- Raw `GET_API_*` values are not displayed as primary UI text.
- Existing historical activity receives readable labels.
- Each successful request produces no more than one activity event.
- Passwords, password hashes, tokens, cookies, and request bodies never enter activity storage or responses.
- All Manage Accounts and activity endpoints remain Superadmin-only.
- Automated tests and responsive UI verification pass before deployment.
