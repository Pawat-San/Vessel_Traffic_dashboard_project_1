/**
 * Dependency-free date formatting helpers.
 *
 * No `window`/`document`/`fetch` reference at load time, unlike utils.js --
 * that's what lets this module be `require()`'d directly from Jest (which
 * runs testEnvironment: 'node', no jsdom) while also working as a plain
 * <script> in the browser via the UMD-style export at the bottom.
 */

/**
 * Split an ISO datetime string into separate date/time strings for
 * two-line table display. Example: 2026-07-24T14:30:00.000Z ->
 * { date: '24-Jul-2026', time: '14:30' } (local time, 24h).
 * Empty/invalid input returns { date: '-', time: '' }.
 */
function formatDateTimeLines(isoString) {
  if (!isoString) return { date: '-', time: '' };
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return { date: '-', time: '' };

  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return { date: `${day}-${month}-${year}`, time: `${hours}:${minutes}` };
}

/**
 * Format an ISO datetime string for single-line table/list display.
 * Example: 2026-07-24T14:30:00.000Z -> 24-Jul-2026 14:30 (local time, 24h)
 */
function formatDateTime(isoString) {
  const { date, time } = formatDateTimeLines(isoString);
  return time ? `${date} ${time}` : date;
}

/**
 * Format a Date as a full date string for the dashboard header.
 * Example: 2026-07-24 -> 04-July-2026 (day always zero-padded, full English month name)
 */
function formatFullDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const month = months[d.getMonth()];
  return `${day}-${month}-${d.getFullYear()}`;
}

/**
 * Format a Date as a 24-hour HH:mm:ss clock string (local time).
 */
function formatClockTime(date) {
  const d = new Date(date);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Combine separate date-picker + hour-select + minute-select values into an
 * ISO datetime string, treating the parts as local time (mirrors the
 * semantics of `new Date('YYYY-MM-DDTHH:mm').toISOString()` used previously
 * with a single <input type="datetime-local">).
 *
 * @param {number} year
 * @param {number} month 1-12 (matches <input type="date"> convention, unlike
 *   the native Date constructor which wants 0-11)
 * @param {number} day
 * @param {number} hour 0-23
 * @param {number} minute 0-59
 */
function toISOFromParts(year, month, day, hour, minute) {
  const d = new Date(year, month - 1, day, hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * Split an ISO datetime string into local-time date/hour/minute parts for
 * populating a date input + hour/minute selects. Returns null for empty or
 * invalid input.
 *
 * Deliberately goes through a real Date object (local getters) rather than
 * slicing the raw ISO string -- slicing would show the UTC clock time as-is,
 * which is wrong for any user not in UTC+0.
 */
function partsFromISO(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');

  return { dateValue: `${year}-${month}-${day}`, hour, minute };
}

const formatters = { formatDateTime, formatDateTimeLines, formatFullDate, formatClockTime, toISOFromParts, partsFromISO };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = formatters;
} else {
  (typeof window !== 'undefined' ? window : globalThis).formatters = formatters;
}
