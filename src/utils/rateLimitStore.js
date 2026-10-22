const crypto = require('crypto');
const database = require('../database/knex');

function key(scope, value) {
  return crypto.createHash('sha256').update(JSON.stringify([scope, value])).digest('hex');
}

// A fixed-window atomic upsert works across all instances sharing the database.
// Expired windows reset on access; cleanup removes unused expired rows.
async function consume(scope, value, max, windowMs, now = Date.now()) {
  const db = database.db;
  const [row] = await db('security_rate_limits')
    .insert({ key: key(scope, value), attempts: 1, expires_at: now + windowMs })
    .onConflict('key').merge({
      attempts: db.raw('CASE WHEN ??.?? <= ? THEN 1 ELSE ??.?? + 1 END', [
        'security_rate_limits', 'expires_at', now, 'security_rate_limits', 'attempts',
      ]),
      expires_at: db.raw('CASE WHEN ??.?? <= ? THEN ? ELSE ??.?? END', [
        'security_rate_limits', 'expires_at', now, now + windowMs, 'security_rate_limits', 'expires_at',
      ]),
    }).returning(['attempts', 'expires_at']);
  return {
    allowed: Number(row.attempts) <= max,
    retryAfter: Math.max(1, Math.ceil((Number(row.expires_at) - now) / 1000)),
    expiresAt: Number(row.expires_at),
  };
}

async function release(scope, value, expiresAt) {
  return database.db('security_rate_limits')
    .where({ key: key(scope, value), expires_at: expiresAt })
    .where('attempts', '>', 0).decrement('attempts', 1);
}

async function cleanup(now = Date.now()) {
  return database.db('security_rate_limits').where('expires_at', '<=', now).del();
}

module.exports = { consume, release, cleanup };
