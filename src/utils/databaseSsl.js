const fs = require('fs');

module.exports = function databaseSsl(enabled, caFile, verify = true) {
  if (!enabled) return false;
  return {
    rejectUnauthorized: verify,
    ...(caFile ? { ca: fs.readFileSync(caFile, 'utf8') } : {}),
  };
};
