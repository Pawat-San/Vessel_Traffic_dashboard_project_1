/**
 * Core Dashboard SPA Logic
 */

// Dashboard State
let state = {
  vessels: [],
  terminals: [],
  filters: {
    status: '',
    terminal_id: '',
    search: ''
  },
  sorting: {
    sortBy: 'eta',
    sortDir: 'asc'
  },
  pagination: {
    page: 1,
    limit: 20,
    totalPages: 1,
    total: 0
  },
  previousStatusMap: new Map() // Tracks status transitions for flip animations
};

// DOM Elements
const elements = {
  vesselsTableBody: document.getElementById('vessels-table-body'),
  summaryTotal: document.getElementById('sum-total'),
  summarySea: document.getElementById('sum-sea'),
  summaryAnchor: document.getElementById('sum-anchor'),
  summaryBerth: document.getElementById('sum-berth'),
  summaryDepart: document.getElementById('sum-depart'),
  filterStatus: document.getElementById('filter-status'),
  filterTerminal: document.getElementById('filter-terminal'),
  filterSearch: document.getElementById('filter-search'),
  paginationInfo: document.getElementById('pagination-info'),
  btnPrevPage: document.getElementById('btn-prev-page'),
  btnNextPage: document.getElementById('btn-next-page'),
  addVesselBtn: document.getElementById('add-vessel-btn'),
  actionHeaderCell: document.getElementById('action-header-cell'),
  vesselForm: document.getElementById('vessel-form'),
  vesselModalTitle: document.getElementById('vessel-modal-title'),
  archiveTableBody: document.getElementById('archive-table-body'),
  archiveSearchBtn: document.getElementById('archive-search-btn'),
  archiveStartDate: document.getElementById('archive-start-date'),
  archiveEndDate: document.getElementById('archive-end-date'),
  archiveSearchQuery: document.getElementById('archive-search-query'),
  adminToolsContainer: document.getElementById('admin-tools-container'),
  accountsToolsContainer: document.getElementById('accounts-tools-container'),
  accountsTableBody: document.getElementById('accounts-table-body'),
  accountFormModalTitle: document.getElementById('account-form-modal-title'),
  accountForm: document.getElementById('account-form'),
  accountFormPasswordGroup: document.getElementById('account-form-password-group'),
  accountFormActiveGroup: document.getElementById('account-form-active-group'),
  accountFormRoleSuperadminOption: document.getElementById('account-form-role-superadmin'),
  resetPasswordForm: document.getElementById('reset-password-form'),
  forcePasswordForm: document.getElementById('force-password-form')
};

// Active editing vessel ID
let editingVesselId = null;
// Active editing account ID (null = create mode)
let editingAccountId = null;

/**
 * Initialize Dashboard
 */
async function initDashboard() {
  // 1. Setup Locale Clock
  window.utils.startLiveClock('live-clock');

  // 2. Enforce Role Visibility Restrictions
  applyRoleVisibility();

  // 3. Setup Listeners (needed even while locked, e.g. logout / force-password form)
  setupEventListeners();

  // 4. If a forced password change is pending, block the rest of the dashboard
  const user = window.api.getUser();
  if (user && user.mustChangePassword) {
    showForcedPasswordChangeModal();
    return;
  }

  // 5. Load Active Terminals
  await fetchTerminals();

  // 6. Fetch initial dataset
  await refreshData();

  // 7. Setup Auto-Refresh Interval (Every 60 seconds)
  setInterval(refreshData, 60000);
}

/**
 * Show the blocking "set a new password" modal. Cannot be dismissed except by
 * successfully submitting a new password.
 */
function showForcedPasswordChangeModal() {
  window.components.openModal('force-password-modal');
}

/**
 * Global hook invoked by api.js whenever ANY API call returns
 * PASSWORD_CHANGE_REQUIRED (e.g. an admin reset this user's password
 * mid-session), so the block applies immediately regardless of which part of
 * the app triggered the request.
 */
window.onPasswordChangeRequired = function onPasswordChangeRequired() {
  showForcedPasswordChangeModal();
};

/**
 * Applies client-side visibility restrictions based on RBAC user role
 */
function applyRoleVisibility() {
  const user = window.api.getUser();
  if (!user) return;

  const isAdmin = user.role === 'admin';
  const isOperator = user.role === 'operator';
  const isViewer = user.role === 'viewer';

  // "Add Vessel" button visibility
  if (isViewer) {
    if (elements.addVesselBtn) elements.addVesselBtn.style.display = 'none';
  } else {
    if (elements.addVesselBtn) elements.addVesselBtn.style.display = 'inline-flex';
  }

  // Admin panel maintenance actions (archive trigger, purge)
  if (elements.adminToolsContainer) {
    elements.adminToolsContainer.style.display = isAdmin ? 'flex' : 'none';
  }

  // Account management panel (admin + superadmin)
  const isSuperadmin = user.role === 'superadmin';
  if (elements.accountsToolsContainer) {
    elements.accountsToolsContainer.style.display = (isAdmin || isSuperadmin) ? 'flex' : 'none';
  }

  // Only a superadmin can grant the superadmin role
  if (elements.accountFormRoleSuperadminOption) {
    elements.accountFormRoleSuperadminOption.style.display = isSuperadmin ? '' : 'none';
  }
}

/**
 * Load port terminals to populate selection lists
 */
async function fetchTerminals() {
  try {
    const res = await window.api.get('/terminals', { activeOnly: true });
    state.terminals = res.data;

    // Populate filter dropdown & form dropdown
    window.components.populateTerminalDropdown('filter-terminal', state.terminals);
    window.components.populateTerminalDropdown('form-terminal-id', state.terminals);
  } catch (err) {
    window.components.showToast('Failed to load terminals list', 'error');
  }
}

/**
 * Fetch accounts list and render the account management table
 */
async function fetchAccounts() {
  try {
    const res = await window.api.get('/users');
    renderAccountsTable(res.data);
  } catch (err) {
    const msg = err.error ? err.error.message : 'Failed to load accounts';
    window.components.showToast(msg, 'error');
  }
}

/**
 * Render the account management table. Superadmin rows are visible but
 * immutable to Admin actors -- their action buttons are disabled, and the
 * server independently rejects any attempt to mutate them regardless of the
 * UI state here.
 */
function renderAccountsTable(accounts) {
  const esc = window.utils.esc;
  const actor = window.api.getUser();
  const actorIsSuperadmin = actor.role === 'superadmin';

  if (!accounts || accounts.length === 0) {
    elements.accountsTableBody.innerHTML = `
      <tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">No accounts found.</td></tr>
    `;
    return;
  }

  let html = '';
  accounts.forEach((account) => {
    const isTargetSuperadmin = account.role === 'superadmin';
    const isSelf = account.id === actor.id;
    const canManage = actorIsSuperadmin || !isTargetSuperadmin;
    const disabledAttr = canManage ? '' : 'disabled title="Only a superadmin can manage superadmin accounts"';

    html += `
      <tr class="fids-row">
        <td class="fids-cell">${esc(account.username)}${isSelf ? ' <span style="color: var(--text-muted);">(you)</span>' : ''}</td>
        <td class="fids-cell">${esc(account.display_name)}</td>
        <td class="fids-cell"><span class="role ${esc(account.role)}">${esc(account.role)}</span></td>
        <td class="fids-cell">${account.is_active ? 'Active' : 'Deactivated'}</td>
        <td class="fids-cell action-cell">
          <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" data-action="edit" data-id="${account.id}" ${disabledAttr}>Edit</button>
          <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" data-action="reset" data-id="${account.id}" ${disabledAttr}>Reset PW</button>
          <button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" data-action="deactivate" data-id="${account.id}" ${disabledAttr || (isSelf ? 'disabled' : '')}>Deactivate</button>
        </td>
      </tr>
    `;
  });

  elements.accountsTableBody.innerHTML = html;
}

/**
 * Open the account form modal in "create" mode
 */
function onCreateAccountClick() {
  editingAccountId = null;
  elements.accountFormModalTitle.textContent = 'New Account';
  elements.accountForm.reset();
  document.getElementById('account-form-username').disabled = false;
  elements.accountFormPasswordGroup.style.display = '';
  document.getElementById('account-form-password').required = true;
  elements.accountFormActiveGroup.style.display = 'none';
  window.components.openModal('account-form-modal');
}

/**
 * Open the account form modal in "edit" mode for a given account
 */
async function onEditAccountClick(id) {
  try {
    const res = await window.api.get(`/users/${id}`);
    const account = res.data;

    editingAccountId = id;
    elements.accountFormModalTitle.textContent = `Edit Account - ${account.username}`;
    document.getElementById('account-form-username').value = account.username;
    document.getElementById('account-form-username').disabled = true;
    elements.accountFormPasswordGroup.style.display = 'none';
    document.getElementById('account-form-password').required = false;
    document.getElementById('account-form-display-name').value = account.display_name;
    document.getElementById('account-form-role').value = account.role;
    elements.accountFormActiveGroup.style.display = '';
    document.getElementById('account-form-active').checked = Boolean(account.is_active);

    window.components.openModal('account-form-modal');
  } catch (err) {
    window.components.showToast('Failed to load account details', 'error');
  }
}

/**
 * Handle account create/edit form submission
 */
async function onAccountFormSubmit(event) {
  event.preventDefault();

  try {
    if (editingAccountId) {
      const payload = {
        display_name: document.getElementById('account-form-display-name').value,
        role: document.getElementById('account-form-role').value,
        is_active: document.getElementById('account-form-active').checked,
      };
      await window.api.put(`/users/${editingAccountId}`, payload);
      window.components.showToast('Account updated successfully', 'success');
    } else {
      const payload = {
        username: document.getElementById('account-form-username').value,
        password: document.getElementById('account-form-password').value,
        display_name: document.getElementById('account-form-display-name').value,
        role: document.getElementById('account-form-role').value,
      };
      await window.api.post('/users', payload);
      window.components.showToast('Account created successfully', 'success');
    }

    window.components.closeModal('account-form-modal');
    fetchAccounts();
  } catch (error) {
    const msg = error.error ? error.error.message : 'Failed to save account';
    window.components.showToast(msg, 'error');
  }
}

/**
 * Open the reset-password modal for a given account
 */
function onResetPasswordClick(id) {
  editingAccountId = id;
  elements.resetPasswordForm.reset();
  window.components.openModal('reset-password-modal');
}

/**
 * Handle admin-initiated password reset submission
 */
async function onResetPasswordFormSubmit(event) {
  event.preventDefault();

  try {
    const newPassword = document.getElementById('reset-password-new').value;
    await window.api.post(`/users/${editingAccountId}/reset-password`, { new_password: newPassword });
    window.components.showToast('Password reset successfully', 'success');
    window.components.closeModal('reset-password-modal');
  } catch (error) {
    const msg = error.error ? error.error.message : 'Failed to reset password';
    window.components.showToast(msg, 'error');
  }
}

/**
 * Deactivate an account (soft delete)
 */
async function onDeactivateAccountClick(id) {
  if (!confirm('Are you sure you want to deactivate this account?')) {
    return;
  }

  try {
    await window.api.delete(`/users/${id}`);
    window.components.showToast('Account deactivated successfully', 'success');
    fetchAccounts();
  } catch (err) {
    const msg = err.error ? err.error.message : 'Failed to deactivate account';
    window.components.showToast(msg, 'error');
  }
}

/**
 * Handle the forced password change form (blocking modal)
 */
async function onForcePasswordFormSubmit(event) {
  event.preventDefault();

  try {
    const newPassword = document.getElementById('force-password-new').value;
    await window.api.post('/users/me/change-password', { new_password: newPassword });

    // Update the cached user so the (now-cleared) flag doesn't re-trigger this
    // same modal on reload -- the server has already cleared it, but the
    // locally cached copy from login must be refreshed to match.
    const user = window.api.getUser();
    if (user) {
      user.mustChangePassword = false;
      window.api.setUser(user);
    }

    window.components.showToast('Password changed successfully', 'success');
    window.components.closeModal('force-password-modal');
    window.location.reload();
  } catch (error) {
    const msg = error.error ? error.error.message : 'Failed to change password';
    window.components.showToast(msg, 'error');
  }
}

/**
 * Refresh vessels list and status counts
 */
async function refreshData() {
  await Promise.all([
    fetchVessels(),
    fetchSummary()
  ]);
}

/**
 * Fetch status count summary metrics
 */
async function fetchSummary() {
  try {
    const res = await window.api.get('/vessels/summary');
    const summary = res.data;
    
    // Animate summary card transitions
    animateCounter(elements.summaryTotal, summary.total);
    animateCounter(elements.summarySea, summary['AT SEA']);
    animateCounter(elements.summaryAnchor, summary.ANCHOR);
    animateCounter(elements.summaryBerth, summary.BERTH);
    animateCounter(elements.summaryDepart, summary.DEPART);
  } catch (err) {
    console.error('Failed to load summary stats', err);
  }
}

/**
 * Counter increment animation
 */
function animateCounter(element, targetValue) {
  if (!element) return;
  const startValue = parseInt(element.textContent, 10) || 0;
  if (startValue === targetValue) return;

  const duration = 500;
  const startTime = performance.now();

  function update(time) {
    const elapsed = time - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease-out progress
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const currentValue = Math.floor(startValue + (targetValue - startValue) * easeProgress);
    
    element.textContent = currentValue;

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = targetValue;
    }
  }

  requestAnimationFrame(update);
}

/**
 * Fetch vessels based on query, filters, and page
 */
async function fetchVessels() {
  try {
    const query = {
      page: state.pagination.page,
      limit: state.pagination.limit,
      sortBy: state.sorting.sortBy,
      sortDir: state.sorting.sortDir,
      status: state.filters.status,
      terminal_id: state.filters.terminal_id,
      search: state.filters.search
    };

    const res = await window.api.get('/vessels', query);
    state.vessels = res.data;
    state.pagination = {
      ...state.pagination,
      page: res.meta.page,
      limit: res.meta.limit,
      total: res.meta.total,
      totalPages: res.meta.totalPages
    };

    renderVesselsTable();
    renderPagination();
  } catch (err) {
    window.components.showToast('Failed to fetch vessel traffic data', 'error');
  }
}

/**
 * Renders list onto UI table
 */
function renderVesselsTable() {
  const user = window.api.getUser();
  const isAdmin = user.role === 'admin';
  const isOperator = user.role === 'operator';
  const isViewer = user.role === 'viewer';

  // Toggle Action header column visibility
  if (isViewer) {
    if (elements.actionHeaderCell) elements.actionHeaderCell.style.display = 'none';
  } else {
    if (elements.actionHeaderCell) elements.actionHeaderCell.style.display = 'table-cell';
  }

  if (state.vessels.length === 0) {
    elements.vesselsTableBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 3rem;">
          No active vessel traffic matching the selected filters.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  state.vessels.forEach((v) => {
    // Check if status changed since last render to trigger CSS FIDS Flip animation
    const prevStatus = state.previousStatusMap.get(v.id);
    const statusChanged = prevStatus !== undefined && prevStatus !== v.status;
    const animationClass = statusChanged ? 'status-cell-animate' : '';

    // Cache current status
    state.previousStatusMap.set(v.id, v.status);

    const actionCellHtml = isViewer ? '' : `
      <td class="fids-cell action-cell">
        <button class="action-icon-btn edit-btn" title="Edit Vessel" data-id="${v.id}">✏️</button>
        ${isAdmin ? `<button class="action-icon-btn delete-btn" title="Delete Vessel" data-id="${v.id}">🗑️</button>` : ''}
      </td>
    `;

    const esc = window.utils.esc;
    html += `
      <tr class="fids-row" id="vessel-row-${v.id}">
        <td class="fids-cell vessel-name-cell" data-label="Vessel Name">${esc(v.vessel_name)}</td>
        <td class="fids-cell voy-cell" data-label="VOY">${esc(v.voy) || '-'}</td>
        <td class="fids-cell" data-label="Type">${esc(v.type)}</td>
        <td class="fids-cell" data-label="Terminal"><span class="terminal-badge">${esc(v.terminal_code)}</span></td>
        <td class="fids-cell" data-label="Activity"><span class="activity-badge">${esc(v.activity)}</span></td>
        <td class="fids-cell time-cell" data-label="ETA">${window.utils.formatDateTime(v.eta)}</td>
        <td class="fids-cell time-cell" data-label="ETB">${window.utils.formatDateTime(v.etb)}</td>
        <td class="fids-cell time-cell" data-label="ETD">${window.utils.formatDateTime(v.etd)}</td>
        <td class="fids-cell time-cell" data-label="ATD">${window.utils.formatDateTime(v.atd)}</td>
        <td class="fids-cell" data-label="Status">
          <span class="status-badge ${v.status.toLowerCase().replace(' ', '-')} ${animationClass}">
            ${esc(v.status)}
          </span>
        </td>
        ${actionCellHtml}
      </tr>
    `;
  });

  elements.vesselsTableBody.innerHTML = html;
}

/**
 * Render pagination controls
 */
function renderPagination() {
  const p = state.pagination;
  elements.paginationInfo.textContent = `Showing page ${p.page} of ${p.totalPages} (Total: ${p.total} vessels)`;

  elements.btnPrevPage.disabled = p.page <= 1;
  elements.btnNextPage.disabled = p.page >= p.totalPages;
}

/**
 * Setup input listeners, search debouncing, and sort events
 */
function setupEventListeners() {
  // Search Input debounced 300ms
  let debounceTimeout;
  elements.filterSearch.addEventListener('input', (e) => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      state.filters.search = e.target.value;
      state.pagination.page = 1;
      fetchVessels();
    }, 300);
  });

  // Filter Dropdowns
  elements.filterStatus.addEventListener('change', (e) => {
    state.filters.status = e.target.value;
    state.pagination.page = 1;
    refreshData();
  });

  elements.filterTerminal.addEventListener('change', (e) => {
    state.filters.terminal_id = e.target.value;
    state.pagination.page = 1;
    refreshData();
  });

  // Sort columns
  document.querySelectorAll('.fids-table th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const field = th.getAttribute('data-sort');
      
      if (state.sorting.sortBy === field) {
        // Toggle direction
        state.sorting.sortDir = state.sorting.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sorting.sortBy = field;
        state.sorting.sortDir = 'asc';
      }

      // Render indicator classes
      document.querySelectorAll('.fids-table th[data-sort]').forEach((el) => {
        el.className = el.className.replace(/sorted-(asc|desc)/g, '').trim();
      });

      th.classList.add(`sorted-${state.sorting.sortDir}`);
      fetchVessels();
    });
  });

  // Pagination buttons
  elements.btnPrevPage.addEventListener('click', () => {
    if (state.pagination.page > 1) {
      state.pagination.page -= 1;
      fetchVessels();
    }
  });

  elements.btnNextPage.addEventListener('click', () => {
    if (state.pagination.page < state.pagination.totalPages) {
      state.pagination.page += 1;
      fetchVessels();
    }
  });

  // Action Buttons
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) themeToggleBtn.addEventListener('click', window.utils.toggleTheme);

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', window.auth.logout);

  if (elements.addVesselBtn) elements.addVesselBtn.addEventListener('click', onAddVesselClick);
  
  const viewArchiveBtn = document.getElementById('view-archive-btn');
  if (viewArchiveBtn) viewArchiveBtn.addEventListener('click', onOpenArchiveClick);
  
  const exportCsvBtn = document.getElementById('export-csv-btn');
  if (exportCsvBtn) exportCsvBtn.addEventListener('click', onExportCSVClick);
  
  const triggerArchiveBtn = document.getElementById('trigger-archive-btn');
  if (triggerArchiveBtn) triggerArchiveBtn.addEventListener('click', onTriggerArchiveClick);
  
  const triggerPurgeBtn = document.getElementById('trigger-purge-btn');
  if (triggerPurgeBtn) triggerPurgeBtn.addEventListener('click', onTriggerPurgeClick);

  // Archive Search Btn
  const archiveSearchBtn = document.getElementById('archive-search-btn');
  if (archiveSearchBtn) archiveSearchBtn.addEventListener('click', onSearchArchiveClick);

  // Modal Close Buttons
  const closeVesselTop = document.getElementById('vessel-modal-close-top');
  if (closeVesselTop) closeVesselTop.addEventListener('click', () => window.components.closeModal('vessel-modal'));
  const closeVesselBottom = document.getElementById('vessel-modal-close-bottom');
  if (closeVesselBottom) closeVesselBottom.addEventListener('click', () => window.components.closeModal('vessel-modal'));

  const closeArchiveTop = document.getElementById('archive-modal-close-top');
  if (closeArchiveTop) closeArchiveTop.addEventListener('click', () => window.components.closeModal('archive-modal'));
  const closeArchiveBottom = document.getElementById('archive-modal-close-bottom');
  if (closeArchiveBottom) closeArchiveBottom.addEventListener('click', () => window.components.closeModal('archive-modal'));

  if (elements.vesselForm) {
    elements.vesselForm.addEventListener('submit', onVesselFormSubmit);
  }

  // Account Management
  const manageAccountsBtn = document.getElementById('manage-accounts-btn');
  if (manageAccountsBtn) {
    manageAccountsBtn.addEventListener('click', () => {
      window.components.openModal('accounts-modal');
      fetchAccounts();
    });
  }

  const createAccountBtn = document.getElementById('create-account-btn');
  if (createAccountBtn) createAccountBtn.addEventListener('click', onCreateAccountClick);

  const closeAccountsTop = document.getElementById('accounts-modal-close-top');
  if (closeAccountsTop) closeAccountsTop.addEventListener('click', () => window.components.closeModal('accounts-modal'));
  const closeAccountsBottom = document.getElementById('accounts-modal-close-bottom');
  if (closeAccountsBottom) closeAccountsBottom.addEventListener('click', () => window.components.closeModal('accounts-modal'));

  const closeAccountFormTop = document.getElementById('account-form-modal-close-top');
  if (closeAccountFormTop) closeAccountFormTop.addEventListener('click', () => window.components.closeModal('account-form-modal'));
  const closeAccountFormBottom = document.getElementById('account-form-close-bottom');
  if (closeAccountFormBottom) closeAccountFormBottom.addEventListener('click', () => window.components.closeModal('account-form-modal'));

  if (elements.accountForm) {
    elements.accountForm.addEventListener('submit', onAccountFormSubmit);
  }

  const closeResetPasswordTop = document.getElementById('reset-password-modal-close-top');
  if (closeResetPasswordTop) closeResetPasswordTop.addEventListener('click', () => window.components.closeModal('reset-password-modal'));
  const closeResetPasswordBottom = document.getElementById('reset-password-close-bottom');
  if (closeResetPasswordBottom) closeResetPasswordBottom.addEventListener('click', () => window.components.closeModal('reset-password-modal'));

  if (elements.resetPasswordForm) {
    elements.resetPasswordForm.addEventListener('submit', onResetPasswordFormSubmit);
  }

  if (elements.forcePasswordForm) {
    elements.forcePasswordForm.addEventListener('submit', onForcePasswordFormSubmit);
  }

  if (elements.accountsTableBody) {
    elements.accountsTableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn || btn.disabled) return;
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      if (action === 'edit') onEditAccountClick(id);
      if (action === 'reset') onResetPasswordClick(id);
      if (action === 'deactivate') onDeactivateAccountClick(id);
    });
  }

  // Event Delegation for Table Actions
  if (elements.vesselsTableBody) {
    elements.vesselsTableBody.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.edit-btn');
      if (editBtn) {
        const id = editBtn.getAttribute('data-id');
        if (id) onEditVesselClick(id);
      }
      const delBtn = e.target.closest('.delete-btn');
      if (delBtn) {
        const id = delBtn.getAttribute('data-id');
        if (id) onDeleteVesselClick(id);
      }
    });
  }
}

/**
 * Handle Add Vessel Button Click
 */
function onAddVesselClick() {
  editingVesselId = null;
  elements.vesselModalTitle.textContent = 'Add New Vessel';
  elements.vesselForm.reset();
  
  // Set default status to AT SEA
  document.getElementById('form-status').value = 'AT SEA';
  window.components.openModal('vessel-modal');
}

/**
 * Handle Edit Vessel button click
 */
async function onEditVesselClick(id) {
  try {
    const res = await window.api.get(`/vessels/${id}`);
    const vessel = res.data;

    editingVesselId = id;
    elements.vesselModalTitle.textContent = `Edit Vessel - ${vessel.vessel_name}`;

    // Populate form fields
    document.getElementById('form-vessel-name').value = vessel.vessel_name;
    document.getElementById('form-voy').value = vessel.voy || '';
    document.getElementById('form-type').value = vessel.type;
    document.getElementById('form-terminal-id').value = vessel.terminal_id;
    document.getElementById('form-activity').value = vessel.activity;
    
    // Format dates to datetime-local values (YYYY-MM-DDTHH:mm)
    const formatDateForInput = (isoStr) => {
      if (!isoStr) return '';
      return isoStr.substring(0, 16); // Extract YYYY-MM-DDTHH:mm
    };

    document.getElementById('form-eta').value = formatDateForInput(vessel.eta);
    document.getElementById('form-etb').value = formatDateForInput(vessel.etb);
    document.getElementById('form-etd').value = formatDateForInput(vessel.etd);
    document.getElementById('form-atd').value = formatDateForInput(vessel.atd);
    
    document.getElementById('form-status').value = vessel.status;
    document.getElementById('form-next-port').value = vessel.next_port || '';
    document.getElementById('form-remark').value = vessel.remark || '';

    window.components.openModal('vessel-modal');
  } catch (err) {
    window.components.showToast('Failed to load vessel details', 'error');
  }
}

/**
 * Handle Vessel Form Submission (both Create & Update)
 */
async function onVesselFormSubmit(event) {
  event.preventDefault();
  
  const payload = {
    vessel_name: document.getElementById('form-vessel-name').value,
    voy: document.getElementById('form-voy').value || null,
    type: document.getElementById('form-type').value,
    terminal_id: parseInt(document.getElementById('form-terminal-id').value, 10),
    activity: document.getElementById('form-activity').value,
    eta: document.getElementById('form-eta').value ? new Date(document.getElementById('form-eta').value).toISOString() : null,
    etb: document.getElementById('form-etb').value ? new Date(document.getElementById('form-etb').value).toISOString() : null,
    etd: document.getElementById('form-etd').value ? new Date(document.getElementById('form-etd').value).toISOString() : null,
    atd: document.getElementById('form-atd').value ? new Date(document.getElementById('form-atd').value).toISOString() : null,
    status: document.getElementById('form-status').value,
    next_port: document.getElementById('form-next-port').value || null,
    remark: document.getElementById('form-remark').value || null,
  };

  try {
    if (editingVesselId) {
      await window.api.put(`/vessels/${editingVesselId}`, payload);
      window.components.showToast('Vessel details updated successfully', 'success');
    } else {
      await window.api.post('/vessels', payload);
      window.components.showToast('Vessel created successfully', 'success');
    }

    window.components.closeModal('vessel-modal');
    refreshData();
  } catch (error) {
    let msg = 'Failed to submit form';
    if (error.error && error.error.details) {
      msg = error.error.details.map(d => `${d.field}: ${d.message}`).join(', ');
    } else if (error.error) {
      msg = error.error.message;
    }
    window.components.showToast(msg, 'error');
  }
}

/**
 * Handle Delete Click (Admin Only)
 */
async function onDeleteVesselClick(id) {
  if (!confirm('Are you sure you want to permanently delete this vessel entry?')) {
    return;
  }

  try {
    await window.api.delete(`/vessels/${id}`);
    window.components.showToast('Vessel deleted successfully', 'success');
    refreshData();
  } catch (err) {
    const msg = err.error ? err.error.message : 'Failed to delete vessel';
    window.components.showToast(msg, 'error');
  }
}

/**
 * Export CSV including ALL matching filtered records (not just pagination)
 */
async function onExportCSVClick() {
  try {
    window.components.showToast('Preparing CSV file export...', 'info');
    
    // Query list with high limit to fetch all filtered matches
    const query = {
      limit: 10000,
      sortBy: state.sorting.sortBy,
      sortDir: state.sorting.sortDir,
      status: state.filters.status,
      terminal_id: state.filters.terminal_id,
      search: state.filters.search
    };

    const res = await window.api.get('/vessels', query);
    const allRecords = res.data;

    window.utils.exportVesselsToCSV(allRecords);
    window.components.showToast('CSV Exported successfully', 'success');
  } catch (err) {
    window.components.showToast('Failed to compile CSV export', 'error');
  }
}

/**
 * Open Archive Modal
 */
function onOpenArchiveClick() {
  // Clear date filters
  elements.archiveStartDate.value = '';
  elements.archiveEndDate.value = '';
  elements.archiveSearchQuery.value = '';
  
  elements.archiveTableBody.innerHTML = `
    <tr>
      <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">
        Use filters above and click Search to display historical records.
      </td>
    </tr>
  `;
  
  window.components.openModal('archive-modal');
}

/**
 * Query historical archives and render
 */
async function onSearchArchiveClick() {
  try {
    const query = {
      startDate: elements.archiveStartDate.value ? new Date(elements.archiveStartDate.value).toISOString() : '',
      endDate: elements.archiveEndDate.value ? new Date(elements.archiveEndDate.value).toISOString() : '',
      search: elements.archiveSearchQuery.value,
      limit: 50
    };

    elements.archiveTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;">Searching...</td></tr>`;

    const res = await window.api.get('/archive', query);
    const archived = res.data;

    if (archived.length === 0) {
      elements.archiveTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            No historical logs matched the selected range and query.
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    const esc = window.utils.esc;
    archived.forEach((v) => {
      html += `
        <tr class="fids-row">
          <td class="fids-cell font-weight-bold" style="color: #fff;">${esc(v.vessel_name)}</td>
          <td class="fids-cell voy-cell">${esc(v.voy) || '-'}</td>
          <td class="fids-cell"><span class="terminal-badge">${esc(v.terminal_code)}</span></td>
          <td class="fids-cell time-cell">${window.utils.formatDateTime(v.eta)}</td>
          <td class="fids-cell time-cell">${window.utils.formatDateTime(v.atd)}</td>
          <td class="fids-cell time-cell">${window.utils.formatDateTime(v.archived_at)}</td>
          <td class="fids-cell" style="font-size: 0.8rem; color: var(--text-muted);">${esc(v.updated_by_name) || '-'}</td>
        </tr>
      `;
    });

    elements.archiveTableBody.innerHTML = html;
  } catch (err) {
    window.components.showToast('Failed to load archived vessel records', 'error');
  }
}

/**
 * Manually trigger archiving task (Admin only)
 */
async function onTriggerArchiveClick() {
  try {
    window.components.showToast('Initiating archiving job...', 'info');
    const res = await window.api.post('/vessels/archive');
    window.components.showToast(res.data.message, 'success');
    refreshData();
  } catch (err) {
    window.components.showToast('Archive operation failed', 'error');
  }
}

/**
 * Manually trigger 90-day archive purge (Admin only)
 */
async function onTriggerPurgeClick() {
  if (!confirm('Are you sure you want to permanently purge all historical records older than 90 days?')) {
    return;
  }

  try {
    window.components.showToast('Initiating database purge...', 'info');
    const res = await window.api.post('/archive/purge?days=90');
    window.components.showToast(res.data.message, 'success');
  } catch (err) {
    window.components.showToast('Purge operation failed', 'error');
  }
}

// Expose event handler functions globally
window.onAddVesselClick = onAddVesselClick;
window.onEditVesselClick = onEditVesselClick;
window.onVesselFormSubmit = onVesselFormSubmit;
window.onDeleteVesselClick = onDeleteVesselClick;
window.onExportCSVClick = onExportCSVClick;
window.onOpenArchiveClick = onOpenArchiveClick;
window.onSearchArchiveClick = onSearchArchiveClick;
window.onTriggerArchiveClick = onTriggerArchiveClick;
window.onTriggerPurgeClick = onTriggerPurgeClick;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  if (!window.location.pathname.endsWith('login.html')) {
    initDashboard();
  }
});
