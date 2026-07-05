const argon2 = require('@node-rs/argon2');
const bcrypt = require('bcryptjs');
const config = require('../config');

const BCRYPT_PREFIX_RE = /^\$2[aby]?\$/;

// Lower Argon2 cost in tests so the suite doesn't slow down on password hashing.
const HASH_OPTIONS = config.isTest
  ? { memoryCost: 8, timeCost: 2, parallelism: 1 }
  : undefined;

/**
 * Hash a plaintext password with Argon2id.
 * @param {string} plain
 * @returns {Promise<string>}
 */
async function hashPassword(plain) {
  return argon2.hash(plain, HASH_OPTIONS);
}

/**
 * Returns true if the stored hash looks like a legacy bcrypt hash.
 * @param {string} storedHash
 * @returns {boolean}
 */
function isLegacyHash(storedHash) {
  return BCRYPT_PREFIX_RE.test(storedHash || '');
}

/**
 * Verify a plaintext password against a stored hash, transparently supporting
 * both legacy bcrypt hashes and current Argon2id hashes.
 * @param {string} plain
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(plain, storedHash) {
  if (isLegacyHash(storedHash)) {
    return bcrypt.compare(plain, storedHash);
  }
  return argon2.verify(storedHash, plain);
}

module.exports = { hashPassword, verifyPassword, isLegacyHash };
