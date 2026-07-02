const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';

module.exports = {
  env: nodeEnv,
  isDev: nodeEnv === 'development',
  isTest: nodeEnv === 'test',
  isProd: nodeEnv === 'production',
  port: parseInt(process.env.PORT || '3000', 10),
  
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
    path: process.env.DB_PATH || path.join(__dirname, '../../data/dashboard.db'),
  },

  logging: {
    level: process.env.LOG_LEVEL || (nodeEnv === 'production' ? 'info' : 'debug'),
  }
};
