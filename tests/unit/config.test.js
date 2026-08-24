describe('App config — appTitle', () => {
  const ORIGINAL_APP_TITLE = process.env.APP_TITLE;

  afterEach(() => {
    if (ORIGINAL_APP_TITLE === undefined) {
      delete process.env.APP_TITLE;
    } else {
      process.env.APP_TITLE = ORIGINAL_APP_TITLE;
    }
    jest.resetModules();
  });

  it('defaults to the generic title when APP_TITLE is not set', () => {
    delete process.env.APP_TITLE;
    jest.resetModules();

    const config = require('../../src/config');
    expect(config.appTitle).toBe('Vessel Schedule  Dashboard');
  });

  it('uses APP_TITLE when set, keeping no company name hardcoded in the repo', () => {
    process.env.APP_TITLE = 'Test Brand X';
    jest.resetModules();

    const config = require('../../src/config');
    expect(config.appTitle).toBe('Test Brand X');
  });
});

describe('App config — password security', () => {
  const originalMaxAge = process.env.PASSWORD_MAX_AGE_DAYS;
  const originalHistoryLimit = process.env.PASSWORD_HISTORY_LIMIT;

  afterEach(() => {
    if (originalMaxAge === undefined) delete process.env.PASSWORD_MAX_AGE_DAYS;
    else process.env.PASSWORD_MAX_AGE_DAYS = originalMaxAge;
    if (originalHistoryLimit === undefined) delete process.env.PASSWORD_HISTORY_LIMIT;
    else process.env.PASSWORD_HISTORY_LIMIT = originalHistoryLimit;
    jest.resetModules();
  });

  it('uses secure defaults for missing or invalid values', () => {
    process.env.PASSWORD_MAX_AGE_DAYS = 'invalid';
    process.env.PASSWORD_HISTORY_LIMIT = '0';
    jest.resetModules();

    const config = require('../../src/config');
    expect(config.password).toEqual({ maxAgeDays: 90, historyLimit: 5 });
  });

  it('accepts positive integer overrides', () => {
    process.env.PASSWORD_MAX_AGE_DAYS = '120';
    process.env.PASSWORD_HISTORY_LIMIT = '7';
    jest.resetModules();

    const config = require('../../src/config');
    expect(config.password).toEqual({ maxAgeDays: 120, historyLimit: 7 });
  });
});

describe('App config — activity storage', () => {
  const names = [
    'USER_ACTIVITY_RETENTION_DAYS',
    'USER_ACTIVITY_HEARTBEAT_MINUTES',
    'USER_ACTIVITY_DAILY_RETENTION_DAYS',
  ];
  const originals = Object.fromEntries(names.map((name) => [name, process.env[name]]));

  afterEach(() => {
    for (const name of names) {
      if (originals[name] === undefined) delete process.env[name];
      else process.env[name] = originals[name];
    }
    jest.resetModules();
  });

  it('uses bounded defaults for raw events, heartbeats, and daily summaries', () => {
    for (const name of names) delete process.env[name];
    jest.resetModules();
    const config = require('../../src/config');
    expect(config.activity).toEqual({
      retentionDays: 90,
      heartbeatMinutes: 15,
      dailyRetentionDays: 730,
    });
  });

  it('accepts positive integer activity overrides', () => {
    process.env.USER_ACTIVITY_RETENTION_DAYS = '60';
    process.env.USER_ACTIVITY_HEARTBEAT_MINUTES = '10';
    process.env.USER_ACTIVITY_DAILY_RETENTION_DAYS = '365';
    jest.resetModules();
    const config = require('../../src/config');
    expect(config.activity).toEqual({
      retentionDays: 60,
      heartbeatMinutes: 10,
      dailyRetentionDays: 365,
    });
  });
});
