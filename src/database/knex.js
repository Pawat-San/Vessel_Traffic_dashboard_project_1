const path = require('path');
const Knex = require('knex');
const config = require('../config');
const logger = require('../utils/logger');

let knexInstance = null;

const migrations = {
  directory: path.join(__dirname, 'migrations'),
  tableName: 'schema_migrations',
};

const seeds = {
  directory: path.join(__dirname, 'seeds'),
};

function buildKnexConfig() {
  if (config.db.client === 'pg') {
    return {
      client: 'pg',
      connection: {
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        database: config.db.name,
        ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
      },
      pool: { min: 2, max: 10 },
      migrations,
      seeds,
    };
  }

  return {
    client: 'better-sqlite3',
    connection: { filename: config.db.path },
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
}

function connect() {
  if (knexInstance) {
    return knexInstance;
  }

  logger.info(`Connecting to database via Knex (client=${config.db.client})`);
  knexInstance = Knex(buildKnexConfig());
  return knexInstance;
}

async function close() {
  if (knexInstance) {
    await knexInstance.destroy();
    knexInstance = null;
    logger.info('Database connection closed.');
  }
}

module.exports = {
  connect,
  close,
  get db() {
    return connect();
  },
};
