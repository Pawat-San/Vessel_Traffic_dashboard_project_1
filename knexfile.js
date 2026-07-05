require('dotenv').config();
const path = require('path');

const migrations = {
  directory: path.join(__dirname, 'src/database/migrations'),
  tableName: 'schema_migrations',
};

const seeds = {
  directory: path.join(__dirname, 'src/database/seeds'),
};

const sqliteConfig = {
  client: 'better-sqlite3',
  connection: {
    filename: process.env.DB_PATH
      ? path.resolve(__dirname, process.env.DB_PATH)
      : path.join(__dirname, 'data/dashboard.db'),
  },
  useNullAsDefault: true,
  pool: {
    afterCreate: (conn, cb) => {
      conn.pragma('journal_mode = WAL');
      conn.pragma('busy_timeout = 5000');
      conn.pragma('synchronous = NORMAL');
      conn.pragma('foreign_keys = ON');
      cb();
    },
  },
  migrations,
  seeds,
};

const pgConfig = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  },
  pool: { min: 2, max: 10 },
  migrations,
  seeds,
};

module.exports = {
  development: process.env.DB_CLIENT === 'pg' ? pgConfig : sqliteConfig,
  test: { ...sqliteConfig, connection: { filename: ':memory:' } },
  production: pgConfig,
};
