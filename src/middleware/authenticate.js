const jwt = require('jsonwebtoken');
const config = require('../config');
const { AuthenticationError } = require('../utils/errors');

/**
 * JWT authentication middleware
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthenticationError('Authentication token is missing or malformed'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    
    // Attach decoded user payload to request
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      displayName: decoded.displayName,
    };
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new AuthenticationError('Authentication token has expired'));
    }
    return next(new AuthenticationError('Authentication token is invalid'));
  }
}

module.exports = authenticate;
