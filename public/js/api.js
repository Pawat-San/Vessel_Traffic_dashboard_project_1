/**
 * Centralized API Client Fetch Wrapper
 * Handles auto-attaching JWT headers, token refresh rotation, and redirection to login
 */

const API_BASE_URL = '/api';

class ApiClient {
  constructor() {
    this.accessToken = null;
    this.user = null;
    this.refreshPromise = null;
    // Remove credentials left by older releases.
    ['access_token', 'refresh_token', 'user'].forEach((key) => localStorage.removeItem(key));
  }

  getAccessToken() {
    return this.accessToken;
  }

  setTokens(accessToken) {
    this.accessToken = accessToken;
  }

  clearTokens() {
    this.accessToken = null;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  getUser() {
    return this.user;
  }

  setUser(user) {
    this.user = user;
  }

  clearUser() {
    this.user = null;
    localStorage.removeItem('user');
  }

  async restoreSession() {
    if (!this.refreshPromise) {
      const exchange = async () => {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }, body: '{}',
        });
        const json = await response.json();
        if (!response.ok) throw json;
        this.setTokens(json.data.accessToken);
        this.setUser(json.data.user);
        return json;
      };
      // Serialize cookie rotation across tabs as well as within this page.
      const exchangePromise = navigator.locks
        ? navigator.locks.request('vessel-refresh', exchange) : exchange();
      this.refreshPromise = exchangePromise.finally(() => { this.refreshPromise = null; });
    }
    return this.refreshPromise;
  }

  /**
   * Main request wrapper emulating interceptors
   */
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    // Auto-setup headers
    options.headers = options.headers || {};
    options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
    options.credentials = 'same-origin';
    
    const token = this.getAccessToken();
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, options);

      // Handle 401 token expiration (unless we are performing login/refresh)
      if (response.status === 401 && !options.authRetried && !endpoint.startsWith('/auth/')) {
        return this.handleTokenExpired(endpoint, options);
      }

      // Parse JSON
      const json = await response.json();
      if (!response.ok) {
        if (json.error && json.error.code === 'PASSWORD_CHANGE_REQUIRED' && window.onPasswordChangeRequired) {
          window.onPasswordChangeRequired(json.error.details || {});
        }
        throw json; // throw error payload (matches standard response layout)
      }

      return json;
    } catch (err) {
      throw err;
    }
  }

  /**
   * Performs refresh token exchange and queues original calls to retry
   */
  async handleTokenExpired(endpoint, options) {
    try {
      await this.restoreSession();
      options.authRetried = true;
      options.headers['Authorization'] = `Bearer ${this.getAccessToken()}`;
      return this.request(endpoint, options);

    } catch (err) {
      this.handleAuthFailure();
      throw { success: false, error: { code: 'SESSION_EXPIRED', message: 'Session expired. Please log in again.' } };
    }
  }

  handleAuthFailure() {
    this.clearTokens();
    this.clearUser();
    
    // Redirect to login if not already there
    window.location.href = '/login.html';
  }

  // Shortcut HTTP helpers
  get(endpoint, query = null) {
    let url = endpoint;
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value);
        }
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }
    return this.request(url, { method: 'GET' });
  }

  post(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  put(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  delete(endpoint) {
    return this.request(endpoint, {
      method: 'DELETE',
    });
  }
}

window.api = new ApiClient();
