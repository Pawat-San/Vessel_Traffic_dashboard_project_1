const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

let dbInstance = null;

function connect() {
  if (dbInstance) {
    return dbInstance;
  }

  // Resolve directory for DB file and ensure it exists
  const dbDir = path.dirname(config.db.path);
  if (!fs.existsSync(dbDir) && config.db.path !== ':memory:') {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  try {
    logger.info(`Connecting to SQLite database via node:sqlite at: ${config.db.path}`);
    
    const rawDb = new DatabaseSync(config.db.path);

    // Apply performance pragmas & settings (WAL Mode)
    rawDb.exec('PRAGMA journal_mode = WAL');
    rawDb.exec('PRAGMA busy_timeout = 5000');
    rawDb.exec('PRAGMA synchronous = NORMAL');
    rawDb.exec('PRAGMA cache_size = -64000'); // 64MB cache
    rawDb.exec('PRAGMA foreign_keys = ON');

    // Create a compatible wrapper that emulates better-sqlite3 API
    dbInstance = {
      exec(sql) {
        rawDb.exec(sql);
        return this;
      },
      pragma(sql) {
        rawDb.exec(`PRAGMA ${sql}`);
        return this;
      },
      prepare(sql) {
        const stmt = rawDb.prepare(sql);
        
        // Wrap the statement object to automatically format parameters
        return {
          run(...args) {
            if (args.length === 0) return stmt.run();
            if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
              return stmt.run(formatParamsForSql(args[0], sql));
            }
            return stmt.run(...args);
          },
          get(...args) {
            if (args.length === 0) return stmt.get();
            if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
              return stmt.get(formatParamsForSql(args[0], sql));
            }
            return stmt.get(...args);
          },
          all(...args) {
            if (args.length === 0) return stmt.all();
            if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
              return stmt.all(formatParamsForSql(args[0], sql));
            }
            return stmt.all(...args);
          }
        };
      },
      transaction(fn) {
        return (...args) => {
          rawDb.exec('BEGIN TRANSACTION');
          try {
            const result = fn(...args);
            rawDb.exec('COMMIT');
            return result;
          } catch (err) {
            rawDb.exec('ROLLBACK');
            throw err;
          }
        };
      },
      close() {
        rawDb.close();
      }
    };

    logger.info('Database connection established and performance pragmas applied.');
    return dbInstance;
  } catch (error) {
    logger.error('Failed to connect to SQLite database', { error: error.message });
    throw error;
  }
}

/**
 * Extracts placeholders from the SQL query and maps corresponding key values from params
 */
function formatParamsForSql(params, sql) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return params;
  }
  const placeholders = sql.match(/[@$:][a-zA-Z_0-9]+/g);
  if (!placeholders) {
    return params;
  }
  
  const formatted = {};
  for (const placeholder of placeholders) {
    const keyWithoutPrefix = placeholder.substring(1);
    if (params[placeholder] !== undefined) {
      formatted[placeholder] = params[placeholder];
    } else if (params[keyWithoutPrefix] !== undefined) {
      formatted[placeholder] = params[keyWithoutPrefix];
    }
  }
  return formatted;
}

function close() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    logger.info('Database connection closed.');
  }
}

module.exports = {
  connect,
  close,
  get db() {
    return connect();
  }
};
