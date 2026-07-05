/**
 * Centralized API Client Fetch Wrapper
 * Handles auto-attaching JWT headers, token refresh rotation, and redirection to login
 */

const API_BASE_URL = '/api';

class ApiClient {
  constructor() {
    this.isRefreshing = false;
    this.refreshSubscribers = [];
  }

  getAccessToken() {
    return localStorage.getItem('access_token');
  }

  getRefreshToken() {
    return localStorage.getItem('refresh_token');
  }

  setTokens(accessToken, refreshToken) {
    localStorage.setItem('access_token', accessToken);
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
  }

  clearTokens() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  getUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  setUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
  }

  clearUser() {
    localStorage.removeItem('user');
  }

  // Add callbacks to resolve after a successful token refresh
  subscribeTokenRefresh(callback) {
    this.refreshSubscribers.push(callback);
  }

  onRefreshed(newAccessToken) {
    this.refreshSubscribers.forEach((cb) => cb(newAccessToken));
    this.refreshSubscribers = [];
  }

  /**
   * Main request wrapper emulating interceptors
   */
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    // Auto-setup headers
    options.headers = options.headers || {};
    options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
    
    const token = this.getAccessToken();
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, options);

      // Handle 401 token expiration (unless we are performing login/refresh)
      if (response.status === 401 && !endpoint.startsWith('/auth/login') && !endpoint.startsWith('/auth/refresh')) {
        return this.handleTokenExpired(endpoint, options);
      }

      // Parse JSON
      const json = await response.json();
      if (!response.ok) {
        if (json.error && json.error.code === 'PASSWORD_CHANGE_REQUIRED' && window.onPasswordChangeRequired) {
          window.onPasswordChangeRequired();
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
    const refreshToken = this.getRefreshToken();
    
    if (!refreshToken) {
      this.handleAuthFailure();
      throw { success: false, error: { code: 'UNAUTHENTICATED', message: 'Session expired. Please log in again.' } };
    }

    // Queue original requests if refresh is already in flight
    if (this.isRefreshing) {
      return new Promise((resolve) => {
        this.subscribeTokenRefresh((newToken) => {
          options.headers['Authorization'] = `Bearer ${newToken}`;
          resolve(this.request(endpoint, options));
        });
      });
    }

    this.isRefreshing = true;

    try {
      const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!refreshResponse.ok) {
        throw new Error('Refresh failed');
      }

      const refreshJson = await refreshResponse.json();
      const newAccessToken = refreshJson.data.accessToken;
      
      this.setTokens(newAccessToken);
      this.isRefreshing = false;

      // Dispatch queued requests
      this.onRefreshed(newAccessToken);

      // Retry original request
      options.headers['Authorization'] = `Bearer ${newAccessToken}`;
      return this.request(endpoint, options);

    } catch (err) {
      this.isRefreshing = false;
      this.handleAuthFailure();
      throw { success: false, error: { code: 'SESSION_EXPIRED', message: 'Session expired. Please log in again.' } };
    }
  }

  handleAuthFailure() {
    this.clearTokens();
    this.clearUser();
    
    // Redirect to login if not already there
    if (!window.location.pathname.endsWith('login.html')) {
      window.location.href = '/login.html';
    }
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
