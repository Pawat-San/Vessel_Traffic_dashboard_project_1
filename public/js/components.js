/**
 * Reusable UI component scripts
 */

/**
 * Creates and appends a toast alert notification
 * @param {string} message 
 * @param {'success'|'error'|'warning'|'info'} type 
 */
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  // Set icons based on alert type
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'warning') icon = '⚠️';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  // Remove toast after 4 seconds
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s reverse forwards ease-out';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 4000);
}

/**
 * Open a modal overlay
 * @param {string} modalId 
 */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
  }
}

/**
 * Close a modal overlay
 * @param {string} modalId 
 */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    
    // Clear forms inside modal if present
    const form = modal.querySelector('form');
    if (form) form.reset();
  }
}

/**
 * Populate a select dropdown element with port terminal choices
 * @param {string} selectId 
 * @param {Array} terminals 
 * @param {string} defaultVal 
 */
function populateTerminalDropdown(selectId, terminals, defaultVal = '') {
  const select = document.getElementById(selectId);
  if (!select) return;

  // Preserve the first option if it's a default/placeholder
  const firstOpt = select.options[0];
  select.innerHTML = '';
  if (firstOpt) {
    select.appendChild(firstOpt);
  }

  terminals.forEach((term) => {
    const opt = document.createElement('option');
    opt.value = term.id;
    opt.textContent = `${term.code} - ${term.name || term.group_name}`;
    if (String(term.id) === String(defaultVal)) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

window.components = {
  showToast,
  openModal,
  closeModal,
  populateTerminalDropdown
};
