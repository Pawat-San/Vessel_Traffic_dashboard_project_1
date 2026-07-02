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
    const { accessToken, refreshToken, user } = response.data;
    window.api.setTokens(accessToken, refreshToken);
    window.api.setUser(user);
    
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
function protectRoute() {
  const isLoginPage = window.location.pathname.endsWith('login.html');
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

  badgeContainer.innerHTML = `
    <span class="display-name">${user.displayName}</span>
    <span class="role ${user.role}">${user.role}</span>
  `;
}

// Run protection guard immediately on script parse
protectRoute();

window.auth = {
  login: loginUser,
  logout: logoutUser
};
