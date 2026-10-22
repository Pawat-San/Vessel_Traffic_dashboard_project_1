const { EventEmitter } = require('events');
const config = require('../../src/config');
const store = require('../../src/utils/rateLimitStore');
const { loginRateLimiter } = require('../../src/middleware/rateLimiter');

describe('Login rate limit reservations', () => {
  const original = config.isTest;
  beforeEach(() => {
    config.isTest = false;
    jest.spyOn(store, 'consume').mockResolvedValue({ allowed: true, retryAfter: 60, expiresAt: 12345 });
    jest.spyOn(store, 'release').mockResolvedValue(1);
  });
  afterEach(() => { config.isTest = original; });

  it.each([200, 400, 500, 503])('does not count HTTP %i as an invalid password', async (statusCode) => {
    const res = new EventEmitter();
    res.statusCode = statusCode;
    const next = jest.fn();
    await loginRateLimiter({ body: { username: 'alice' }, ip: '127.0.0.1' }, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    res.emit('finish');
    expect(store.release).toHaveBeenCalledTimes(2);
  });

  it('counts only invalid-credential responses toward lockout', async () => {
    const res = new EventEmitter();
    res.statusCode = 401;
    await loginRateLimiter({ body: { username: 'alice' }, ip: '127.0.0.1' }, res, jest.fn());
    res.emit('finish');
    expect(store.release).not.toHaveBeenCalled();
  });
});
