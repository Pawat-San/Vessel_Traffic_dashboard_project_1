const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');

const issuer = 'vessel-dashboard';
const audience = 'vessel-dashboard-web';

function signToken(user, type, absoluteExpiry) {
  return jwt.sign({
    id: user.id,
    sessionVersion: user.session_version,
    type,
    ...(absoluteExpiry ? { exp: absoluteExpiry } : {}),
  }, type === 'refresh' ? config.jwt.refreshSecret : config.jwt.secret, {
    algorithm: 'HS256', issuer, audience, jwtid: crypto.randomUUID(),
    ...(!absoluteExpiry ? { expiresIn: type === 'refresh' ? config.jwt.refreshExpiry
      : type === 'password-change' ? '10m' : config.jwt.accessExpiry } : {}),
  });
}

function verifyToken(token, refresh = false) {
  const payload = jwt.verify(token, refresh ? config.jwt.refreshSecret : config.jwt.secret, {
    algorithms: ['HS256'], issuer, audience,
  });
  if (!Number.isSafeInteger(payload.id) || !Number.isSafeInteger(payload.sessionVersion)
      || payload.sessionVersion < 1
      || !(refresh ? ['refresh'] : ['access', 'password-change']).includes(payload.type)) {
    throw new Error('Invalid token claims');
  }
  return payload;
}

module.exports = { signToken, verifyToken };
