const { hashPassword } = require('../../src/utils/password');
const database = require('../../src/database/knex');

/**
 * Inserts a mock user into test database
 */
async function createUser(overrides = {}) {
  const password = overrides.password || 'password123';
  const user = {
    username: `user_${Math.random().toString(36).substring(7)}`,
    password_hash: await hashPassword(password),
    display_name: 'Test User',
    role: 'operator',
    is_active: 1,
    must_change_password: false,
    ...overrides,
  };
  delete user.password;

  const [row] = await database.db('users').insert(user).returning('*');
  return row;
}

/**
 * Inserts a mock terminal into test database
 */
async function createTerminal(overrides = {}) {
  const terminal = {
    code: `T_${Math.random().toString(36).substring(7).toUpperCase()}`,
    name: 'Test Terminal Port',
    group_name: 'TEST_GRP',
    sort_order: 1,
    is_active: 1,
    ...overrides,
  };

  const [row] = await database.db('terminals').insert(terminal).returning('*');
  return row;
}

/**
 * Inserts a mock vessel into test database
 */
async function createVessel(overrides = {}) {
  const vessel = {
    vessel_name: 'TEST VESSEL SHIP',
    voy: 'V001',
    type: 'Container',
    terminal_id: 1, // must exist
    activity: 'L',
    eta: '2026-07-01T12:00:00.000Z',
    etb: '2026-07-01T14:00:00.000Z',
    etd: '2026-07-02T12:00:00.000Z',
    atd: null,
    status: 'AT SEA',
    next_port: 'SINGAPORE',
    remark: 'Normal traffic',
    updated_by: null,
    ...overrides,
  };

  const [row] = await database.db('vessels').insert(vessel).returning('*');
  return row;
}

module.exports = {
  createUser,
  createTerminal,
  createVessel,
};
