const bcrypt = require('bcryptjs');
const connection = require('../../src/database/connection');

/**
 * Inserts a mock user into test database
 */
function createUser(overrides = {}) {
  const user = {
    username: `user_${Math.random().toString(36).substring(7)}`,
    password_hash: bcrypt.hashSync(overrides.password || 'password123', 6),
    display_name: 'Test User',
    role: 'operator',
    is_active: 1,
    ...overrides
  };

  const stmt = connection.db.prepare(`
    INSERT INTO users (username, password_hash, display_name, role, is_active)
    VALUES (@username, @password_hash, @display_name, @role, @is_active)
  `);
  const info = stmt.run(user);
  
  return { id: info.lastInsertRowid, ...user };
}

/**
 * Inserts a mock terminal into test database
 */
function createTerminal(overrides = {}) {
  const terminal = {
    code: `T_${Math.random().toString(36).substring(7).toUpperCase()}`,
    name: 'Test Terminal Port',
    group_name: 'TEST_GRP',
    sort_order: 1,
    is_active: 1,
    ...overrides
  };

  const stmt = connection.db.prepare(`
    INSERT INTO terminals (code, name, group_name, sort_order, is_active)
    VALUES (@code, @name, @group_name, @sort_order, @is_active)
  `);
  const info = stmt.run(terminal);

  return { id: info.lastInsertRowid, ...terminal };
}

/**
 * Inserts a mock vessel into test database
 */
function createVessel(overrides = {}) {
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
    ...overrides
  };

  const stmt = connection.db.prepare(`
    INSERT INTO vessels (
      vessel_name, voy, type, terminal_id, activity, eta, etb, etd, atd, status, next_port, remark, updated_by
    )
    VALUES (
      @vessel_name, @voy, @type, @terminal_id, @activity, @eta, @etb, @etd, @atd, @status, @next_port, @remark, @updated_by
    )
  `);
  const info = stmt.run(vessel);

  return { id: info.lastInsertRowid, ...vessel };
}

module.exports = {
  createUser,
  createTerminal,
  createVessel,
};
