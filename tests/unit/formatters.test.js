const { formatDateTime, formatFullDate, formatClockTime } = require('../../public/js/formatters');

describe('formatters', () => {
  describe('formatDateTime()', () => {
    it('returns "-" for null/empty input', () => {
      expect(formatDateTime(null)).toBe('-');
      expect(formatDateTime('')).toBe('-');
    });

    it('returns "-" for an unparseable date', () => {
      expect(formatDateTime('not-a-date')).toBe('-');
    });

    // Constructed via the local-time Date constructor (not a parsed ISO
    // string) so the expected hour is deterministic regardless of the
    // machine/CI timezone running the test.
    it('renders midnight as 00:00, not 12:00 AM', () => {
      const midnight = new Date(2026, 6, 24, 0, 0);
      expect(formatDateTime(midnight)).toBe('24-Jul-2026 00:00');
    });

    it('renders noon as 12:00', () => {
      const noon = new Date(2026, 6, 24, 12, 0);
      expect(formatDateTime(noon)).toBe('24-Jul-2026 12:00');
    });

    it('renders 1pm as 13:00 (24-hour, no AM/PM)', () => {
      const onePm = new Date(2026, 6, 24, 13, 0);
      expect(formatDateTime(onePm)).toBe('24-Jul-2026 13:00');
    });
  });

  describe('formatFullDate()', () => {
    it('zero-pads single-digit days', () => {
      expect(formatFullDate(new Date(2026, 6, 4))).toBe('04-July-2026');
    });

    it('uses the full English month name regardless of locale', () => {
      expect(formatFullDate(new Date(2026, 6, 24))).toBe('24-July-2026');
    });

    it('handles the year boundary correctly', () => {
      expect(formatFullDate(new Date(2025, 11, 31))).toBe('31-December-2025');
      expect(formatFullDate(new Date(2026, 0, 1))).toBe('01-January-2026');
    });
  });

  describe('formatClockTime()', () => {
    it('renders 24-hour HH:mm:ss with no AM/PM', () => {
      expect(formatClockTime(new Date(2026, 6, 24, 0, 5, 9))).toBe('00:05:09');
      expect(formatClockTime(new Date(2026, 6, 24, 13, 30, 45))).toBe('13:30:45');
      expect(formatClockTime(new Date(2026, 6, 24, 23, 59, 59))).toBe('23:59:59');
    });
  });
});
