const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';

const FALLBACK_SECRETS = {
  JWT_SECRET: 'fallback-jwt-secret-dev',
  JWT_REFRESH_SECRET: 'fallback-jwt-refresh-secret-dev',
  COOKIE_SECRET: 'fallback-cookie-secret-dev',
};

if (nodeEnv === 'production') {
  const problems = [];
  for (const [envVar, fallbackValue] of Object.entries(FALLBACK_SECRETS)) {
    const value = process.env[envVar];
    if (!value) {
      problems.push(`${envVar} is not set`);
    } else if (value === fallbackValue) {
      problems.push(`${envVar} is set to the insecure default fallback value`);
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `Refusing to start in production with insecure secrets:\n  - ${problems.join('\n  - ')}\n` +
      'Set real, unique values for JWT_SECRET, JWT_REFRESH_SECRET, and COOKIE_SECRET before deploying.'
    );
  }
}

module.exports = {
  env: nodeEnv,
  isDev: nodeEnv === 'development',
  isTest: nodeEnv === 'test',
  isProd: nodeEnv === 'production',
  port: parseInt(process.env.PORT || '3000', 10),

  // Generic default kept in the public repo -- the real company branding is
  // set only via the APP_TITLE env var in the deployment environment.
  appTitle: process.env.APP_TITLE || 'Vessel Traffic Dashboard',

  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-jwt-secret-dev',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback-jwt-refresh-secret-dev',
    accessExpiry: '8h', // 8 hours as requested
    refreshExpiry: '7d', // 7 days as requested
  },
  
  cookie: {
    secret: process.env.COOKIE_SECRET || 'fallback-cookie-secret-dev',
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },
  
  rateLimiter: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },
  
  db: {
    client: process.env.DB_CLIENT === 'pg' ? 'pg' : 'sqlite',
    path: process.env.DB_PATH || path.join(__dirname, '../../data/dashboard.db'),
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true',
  },

  logging: {
    level: process.env.LOG_LEVEL || (nodeEnv === 'production' ? 'info' : 'debug'),
  }
};
