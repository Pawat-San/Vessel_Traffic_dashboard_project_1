const bcrypt = require('bcryptjs');

module.exports = {
  run(db) {
    // Clear users first to ensure re-runnability
    db.exec('DELETE FROM users');
    db.exec("DELETE FROM sqlite_sequence WHERE name='users'");

    const users = [
      {
        username: 'admin',
        password_hash: bcrypt.hashSync('admin123', 12),
        display_name: 'Administrator',
        role: 'admin',
        is_active: 1
      },
      {
        username: 'operator',
        password_hash: bcrypt.hashSync('operator123', 12),
        display_name: 'Terminal Operator',
        role: 'operator',
        is_active: 1
      },
      {
        username: 'viewer',
        password_hash: bcrypt.hashSync('viewer123', 12),
        display_name: 'Viewer',
        role: 'viewer',
        is_active: 1
      }
    ];

    const insert = db.prepare(`
      INSERT INTO users (username, password_hash, display_name, role, is_active)
      VALUES (@username, @password_hash, @display_name, @role, @is_active)
    `);

    for (const user of users) {
      insert.run(user);
    }
  }
};
