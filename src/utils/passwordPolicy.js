const PASSWORD_POLICY_CODES = {
  TOO_SHORT: 'PASSWORD_TOO_SHORT',
  TOO_LONG: 'PASSWORD_TOO_LONG',
  REQUIRES_LOWERCASE: 'PASSWORD_REQUIRES_LOWERCASE',
  REQUIRES_NUMBER: 'PASSWORD_REQUIRES_NUMBER',
  REQUIRES_SPECIAL: 'PASSWORD_REQUIRES_SPECIAL',
  CONTAINS_WHITESPACE: 'PASSWORD_CONTAINS_WHITESPACE',
};

const PASSWORD_POLICY_MESSAGES = {
  [PASSWORD_POLICY_CODES.TOO_SHORT]: 'Password must be at least 8 characters',
  [PASSWORD_POLICY_CODES.TOO_LONG]: 'Password must be at most 100 characters',
  [PASSWORD_POLICY_CODES.REQUIRES_LOWERCASE]: 'Password must contain at least one lowercase letter',
  [PASSWORD_POLICY_CODES.REQUIRES_NUMBER]: 'Password must contain at least one number',
  [PASSWORD_POLICY_CODES.REQUIRES_SPECIAL]: 'Password must contain at least one special character',
  [PASSWORD_POLICY_CODES.CONTAINS_WHITESPACE]: 'Password must not contain whitespace',
};

function getPasswordPolicyErrors(password) {
  const value = typeof password === 'string' ? password : '';
  const codes = [];

  if (value.length < 8) codes.push(PASSWORD_POLICY_CODES.TOO_SHORT);
  if (value.length > 100) codes.push(PASSWORD_POLICY_CODES.TOO_LONG);
  if (!/[a-z]/.test(value)) codes.push(PASSWORD_POLICY_CODES.REQUIRES_LOWERCASE);
  if (!/[0-9]/.test(value)) codes.push(PASSWORD_POLICY_CODES.REQUIRES_NUMBER);
  if (!/[^A-Za-z0-9\s]/.test(value)) codes.push(PASSWORD_POLICY_CODES.REQUIRES_SPECIAL);
  if (/\s/.test(value)) codes.push(PASSWORD_POLICY_CODES.CONTAINS_WHITESPACE);

  return codes.map((code) => ({ code, message: PASSWORD_POLICY_MESSAGES[code] }));
}

function validatePasswordStrength(password) {
  return getPasswordPolicyErrors(password).length === 0;
}

function isPasswordExpired(passwordChangedAt, maxAgeDays = 90, now = new Date()) {
  if (!passwordChangedAt) return true;

  const changedAt = new Date(passwordChangedAt);
  if (Number.isNaN(changedAt.getTime())) return true;

  const days = Number(maxAgeDays);
  if (!Number.isFinite(days) || days <= 0) return true;

  const expiresAt = changedAt.getTime() + days * 24 * 60 * 60 * 1000;
  return now.getTime() >= expiresAt;
}

module.exports = {
  PASSWORD_POLICY_CODES,
  PASSWORD_POLICY_MESSAGES,
  getPasswordPolicyErrors,
  validatePasswordStrength,
  isPasswordExpired,
};
