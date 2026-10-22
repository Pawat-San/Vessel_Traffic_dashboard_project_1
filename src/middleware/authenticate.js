const { verifyToken } = require('../utils/tokens');
const authRepository = require('../modules/auth/auth.repository');
const { isPasswordExpired } = require('../utils/passwordPolicy');
const config = require('../config');
const { AuthenticationError, PasswordChangeRequiredError } = require('../utils/errors');
const trackUserActivity = require('./trackUserActivity');

/**
 * JWT authentication middleware
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthenticationError('Authentication token is missing or malformed'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    const user = await authRepository.findById(decoded.id);
    if (!user || !user.is_active || user.session_version !== decoded.sessionVersion) {
      return next(new AuthenticationError('Session has been revoked. Please log in again.'));
    }
    const passwordExpired = isPasswordExpired(user.password_changed_at, config.password.maxAgeDays);
    const allowed = req.method === 'POST' && [
      '/api/users/me/change-password', '/api/auth/logout',
    ].includes(req.originalUrl.split('?')[0]);
    if ((user.must_change_password || passwordExpired || decoded.type === 'password-change') && !allowed) {
      return next(new PasswordChangeRequiredError(undefined, { passwordExpired }));
    }
    
    // Attach decoded user payload to request
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name,
      sessionVersion: user.session_version,
      tokenType: decoded.type,
    };
    req.authUser = user;

    // Register once, after JWT verification. The listener records only
    // successful responses and never blocks the primary API operation.
    trackUserActivity(req, res);
    next();
  } catch (error) {
    if (!['TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError'].includes(error.name)
        && error.message !== 'Invalid token claims') return next(error);
    if (error.name === 'TokenExpiredError') {
      return next(new AuthenticationError('Authentication token has expired'));
    }
    return next(new AuthenticationError('Authentication token is invalid'));
  }
}

module.exports = authenticate;
