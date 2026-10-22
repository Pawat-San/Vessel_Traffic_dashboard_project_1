const config = require('../config');
const { AuthorizationError } = require('../utils/errors');

// Browser cookie endpoints accept only same-origin requests. Non-browser API
// clients without browser origin metadata remain supported.
module.exports = function authOrigin(req, res, next) {
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite === 'cross-site') return next(new AuthorizationError('Cross-site authentication is not allowed'));
  if (origin) {
    const ownOrigin = `${req.protocol}://${req.get('host')}`;
    if (origin !== ownOrigin && origin !== config.cors.origin) {
      return next(new AuthorizationError('Authentication origin is not allowed'));
    }
  }
  return next();
};
