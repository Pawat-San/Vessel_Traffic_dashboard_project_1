const { EventEmitter } = require('events');
const { setupTestDb, teardownTestDb } = require('../helpers/setup');
const config = require('../../src/config');
const { loginRateLimiter } = require('../../src/middleware/rateLimiter');

async function attempt(ip, username, statusCode = 401) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  res.set = jest.fn().mockReturnValue(res);
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn().mockReturnValue(res);
  const next = jest.fn();
  await loginRateLimiter({ ip, body: { username } }, res, next);
  if (next.mock.calls.length) res.emit('finish');
  // Successful requests release their reservations asynchronously.
  await new Promise((resolve) => setImmediate(resolve));
  return { res, next };
}

describe('Shared login limits without remote account lockout', () => {
  const originalIsTest = config.isTest;
  beforeAll(setupTestDb);
  beforeEach(() => { config.isTest = false; });
  afterEach(() => { config.isTest = originalIsTest; });
  afterAll(teardownTestDb);

  it('blocks an attacker after five failures while allowing the same account at another IP', async () => {
    for (let index = 0; index < 5; index++) {
      expect((await attempt('192.0.2.1', 'target')).next).toHaveBeenCalledTimes(1);
    }
    const blocked = await attempt('192.0.2.1', 'target', 200);
    expect(blocked.res.statusCode).toBe(429);
    expect(blocked.next).not.toHaveBeenCalled();
    expect(blocked.res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect((await attempt('192.0.2.2', 'target', 200)).next).toHaveBeenCalledTimes(1);
    expect((await attempt('192.0.2.1', 'another-user', 200)).next).toHaveBeenCalledTimes(1);
  });

  it('retains an IP-wide ceiling against password spraying across many usernames', async () => {
    for (let index = 0; index < 100; index++) {
      expect((await attempt('192.0.2.3', `user-${index}`)).next).toHaveBeenCalledTimes(1);
    }
    const blocked = await attempt('192.0.2.3', 'new-user');
    expect(blocked.res.statusCode).toBe(429);
    expect(blocked.next).not.toHaveBeenCalled();
  });
});
