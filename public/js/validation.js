/**
 * Dependency-free vessel-form validation helpers.
 *
 * No `window`/`document`/`fetch` reference at load time, unlike utils.js --
 * that's what lets this module be `require()`'d directly from Jest (which
 * runs testEnvironment: 'node', no jsdom) while also working as a plain
 * <script> in the browser via the UMD-style export at the bottom.
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Non-blocking typo safeguard for ATD (F23). ATD is never compared against
 * ETD as a hard rule (see validateScheduleOrder in app.js) since an early or
 * late departure is a normal operational outcome, not an error. But an
 * implausible ATD -- one that is physically impossible (before the vessel
 * even arrived) or wildly far from the plan (a wrong year/month) -- is much
 * more likely a typo. Returns a warning message string, or null when the
 * value looks plausible or there isn't enough data to judge.
 *
 * Deliberately requires both `etd` and `atd` -- ETD is the reference point
 * for every check here, so without it there is nothing to compare against.
 */
function checkAtdPlausibility(eta, etd, atd) {
  if (!etd || !atd) return null;

  const etdDate = new Date(etd);
  const atdDate = new Date(atd);
  if (isNaN(etdDate.getTime()) || isNaN(atdDate.getTime())) return null;

  if (eta) {
    const etaDate = new Date(eta);
    if (!isNaN(etaDate.getTime()) && atdDate < etaDate) {
      const days = Math.round((etaDate - atdDate) / ONE_DAY_MS);
      return `ATD is ${days} day${days === 1 ? '' : 's'} before ETA -- a vessel cannot depart before it has even arrived. Please confirm this is correct.`;
    }
  }

  const diffDays = Math.round((atdDate - etdDate) / ONE_DAY_MS);
  if (Math.abs(diffDays) > 30) {
    const direction = diffDays < 0 ? 'before' : 'after';
    return `ATD is ${Math.abs(diffDays)} days ${direction} ETD -- please confirm this is correct.`;
  }

  return null;
}

const validation = { checkAtdPlausibility };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = validation;
} else {
  (typeof window !== 'undefined' ? window : globalThis).validation = validation;
}
