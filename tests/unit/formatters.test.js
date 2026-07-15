const { formatDateTime, formatDateTimeLines, formatDateTimeShort, formatFullDate, formatClockTime, toISOFromParts, partsFromISO } = require('../../public/js/formatters');

describe('formatters', () => {
  describe('formatDateTimeLines()', () => {
    it('returns a dash date and empty time for null/invalid input', () => {
      expect(formatDateTimeLines(null)).toEqual({ date: '-', time: '' });
      expect(formatDateTimeLines('not-a-date')).toEqual({ date: '-', time: '' });
    });

    it('splits a valid instant into separate date and time strings', () => {
      const d = new Date(2026, 6, 24, 14, 30);
      expect(formatDateTimeLines(d)).toEqual({ date: '24-Jul-2026', time: '14:30' });
    });
  });

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

    // F14 regression guard: the main table's short (no-year) format must
    // come from a SEPARATE function (formatDateTimeShort). If a future edit
    // strips the year from formatDateTime/formatDateTimeLines directly
    // instead, the archive table and CSV export would silently lose it too.
    it('still includes the year (archive/CSV depend on this)', () => {
      const d = new Date(2026, 6, 24, 14, 30);
      expect(formatDateTime(d)).toContain('2026');
      expect(formatDateTimeLines(d).date).toContain('2026');
    });
  });

  describe('formatDateTimeShort()', () => {
    it('returns a dash date and empty time for null/invalid input', () => {
      expect(formatDateTimeShort(null)).toEqual({ date: '-', time: '' });
      expect(formatDateTimeShort('not-a-date')).toEqual({ date: '-', time: '' });
    });

    it('drops the year and uppercases the month', () => {
      const d = new Date(2026, 6, 24, 14, 30);
      expect(formatDateTimeShort(d)).toEqual({ date: '24 JUL', time: '14:30' });
    });

    it('zero-pads a single-digit day', () => {
      const d = new Date(2026, 6, 6, 9, 5);
      expect(formatDateTimeShort(d)).toEqual({ date: '06 JUL', time: '09:05' });
    });

    it('never contains a 4-digit year', () => {
      const d = new Date(2026, 6, 24, 14, 30);
      expect(formatDateTimeShort(d).date).not.toMatch(/\d{4}/);
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

  // toISOFromParts/partsFromISO back the custom date + hour-select +
  // minute-select picker that replaced the native datetime-local input
  // (whose AM/PM-vs-24h rendering follows the browser/OS locale and can't be
  // forced). Both are compared against independently-constructed local Date
  // objects rather than hardcoded UTC strings, so the tests are correct
  // regardless of the machine/CI timezone running them.
  describe('toISOFromParts()', () => {
    it('combines 1-12 month + day/hour/minute into an ISO string (local time)', () => {
      // month is passed as 1-12 (matching <input type="date"> convention);
      // this proves the -1 conversion to the 0-11 Date constructor is correct.
      const expected = new Date(2026, 6, 24, 14, 30).toISOString();
      expect(toISOFromParts(2026, 7, 24, 14, 30)).toBe(expected);
    });

    it('handles midnight and single-digit hour/minute/day/month', () => {
      const expected = new Date(2026, 0, 4, 0, 5).toISOString();
      expect(toISOFromParts(2026, 1, 4, 0, 5)).toBe(expected);
    });
  });

  describe('partsFromISO()', () => {
    it('returns null for empty/invalid input', () => {
      expect(partsFromISO(null)).toBeNull();
      expect(partsFromISO('')).toBeNull();
      expect(partsFromISO('not-a-date')).toBeNull();
    });

    it('splits an ISO instant into zero-padded local date/hour/minute parts', () => {
      const iso = new Date(2026, 0, 4, 5, 9).toISOString();
      expect(partsFromISO(iso)).toEqual({ dateValue: '2026-01-04', hour: '05', minute: '09' });
    });

    it('round-trips through toISOFromParts (proves the split uses local time, not a raw UTC substring)', () => {
      // The bug this replaces: slicing the raw ISO string directly (e.g.
      // isoStr.substring(0, 16)) shows the UTC clock time as-is, which is
      // wrong for any user not in UTC+0. Going through Date's local getters
      // instead means this round-trip holds in every timezone.
      const iso = toISOFromParts(2026, 7, 24, 14, 30);
      expect(partsFromISO(iso)).toEqual({ dateValue: '2026-07-24', hour: '14', minute: '30' });
    });
  });
});
