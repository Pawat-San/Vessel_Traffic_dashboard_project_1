const logger = require('../utils/logger');
const { randomUUID } = require('crypto');

// Simple utility to generate quick request IDs if crypto is not imported
function generateRequestId() {
  return randomUUID();
}

/**
 * Request logging middleware measuring request execution times
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  const supplied = req.headers['x-request-id'];
  const requestId = typeof supplied === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(supplied)
    ? supplied : generateRequestId();
  
  // Add request ID to headers
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Once request finishes, log details
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logDetails = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration, // in ms
      ip: req.ip,
      requestId,
      userId: req.user ? req.user.id : null,
      username: req.user ? req.user.username : null,
    };

    if (res.statusCode >= 500) {
      logger.error(`HTTP ${req.method} ${req.originalUrl} - ${res.statusCode}`, logDetails);
    } else if (res.statusCode >= 400) {
      logger.warn(`HTTP ${req.method} ${req.originalUrl} - ${res.statusCode}`, logDetails);
    } else {
      logger.info(`HTTP ${req.method} ${req.originalUrl} - ${res.statusCode}`, logDetails);
    }
  });

  next();
}

module.exports = requestLogger;
