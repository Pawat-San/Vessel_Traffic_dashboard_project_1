const config = require('../config');
const store = require('../utils/rateLimitStore');
const logger = require('../utils/logger');

// All instances share expiring counters in the application database.

/**
 * General API Rate Limiter Middleware
 */
async function apiRateLimiter(req, res, next) {
  if (req.path === '/health') return next();
  if (config.isTest) {
    return next(); // Disable rate limiter in test environment
  }

  try {
    const result = await store.consume('api-ip', req.ip, config.rateLimiter.max, config.rateLimiter.windowMs);
    if (!result.allowed) return reject(res, result.retryAfter);
    return next();
  } catch (error) {
    return unavailable(res, error);
  }
}

/**
 * Brute force protection middleware for Login route
 */
async function loginRateLimiter(req, res, next) {
  if (config.isTest) {
    return next(); // Disable lockout in tests
  }

  try {
    // Never let an unauthenticated caller lock a username across all networks.
    // Keep the per-IP ceiling as well to limit attempts across many usernames.
    const accountIp = JSON.stringify([req.ip, req.body.username]);
    const results = await Promise.all([
      store.consume('login-account-ip', accountIp, 5, 15 * 60 * 1000),
      store.consume('login-ip', req.ip, 100, 15 * 60 * 1000),
    ]);
    const blocked = results.find((result) => !result.allowed);
    const release = () => Promise.all([
      store.release('login-account-ip', accountIp, results[0].expiresAt),
      store.release('login-ip', req.ip, results[1].expiresAt),
    ]);
    if (blocked) {
      await release();
      return reject(res, blocked.retryAfter, 'ACCOUNT_LOCKED');
    }
    res.once('finish', () => {
      // Only invalid credentials count. Successful login, validation errors,
      // and infrastructure failures must never lock a user out.
      if (res.statusCode !== 401) release()
        .catch((error) => logger.error('Failed to release login reservation', { error: error.message }));
    });
    return next();
  } catch (error) {
    return unavailable(res, error);
  }
}

function scopedLimiter(scope, max, identity) {
  return async (req, res, next) => {
    if (config.isTest) return next();
    try {
      const result = await store.consume(scope, identity(req), max, 15 * 60 * 1000);
      if (!result.allowed) return reject(res, result.retryAfter);
      return next();
    } catch (error) {
      return unavailable(res, error);
    }
  };
}

function reject(res, retryAfter, code = 'RATE_LIMIT_EXCEEDED') {
  res.set('Retry-After', String(retryAfter));
  return res.status(429).json({ success: false, error: {
    code, message: 'Too many requests. Please try again later.',
    details: { retryAfterSeconds: retryAfter },
  } });
}

function unavailable(res, error) {
  logger.error('Rate limit store unavailable', { error: error.message });
  res.set('Retry-After', '30');
  return res.status(503).json({ success: false, error: {
    code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable. Please try again later.',
  } });
}

module.exports = {
  apiRateLimiter,
  loginRateLimiter,
  refreshRateLimiter: scopedLimiter('refresh-ip', 100, (req) => req.ip),
  passwordRateLimiter: scopedLimiter('password-account', 10, (req) => req.user.id),
};
