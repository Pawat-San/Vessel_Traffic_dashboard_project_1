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
    expect(config.appTitle).toBe('Vessel Traffic Dashboard');
  });

  it('uses APP_TITLE when set, keeping no company name hardcoded in the repo', () => {
    process.env.APP_TITLE = 'Test Brand X';
    jest.resetModules();

    const config = require('../../src/config');
    expect(config.appTitle).toBe('Test Brand X');
  });
});
