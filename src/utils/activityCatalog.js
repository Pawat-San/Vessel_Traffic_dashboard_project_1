const ACTION_LABELS = Object.freeze({
  AUTH_LOGIN: 'Logged in',
  AUTH_LOGOUT: 'Logged out',
  AUTH_REFRESH: 'Refreshed session',
  PASSWORD_SELF_CHANGED: 'Changed own password',
  DASHBOARD_VIEWED: 'Viewed vessel dashboard',
  TERMINALS_VIEWED: 'Viewed terminals',
  ACCOUNT_LIST_VIEWED: 'Viewed account list',
  ACCOUNT_DETAILS_VIEWED: 'Viewed account details',
  ACCOUNT_CREATED: 'Created account',
  ACCOUNT_UPDATED: 'Updated account',
  ACCOUNT_DEACTIVATED: 'Deactivated account',
  ACCOUNT_PASSWORD_RESET: 'Reset password',
  ACTIVITY_REPORT_VIEWED: 'Viewed activity report',
  VESSEL_CREATED: 'Created vessel',
  VESSEL_UPDATED: 'Updated vessel',
  VESSEL_DELETED: 'Deleted vessel',
  VESSEL_IMPORTED: 'Imported vessels',
  VESSEL_ARCHIVED: 'Archived vessels',
  ARCHIVE_VIEWED: 'Viewed vessel archive',
  ARCHIVE_PURGED: 'Purged vessel archive',
});

const ROUTE_ACTIONS = Object.freeze({
  'GET /api/vessels': 'DASHBOARD_VIEWED',
  'POST /api/vessels': 'VESSEL_CREATED',
  'PUT /api/vessels/:id': 'VESSEL_UPDATED',
  'DELETE /api/vessels/:id': 'VESSEL_DELETED',
  'POST /api/vessels/import': 'VESSEL_IMPORTED',
  'POST /api/vessels/archive': 'VESSEL_ARCHIVED',
  'GET /api/terminals': 'TERMINALS_VIEWED',
  'GET /api/archive': 'ARCHIVE_VIEWED',
  'POST /api/archive/purge': 'ARCHIVE_PURGED',
  'GET /api/users': 'ACCOUNT_LIST_VIEWED',
  'GET /api/users/:id': 'ACCOUNT_DETAILS_VIEWED',
  'GET /api/users/activity-summary': 'ACTIVITY_REPORT_VIEWED',
  'GET /api/users/activity-events': 'ACTIVITY_REPORT_VIEWED',
  'GET /api/users/:id/activity-events': 'ACTIVITY_REPORT_VIEWED',
  'POST /api/users/me/change-password': 'PASSWORD_SELF_CHANGED',
  'POST /api/auth/logout': 'AUTH_LOGOUT',
});

const LEGACY_ACTION_LABELS = Object.freeze({
  GET_API_VESSELS: 'Viewed vessel dashboard',
  GET_API_TERMINALS: 'Viewed terminals',
  GET_API_ARCHIVE: 'Viewed vessel archive',
  GET_API_USERS: 'Viewed account list',
  GET_API_USERS_ACTIVITY_SUMMARY: 'Viewed activity report',
  GET_API_USERS_ACTIVITY_EVENTS: 'Viewed activity report',
});

function fallbackAction(method, routeTemplate) {
  return `${method}_${routeTemplate}`
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toUpperCase()
    .slice(0, 120);
}

function getActionCode(method, routeTemplate) {
  return ROUTE_ACTIONS[`${method} ${routeTemplate}`] || fallbackAction(method, routeTemplate);
}

function humanizeCode(action) {
  const words = String(action || 'Activity')
    .replace(/^(GET|POST|PUT|PATCH|DELETE)_API_/, '')
    .split('_')
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  if (words.length === 0) return 'Activity';
  const label = words.join(' ');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function getActionLabel(action) {
  return ACTION_LABELS[action] || LEGACY_ACTION_LABELS[action] || humanizeCode(action);
}

module.exports = {
  ACTION_LABELS,
  getActionCode,
  getActionLabel,
};
