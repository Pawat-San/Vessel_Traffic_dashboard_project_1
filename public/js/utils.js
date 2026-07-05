/**
 * Utility functions for frontend SPA
 */

/**
 * Escape a value for safe interpolation into innerHTML.
 */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/**
 * Format ISO datetime string to a beautiful, clean display format
 * Example: 2026-07-01T15:30:00.000Z -> 01 Jul 2026 15:30
 */
function formatDateTime(isoString) {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const month = months[d.getFullMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    return `${day} ${month} ${year} ${hours}:${minutes}`;
  } catch (e) {
    return '-';
  }
}

/**
 * Initialize a running clock displaying the current time (Thai Locale format)
 */
function startLiveClock(elementId) {
  const clockEl = document.getElementById(elementId);
  if (!clockEl) return;

  function updateClock() {
    const now = new Date();
    // Format to English locale representation
    const formatter = new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'medium',
      hour12: false
    });
    clockEl.textContent = formatter.format(now);
  }

  updateClock();
  setInterval(updateClock, 1000);
}

/**
 * Trigger browser download of CSV string
 */
function downloadCSV(filename, text) {
  const element = document.createElement('a');
  element.setAttribute('href', 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(text));
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

/**
 * Convert vessels list array to a CSV string and trigger download
 */
function exportVesselsToCSV(vessels) {
  if (!vessels || vessels.length === 0) return;

  const headers = [
    'Vessel Name', 'VOY', 'Type', 'Terminal', 'Activity', 
    'ETA', 'ETB', 'ETD', 'ATD', 'Status', 'Next Port', 'Remark', 'Last Updated By'
  ];

  const rows = vessels.map(v => [
    v.vessel_name,
    v.voy || '',
    v.type,
    v.terminal_code || '',
    v.activity,
    v.eta ? new Date(v.eta).toISOString() : '',
    v.etb ? new Date(v.etb).toISOString() : '',
    v.etd ? new Date(v.etd).toISOString() : '',
    v.atd ? new Date(v.atd).toISOString() : '',
    v.status,
    v.next_port || '',
    (v.remark || '').replace(/"/g, '""'), // escape quotes in csv
    v.updated_by_name || ''
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(val => `"${val}"`).join(','))
  ].join('\n');

  const timestamp = new Date().toISOString().slice(0, 10);
  downloadCSV(`vessels_traffic_${timestamp}.csv`, csvContent);
}

/**
 * Theme toggle logic
 */
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const nextTheme = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nextTheme);
  localStorage.setItem('theme', nextTheme);
}

// Run initTheme immediately
initTheme();

// Export functions to global scope
window.utils = {
  esc,
  formatDateTime,
  startLiveClock,
  exportVesselsToCSV,
  toggleTheme
};
