const {
  PASSWORD_POLICY_CODES,
  getPasswordPolicyErrors,
  validatePasswordStrength,
  isPasswordExpired,
} = require('../../src/utils/passwordPolicy');

function errorCodes(password) {
  return getPasswordPolicyErrors(password).map((error) => error.code);
}

describe('passwordPolicy', () => {
  describe('password strength', () => {
    it('accepts a password that satisfies every requirement', () => {
      expect(validatePasswordStrength('secure1!')).toBe(true);
    });

    it.each([
      ['short1!', PASSWORD_POLICY_CODES.TOO_SHORT],
      ['12345678!', PASSWORD_POLICY_CODES.REQUIRES_LOWERCASE],
      ['password!', PASSWORD_POLICY_CODES.REQUIRES_NUMBER],
      ['password1', PASSWORD_POLICY_CODES.REQUIRES_SPECIAL],
      ['pass word1!', PASSWORD_POLICY_CODES.CONTAINS_WHITESPACE],
    ])('rejects %s with %s', (password, expectedCode) => {
      expect(errorCodes(password)).toContain(expectedCode);
    });

    it('rejects passwords longer than 100 characters', () => {
      expect(errorCodes(`a1!${'x'.repeat(98)}`)).toContain(PASSWORD_POLICY_CODES.TOO_LONG);
    });
  });

  describe('password expiration', () => {
    const now = new Date('2026-08-20T00:00:00.000Z');

    it('does not expire a password at 89 days', () => {
      const changedAt = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000);
      expect(isPasswordExpired(changedAt, 90, now)).toBe(false);
    });

    it('expires a password at exactly 90 days', () => {
      const changedAt = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      expect(isPasswordExpired(changedAt, 90, now)).toBe(true);
    });

    it('fails closed for null or invalid timestamps', () => {
      expect(isPasswordExpired(null, 90, now)).toBe(true);
      expect(isPasswordExpired('not-a-date', 90, now)).toBe(true);
    });
  });
});
