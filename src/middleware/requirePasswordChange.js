const authRepository = require('../modules/auth/auth.repository');
const { PasswordChangeRequiredError } = require('../utils/errors');

// Paths that must stay reachable even while a forced password change is pending.
const ALLOWED_WHEN_LOCKED = [
  { method: 'POST', prefix: '/api/users/me/change-password' },
  { method: 'POST', prefix: '/api/auth/logout' },
];

function isAllowedWhenLocked(req) {
  return ALLOWED_WHEN_LOCKED.some(
    (entry) => req.method === entry.method && req.originalUrl.startsWith(entry.prefix)
  );
}

/**
 * Blocks access to everything except a small allowlist of routes until the
 * authenticated user has cleared a forced password change. Re-reads the flag
 * from the database on every request (not from the JWT payload) since an
 * admin-initiated reset can happen at any point during an already-issued
 * access token's lifetime.
 */
async function requirePasswordChange(req, res, next) {
  try {
    if (!req.user) {
      return next();
    }

    if (isAllowedWhenLocked(req)) {
      return next();
    }

    const freshUser = await authRepository.findById(req.user.id);
    if (freshUser && freshUser.must_change_password) {
      return next(new PasswordChangeRequiredError());
    }

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = requirePasswordChange;
