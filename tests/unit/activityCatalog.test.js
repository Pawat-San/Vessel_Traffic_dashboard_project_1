const { getActionCode, getActionLabel } = require('../../src/utils/activityCatalog');

describe('activityCatalog', () => {
  it('maps known routes to domain activity codes', () => {
    expect(getActionCode('GET', '/api/vessels')).toBe('DASHBOARD_VIEWED');
    expect(getActionCode('GET', '/api/users')).toBe('ACCOUNT_LIST_VIEWED');
    expect(getActionCode('POST', '/api/auth/logout')).toBe('AUTH_LOGOUT');
  });

  it('returns readable labels for domain and historical codes', () => {
    expect(getActionLabel('ACCOUNT_PASSWORD_RESET')).toBe('Reset password');
    expect(getActionLabel('GET_API_VESSELS')).toBe('Viewed vessel dashboard');
  });

  it('humanizes unknown technical codes instead of exposing underscores', () => {
    const label = getActionLabel('GET_API_NEW_REPORT');
    expect(label).toBe('New report');
    expect(label).not.toContain('_');
  });
});
