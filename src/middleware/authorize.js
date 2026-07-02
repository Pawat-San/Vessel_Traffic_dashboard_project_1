const { AuthorizationError, AuthenticationError } = require('../utils/errors');

/**
 * Role-Based Access Control (RBAC) authorization middleware
 * @param {string[]} allowedRoles - List of roles permitted to access this resource
 */
function authorize(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return next(new AuthorizationError('You do not have permission to perform this action'));
    }

    next();
  };
}

module.exports = authorize;
