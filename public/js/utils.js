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
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
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

// Column order used for the bulk-import template (and expected on parse).
// Mirrors the Export column order so an exported file can be re-imported.
const IMPORT_COLUMNS = [
  'vessel_name', 'voy', 'type', 'terminal_code', 'activity',
  'eta', 'etb', 'etd', 'atd', 'status', 'next_port', 'remark',
];

/**
 * Download a blank CSV template with the import header row plus one example row.
 */
function downloadImportTemplate() {
  const example = [
    'EVER GIVEN', '0422-003', 'Container', 'A1', 'L',
    '2026-07-10T14:30', '2026-07-10T16:00', '2026-07-11T02:00', '', 'AT SEA',
    'SINGAPORE', 'Sample row - delete before import',
  ];
  const csv = [
    IMPORT_COLUMNS.join(','),
    example.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','),
  ].join('\n');
  downloadCSV('vessels_import_template.csv', csv);
}

/**
 * Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes ("")
 * and commas/newlines inside quotes. Returns an array of row objects keyed by
 * the header row. Good enough for spreadsheet exports; not a full CSV engine.
 */
function parseCSV(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  // Normalize newlines and strip a leading BOM if present.
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  // Flush trailing field/row (file may not end with newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty rows (e.g. trailing blank line).
  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (nonEmpty.length === 0) return [];

  const headers = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] !== undefined ? r[idx].trim() : ''); });
    return obj;
  });
}

/**
 * Theme toggle logic
 */
function initTheme() {
  // Default to the clean white board on first visit; users can still switch to
  // the dark FIDS theme via the toggle (persisted in localStorage).
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
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
  downloadImportTemplate,
  parseCSV,
  IMPORT_COLUMNS,
  toggleTheme
};
