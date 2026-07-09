/**
 * Dependency-free date formatting helpers.
 *
 * No `window`/`document`/`fetch` reference at load time, unlike utils.js --
 * that's what lets this module be `require()`'d directly from Jest (which
 * runs testEnvironment: 'node', no jsdom) while also working as a plain
 * <script> in the browser via the UMD-style export at the bottom.
 */

/**
 * Format an ISO datetime string for table/list display.
 * Example: 2026-07-24T14:30:00.000Z -> 24-Jul-2026 14:30 (local time, 24h)
 */
function formatDateTime(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '-';

  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return `${day}-${month}-${year} ${hours}:${minutes}`;
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

const formatters = { formatDateTime, formatFullDate, formatClockTime };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = formatters;
} else {
  (typeof window !== 'undefined' ? window : globalThis).formatters = formatters;
}
