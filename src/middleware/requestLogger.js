const logger = require('../utils/logger');
const { v4: uuidv4 } = require('crypto'); // We can use standard crypto package or simple random generator

// Simple utility to generate quick request IDs if crypto is not imported
function generateRequestId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Request logging middleware measuring request execution times
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || generateRequestId();
  
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
