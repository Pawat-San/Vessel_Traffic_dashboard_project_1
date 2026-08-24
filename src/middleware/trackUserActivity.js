const userActivityService = require('../modules/users/userActivity.service');
const { getActionCode } = require('../utils/activityCatalog');

function normalizeRoute(req) {
  const route = req.route && req.route.path
    ? `${req.baseUrl || ''}${req.route.path}`
    : (req.baseUrl || req.path || '/');
  const normalized = route.length > 1 ? route.replace(/\/+$/, '') : route;
  return normalized.slice(0, 255);
}

function trackUserActivity(req, res) {
  res.once('finish', () => {
    if (!req.user || res.statusCode < 200 || res.statusCode >= 400) return;
    const routeTemplate = normalizeRoute(req);
    const explicit = res.locals.activity || {};
    void userActivityService.recordRequestActivity(req.user, {
      action: explicit.action || getActionCode(req.method, routeTemplate),
      http_method: req.method,
      route_template: routeTemplate,
      response_status: res.statusCode,
      ip_address: req.ip,
      user_agent: req.get('user-agent') || null,
      target_user_id: explicit.targetUserId || null,
      target_username_snapshot: explicit.targetUsername || null,
      target_display_name_snapshot: explicit.targetDisplayName || null,
      occurred_at: new Date().toISOString(),
    });
  });
}

module.exports = trackUserActivity;
