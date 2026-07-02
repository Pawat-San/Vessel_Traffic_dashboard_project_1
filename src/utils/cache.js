const NodeCache = require('node-cache');
const logger = require('./logger');

// Standard TTL is 30 seconds for vessels, 5 minutes for terminals
const cache = new NodeCache({
  stdTTL: 30,
  checkperiod: 60,
});

// Attach logging listeners for debugging cache health
cache.on('expired', (key) => {
  logger.debug(`Cache key expired: ${key}`);
});

module.exports = cache;
