const logger = require('../utils/logger');
const { error } = require('../utils/response');
const { AppError } = require('../utils/errors');

/**
 * Global Express Error Handler Middleware
 */
function errorHandler(err, req, res, next) {
  const isOperational = err.isOperational || false;
  const statusCode = err.statusCode || 500;
  const errorCode = err.code || 'INTERNAL_ERROR';
  const errorMessage = isOperational ? err.message : 'An unexpected error occurred on the server';
  const details = err.details || null;

  // Log error using Winston structured logger
  logger.error(err.message || 'Unhandled error', {
    code: errorCode,
    statusCode,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
    requestId: req.headers['x-request-id'],
    isOperational,
    stack: err.stack,
  });

  // Check if headers have already been sent
  if (res.headersSent) {
    return next(err);
  }

  res.status(statusCode).json(error(errorCode, errorMessage, details));
}

module.exports = errorHandler;
