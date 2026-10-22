const databaseSsl = require('../../src/utils/databaseSsl');

describe('Database TLS configuration', () => {
  it('verifies the peer by default and requires an explicit override to disable it', () => {
    expect(databaseSsl(true)).toEqual({ rejectUnauthorized: true });
    expect(databaseSsl(false)).toBe(false);
    expect(databaseSsl(true, undefined, false)).toEqual({ rejectUnauthorized: false });
  });
});
