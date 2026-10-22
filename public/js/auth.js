/**
 * Authentication management script
 */

/**
 * Perform login action
 */
async function loginUser(username, password) {
  try {
    const response = await window.api.post('/auth/login', { username, password });
    
    // Save tokens and user info
    const { accessToken, user } = response.data;
    window.api.setTokens(accessToken);
    window.api.setUser(user);
    document.getElementById('password').value = '';
    if (user.mustChangePassword) {
      document.getElementById('login-form').hidden = true;
      document.getElementById('password-change-form').hidden = false;
      window.components.showToast('Please set a new password before continuing.', 'warning');
      return;
    }
    
    window.components.showToast('Login successful! Redirecting...', 'success');
    
    setTimeout(() => {
      window.location.href = '/';
    }, 800);
  } catch (error) {
    const msg = error.error ? error.error.message : 'Invalid username or password';
    window.components.showToast(msg, 'error');
  }
}

/**
 * Perform logout action
 */
async function logoutUser() {
  try {
    await window.api.post('/auth/logout');
  } catch (e) {
    // Ignore error and clear tokens anyway
  } finally {
    window.api.clearTokens();
    window.api.clearUser();
    window.location.href = '/login.html';
  }
}

/**
 * Route protection guard executed immediately on load
 */
async function protectRoute() {
  const isLoginPage = window.location.pathname.endsWith('login.html');
  // Do not refresh on the login page: login may need a purpose-limited token.
  if (isLoginPage) return;
  try {
    await window.api.restoreSession();
  } catch (error) {
    window.api.handleAuthFailure();
    return;
  }
  const user = window.api.getUser();
  const token = window.api.getAccessToken();

  if (isLoginPage) {
    // If logged in, redirect away from login page
    if (user && token) {
      window.location.href = '/';
    }
  } else {
    // If not logged in, redirect to login page
    if (!user || !token) {
      window.location.href = '/login.html';
    } else {
      // Expose user to the page header badge
      renderHeaderUserBadge(user);
    }
  }
}

/**
 * Render active user badge in header
 */
function renderHeaderUserBadge(user) {
  const badgeContainer = document.getElementById('user-badge-container');
  if (!badgeContainer) return;

  const esc = window.utils.esc;
  badgeContainer.innerHTML = `
    <span class="display-name">${esc(user.displayName)}</span>
    <span class="role ${esc(user.role)}">${esc(user.role)}</span>
  `;
}

// Run protection guard immediately on script parse
window.authReady = protectRoute();

window.auth = {
  login: loginUser,
  logout: logoutUser
};

const loginForm = document.getElementById('login-form');
if (loginForm) loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  loginUser(document.getElementById('username').value, document.getElementById('password').value);
});

const changeForm = document.getElementById('password-change-form');
if (changeForm) {
  const newPassword = document.getElementById('login-new-password');
  const confirmPassword = document.getElementById('login-confirm-password');
  const update = () => {
    const checks = window.validation.checkPasswordRequirements(newPassword.value, confirmPassword.value);
    Object.entries(checks).forEach(([rule, passed]) => {
      const item = changeForm.querySelector(`[data-rule="${rule}"]`);
      if (item) {
        item.classList.toggle('valid', passed);
        item.querySelector('.password-rule-icon').textContent = passed ? '✓' : '○';
      }
    });
    document.getElementById('login-change-submit').disabled = !Object.values(checks).every(Boolean);
  };
  newPassword.addEventListener('input', update);
  confirmPassword.addEventListener('input', update);
  update();
  changeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await window.api.post('/users/me/change-password', { new_password: newPassword.value });
      window.api.clearTokens();
      window.api.clearUser();
      changeForm.reset();
      update();
      changeForm.hidden = true;
      loginForm.hidden = false;
      window.components.showToast('Password changed. Please log in with your new password.', 'success');
    } catch (error) {
      window.components.showToast(error.error?.message || 'Password change failed', 'error');
    }
  });
}
