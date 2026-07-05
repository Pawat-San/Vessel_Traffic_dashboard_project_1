const crypto = require('crypto');
const { hashPassword } = require('../../utils/password');

function randomPassword() {
  return crypto.randomBytes(12).toString('base64url');
}

exports.seed = async function seed(knex) {
  const { count } = await knex('users').count({ count: '*' }).first();
  if (Number(count) > 0) {
    // eslint-disable-next-line no-console
    console.log('Users table already populated; skipping bootstrap seed.');
    return;
  }

  const superadminUsername = process.env.SUPERADMIN_USERNAME;
  const superadminPassword = process.env.SUPERADMIN_PASSWORD;

  if (!superadminUsername || !superadminPassword) {
    throw new Error(
      'SUPERADMIN_USERNAME and SUPERADMIN_PASSWORD environment variables must be set to bootstrap the initial superadmin account.'
    );
  }
  if (superadminPassword.length < 8) {
    throw new Error('SUPERADMIN_PASSWORD must be at least 8 characters.');
  }

  const accounts = [
    {
      username: superadminUsername,
      password_hash: await hashPassword(superadminPassword),
      display_name: 'Superadmin',
      role: 'superadmin',
      is_active: 1,
      must_change_password: 0,
    },
  ];

  // Optional demo accounts for local dev convenience only -- never created by default.
  if (process.env.SEED_DEMO_ACCOUNTS === 'true') {
    const demoRoles = ['admin', 'operator', 'viewer'];
    for (const role of demoRoles) {
      const envUsername = process.env[`${role.toUpperCase()}_USERNAME`] || role;
      const envPassword = process.env[`${role.toUpperCase()}_PASSWORD`];
      const password = envPassword || randomPassword();

      if (!envPassword) {
        // eslint-disable-next-line no-console
        console.warn(
          `No ${role.toUpperCase()}_PASSWORD set; generated a random password for demo account '${envUsername}': ${password}\n` +
          'This password is shown once and is not stored anywhere else. Save it now, or reset it later via an admin.'
        );
      }

      accounts.push({
        username: envUsername,
        password_hash: await hashPassword(password),
        display_name: `${role.charAt(0).toUpperCase()}${role.slice(1)} (Demo)`,
        role,
        is_active: 1,
        must_change_password: envPassword ? 0 : 1,
      });
    }
  }

  await knex('users').insert(accounts);
};
