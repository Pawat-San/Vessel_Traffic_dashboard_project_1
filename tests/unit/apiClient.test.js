const vm = require('vm');
const fs = require('fs');
const path = require('path');

function client(fetch) {
  const storage = new Map([['access_token', 'old-access'], ['refresh_token', 'old-refresh'], ['user', '{}']]);
  const context = vm.createContext({
    window: { location: { pathname: '/', href: '/' } },
    localStorage: { removeItem: (key) => storage.delete(key) },
    navigator: { locks: { request: jest.fn((name, action) => action()) } },
    fetch, URLSearchParams,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../public/js/api.js'), 'utf8'), context);
  return { api: context.window.api, storage, context };
}

const response = (status, data) => ({ status, ok: status === 200, json: async () => data });

describe('Browser API session handling', () => {
  it('completes forced password change on the login page without persisting or redirecting the limited token', async () => {
    const elements = new Map();
    const getElement = (id) => {
      if (!elements.has(id)) elements.set(id, {
        value: '', hidden: false, disabled: false, handlers: {},
        addEventListener(event, handler) { this.handlers[event] = handler; },
        querySelector: () => ({ classList: { toggle() {} }, querySelector: () => ({}) }),
        reset() {},
      });
      return elements.get(id);
    };
    const api = {
      post: jest.fn().mockResolvedValueOnce({ data: {
        accessToken: 'limited-token', user: { mustChangePassword: true },
      } }).mockResolvedValueOnce({ success: true }),
      setTokens: jest.fn(), setUser: jest.fn(), clearTokens: jest.fn(), clearUser: jest.fn(),
    };
    const context = vm.createContext({
      window: { api, location: { pathname: '/login.html', href: '/login.html' },
        components: { showToast: jest.fn() }, validation: require('../../public/js/validation') },
      document: { getElementById: getElement }, setTimeout: jest.fn(),
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../public/js/auth.js'), 'utf8'), context);
    await context.window.auth.login('alice', 'Temporary1!');
    expect(api.setTokens).toHaveBeenCalledWith('limited-token');
    expect(getElement('login-form').hidden).toBe(true);
    expect(getElement('password-change-form').hidden).toBe(false);
    expect(context.setTimeout).not.toHaveBeenCalled();
    getElement('login-new-password').value = 'Replacement1!';
    getElement('login-confirm-password').value = 'Replacement1!';
    getElement('login-new-password').handlers.input();
    expect(getElement('login-change-submit').disabled).toBe(false);
    await getElement('password-change-form').handlers.submit({ preventDefault() {} });
    expect(api.post).toHaveBeenLastCalledWith('/users/me/change-password', { new_password: 'Replacement1!' });
    expect(api.clearTokens).toHaveBeenCalled();
    expect(getElement('login-form').hidden).toBe(false);
  });

  it('removes legacy credentials and keeps new access credentials only in memory', () => {
    const { api, storage } = client(jest.fn());
    expect(storage.size).toBe(0);
    api.setTokens('memory-only');
    api.setUser({ role: 'viewer' });
    expect(storage.size).toBe(0);
    expect(api.getAccessToken()).toBe('memory-only');
    api.clearTokens();
    expect(api.getAccessToken()).toBeNull();
  });

  it('shares one refresh between concurrent requests and uses the browser cookie', async () => {
    const fetch = jest.fn().mockResolvedValue(response(200, { data: { accessToken: 'new-access', user: { role: 'viewer' } } }));
    const { api, context } = client(fetch);
    await Promise.all([api.restoreSession(), api.restoreSession()]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].credentials).toBe('same-origin');
    expect(fetch.mock.calls[0][1].body).toBe('{}');
    expect(api.getAccessToken()).toBe('new-access');
    expect(api.getUser().role).toBe('viewer');
    expect(context.navigator.locks.request).toHaveBeenCalledTimes(1);
  });

  it('rejects every queued caller and clears state when refresh fails', async () => {
    const fetch = jest.fn().mockResolvedValue(response(401, { error: { message: 'Revoked' } }));
    const { api, context } = client(fetch);
    const results = await Promise.allSettled([
      api.handleTokenExpired('/vessels', { headers: {} }),
      api.handleTokenExpired('/terminals', { headers: {} }),
    ]);
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(api.getAccessToken()).toBeNull();
    expect(context.window.location.href).toBe('/login.html');
  });

  it('retries an expired request once without an infinite refresh loop', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce(response(401, { error: {} }))
      .mockResolvedValueOnce(response(200, { data: { accessToken: 'new-access', user: {} } }))
      .mockResolvedValueOnce(response(401, { error: { message: 'Still unauthorized' } }));
    const { api } = client(fetch);
    await expect(api.get('/vessels')).rejects.toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
