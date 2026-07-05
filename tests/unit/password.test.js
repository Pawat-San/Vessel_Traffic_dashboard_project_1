const bcrypt = require('bcryptjs');
const { hashPassword, verifyPassword, isLegacyHash } = require('../../src/utils/password');

describe('password utils', () => {
  it('hashes and verifies a password round-trip with Argon2', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$/);

    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('detects legacy bcrypt hashes by prefix', () => {
    const bcryptHash = bcrypt.hashSync('somepassword', 6);
    expect(isLegacyHash(bcryptHash)).toBe(true);

    expect(isLegacyHash('$argon2id$v=19$m=8,t=2,p=1$...')).toBe(false);
  });

  it('verifies a legacy bcrypt hash through the same verifyPassword() call', async () => {
    const bcryptHash = bcrypt.hashSync('legacy-password-123', 6);

    expect(await verifyPassword('legacy-password-123', bcryptHash)).toBe(true);
    expect(await verifyPassword('wrong-password', bcryptHash)).toBe(false);
  });
});
