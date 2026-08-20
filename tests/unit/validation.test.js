const {
  checkAtdPlausibility,
  checkPasswordRequirements,
  isPasswordChecklistValid,
} = require('../../public/js/validation');

describe('validation', () => {
  describe('checkAtdPlausibility()', () => {
    it('returns null for a normal early departure (a few hours before ETD)', () => {
      const eta = new Date(2026, 6, 20, 8, 0);
      const etd = new Date(2026, 6, 24, 14, 0);
      const atd = new Date(2026, 6, 24, 12, 0);
      expect(checkAtdPlausibility(eta, etd, atd)).toBeNull();
    });

    it('returns null for a normal late departure (a few hours after ETD)', () => {
      const eta = new Date(2026, 6, 20, 8, 0);
      const etd = new Date(2026, 6, 24, 14, 0);
      const atd = new Date(2026, 6, 24, 18, 0);
      expect(checkAtdPlausibility(eta, etd, atd)).toBeNull();
    });

    it('warns on a year typo (ATD ~365 days off from ETD)', () => {
      const eta = new Date(2025, 6, 20, 8, 0);
      const etd = new Date(2026, 6, 24, 14, 0);
      const atd = new Date(2025, 6, 24, 14, 0);
      const warning = checkAtdPlausibility(eta, etd, atd);
      expect(warning).not.toBeNull();
      expect(warning).toMatch(/before ETD/);
    });

    it('warns when ATD is before ETA (departed before arriving)', () => {
      const eta = new Date(2026, 6, 20, 8, 0);
      const etd = new Date(2026, 6, 24, 14, 0);
      const atd = new Date(2026, 6, 18, 8, 0);
      const warning = checkAtdPlausibility(eta, etd, atd);
      expect(warning).not.toBeNull();
      expect(warning).toMatch(/before ETA/);
    });

    it('returns null when ATD is missing', () => {
      const eta = new Date(2026, 6, 20, 8, 0);
      const etd = new Date(2026, 6, 24, 14, 0);
      expect(checkAtdPlausibility(eta, etd, null)).toBeNull();
      expect(checkAtdPlausibility(eta, etd, '')).toBeNull();
    });

    it('returns null when ETD is missing', () => {
      const eta = new Date(2026, 6, 20, 8, 0);
      const atd = new Date(2026, 6, 24, 12, 0);
      expect(checkAtdPlausibility(eta, null, atd)).toBeNull();
      expect(checkAtdPlausibility(eta, '', atd)).toBeNull();
    });

    it('still checks the ETD bound when ETA is missing', () => {
      const etd = new Date(2026, 6, 24, 14, 0);
      const atd = new Date(2025, 6, 24, 14, 0);
      const warning = checkAtdPlausibility(null, etd, atd);
      expect(warning).not.toBeNull();
      expect(warning).toMatch(/before ETD/);
    });

    it('returns null for unparseable dates', () => {
      expect(checkAtdPlausibility('not-a-date', 'not-a-date', 'not-a-date')).toBeNull();
    });
  });

  describe('password checklist', () => {
    it('marks every requirement complete for a valid matching password', () => {
      const checks = checkPasswordRequirements('secure1!', 'secure1!');
      expect(Object.values(checks).every(Boolean)).toBe(true);
      expect(isPasswordChecklistValid('secure1!', 'secure1!')).toBe(true);
    });

    it('reports individual missing requirements and mismatched confirmation', () => {
      const checks = checkPasswordRequirements('PASSWORD', 'different');
      expect(checks.length).toBe(true);
      expect(checks.lowercase).toBe(false);
      expect(checks.number).toBe(false);
      expect(checks.special).toBe(false);
      expect(checks.noWhitespace).toBe(true);
      expect(checks.matches).toBe(false);
    });
  });
});
