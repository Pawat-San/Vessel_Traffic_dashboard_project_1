const { ValidationError } = require('../utils/errors');
const config = require('../config');

// In-memory store for general API rate limiting
const apiLimitStore = new Map();

// In-memory store for failed login attempts
// Keys: IP addresses, Values: { attempts: number, lockoutUntil: number }
const loginLimitStore = new Map();

/**
 * General API Rate Limiter Middleware
 */
function apiRateLimiter(req, res, next) {
  if (config.isTest) {
    return next(); // Disable rate limiter in test environment
  }

  const ip = req.ip;
  const now = Date.now();
  const windowMs = config.rateLimiter.windowMs;
  const max = config.rateLimiter.max;

  if (!apiLimitStore.has(ip)) {
    apiLimitStore.set(ip, []);
  }

  const timestamps = apiLimitStore.get(ip);
  
  // Filter out timestamps outside the sliding window
  const activeTimestamps = timestamps.filter((time) => now - time < windowMs);
  
  if (activeTimestamps.length >= max) {
    const errorDetails = {
      windowMs,
      max,
      retryAfter: Math.ceil((windowMs - (now - activeTimestamps[0])) / 1000),
    };
    return res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests from this IP. Please try again in ${errorDetails.retryAfter} seconds.`,
        details: errorDetails,
      }
    });
  }

  // Record this request
  activeTimestamps.push(now);
  apiLimitStore.set(ip, activeTimestamps);

  next();
}

/**
 * Brute force protection middleware for Login route
 */
function loginRateLimiter(req, res, next) {
  if (config.isTest) {
    return next(); // Disable lockout in tests
  }

  const ip = req.ip;
  const now = Date.now();
  const lockoutDuration = 15 * 60 * 1000; // 15 minutes lockout
  const maxFailedAttempts = 5;

  const record = loginLimitStore.get(ip);

  if (record && record.lockoutUntil && now < record.lockoutUntil) {
    const waitSeconds = Math.ceil((record.lockoutUntil - now) / 1000);
    const waitMinutes = Math.ceil(waitSeconds / 60);
    return res.status(429).json({
      success: false,
      error: {
        code: 'ACCOUNT_LOCKED',
        message: `Too many failed login attempts. Please try again after ${waitMinutes} minutes.`,
        details: { retryAfterSeconds: waitSeconds },
      }
    });
  }

  // Intercept response to watch for authentication outcome
  res.on('finish', () => {
    const currentRecord = loginLimitStore.get(ip) || { attempts: 0, lockoutUntil: 0 };
    
    if (res.statusCode === 401) {
      currentRecord.attempts += 1;
      if (currentRecord.attempts >= maxFailedAttempts) {
        currentRecord.lockoutUntil = Date.now() + lockoutDuration;
      }
      loginLimitStore.set(ip, currentRecord);
    } else if (res.statusCode === 200) {
      // Reset attempts on successful login
      loginLimitStore.delete(ip);
    }
  });

  next();
}

module.exports = {
  apiRateLimiter,
  loginRateLimiter,
};
