module.exports = {
  version: 1,
  name: 'initial_schema',
  up(db) {
    // 1. Users Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT DEFAULT 'operator' CHECK(role IN ('admin', 'operator', 'viewer')),
        refresh_token_hash TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Index on username for quick lookup during login
    db.exec(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`);

    // 2. Terminals Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS terminals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT,
        group_name TEXT,
        sort_order INTEGER,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Vessels Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS vessels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vessel_name TEXT NOT NULL,
        voy TEXT,
        type TEXT CHECK(type IN ('Container','Bulk','Tanker','General','RoRo','LPG','Passenger')),
        terminal_id INTEGER,
        activity TEXT,
        eta TEXT,
        etb TEXT,
        etd TEXT,
        atd TEXT,
        status TEXT CHECK(status IN ('AT SEA','ANCHOR','BERTH','DEPART')),
        next_port TEXT,
        remark TEXT,
        updated_by INTEGER,
        date_modify TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (terminal_id) REFERENCES terminals(id) ON DELETE RESTRICT,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // 4. Vessel Archive Table (denormalized, no foreign keys for history retention)
    db.exec(`
      CREATE TABLE IF NOT EXISTS vessel_archive (
        id INTEGER PRIMARY KEY,
        vessel_name TEXT,
        voy TEXT,
        type TEXT,
        terminal_code TEXT,
        activity TEXT,
        eta TEXT,
        etb TEXT,
        etd TEXT,
        atd TEXT,
        status TEXT,
        next_port TEXT,
        remark TEXT,
        updated_by_name TEXT,
        date_modify TEXT,
        created_at TEXT,
        archived_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. Audit Logs Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT CHECK(action IN ('CREATE','UPDATE','DELETE','ARCHIVE','LOGIN','LOGOUT')),
        entity_type TEXT,
        entity_id INTEGER,
        changes TEXT,
        user_id INTEGER,
        ip_address TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Composite indexes for query patterns
    db.exec(`CREATE INDEX IF NOT EXISTS idx_vessels_status_terminal ON vessels(status, terminal_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_vessels_eta ON vessels(eta);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_vessels_atd ON vessels(atd);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_vessels_name ON vessels(vessel_name);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_archive_archived_at ON vessel_archive(archived_at);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);`);
  },
  down(db) {
    db.exec(`DROP INDEX IF EXISTS idx_audit_created;`);
    db.exec(`DROP INDEX IF EXISTS idx_audit_entity;`);
    db.exec(`DROP INDEX IF EXISTS idx_archive_archived_at;`);
    db.exec(`DROP INDEX IF EXISTS idx_vessels_name;`);
    db.exec(`DROP INDEX IF EXISTS idx_vessels_atd;`);
    db.exec(`DROP INDEX IF EXISTS idx_vessels_eta;`);
    db.exec(`DROP INDEX IF EXISTS idx_vessels_status_terminal;`);
    db.exec(`DROP TABLE IF EXISTS audit_logs;`);
    db.exec(`DROP TABLE IF EXISTS vessel_archive;`);
    db.exec(`DROP TABLE IF EXISTS vessels;`);
    db.exec(`DROP TABLE IF EXISTS terminals;`);
    db.exec(`DROP INDEX IF EXISTS idx_users_username;`);
    db.exec(`DROP TABLE IF EXISTS users;`);
  }
};
