const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const yaml = require('yamljs');
const path = require('path');

const config = require('./config');
const requestLogger = require('./middleware/requestLogger');
const { apiRateLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const { NotFoundError } = require('./utils/errors');

// Import routes
const authRoutes = require('./modules/auth/auth.routes');
const terminalRoutes = require('./modules/terminal/terminal.routes');
const vesselRoutes = require('./modules/vessel/vessel.routes');
const archiveRoutes = require('./modules/archive/archive.routes');
const usersRoutes = require('./modules/users/users.routes');

const app = express();

// Trust the first hop reverse proxy (Render, and most PaaS hosts, sit in front
// of the app). Without this, req.ip resolves to the proxy's internal address
// for every request, which would make the per-IP rate limiter and login
// lockout treat all users as a single client.
if (config.isProd) {
  app.set('trust proxy', 1);
}

// 1. Security Headers (Helmet.js)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow UI script blocks
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

// 2. CORS Policy
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
}));

// 3. Payload Parsing & Compression
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(config.cookie.secret));

// 4. Request Logging (Structured metadata)
app.use(requestLogger);

// 5. Serve static files (Frontend SPA)
app.use(express.static(path.join(__dirname, '../public')));

// 6. Serve Swagger UI on /api/docs
try {
  const swaggerDocument = yaml.load(path.join(__dirname, '../docs/openapi.yaml'));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (err) {
  console.error('Failed to load Swagger documentation', err);
}

// 7. General API Rate Limiting
app.use('/api', apiRateLimiter);

// 8. Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      uptime: Math.round(process.uptime()),
      database: 'connected',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    }
  });
});

// 9. Module Routing
app.use('/api/auth', authRoutes);
app.use('/api/terminals', terminalRoutes);
app.use('/api/vessels', vesselRoutes);
app.use('/api/archive', archiveRoutes);
app.use('/api/users', usersRoutes);

// 10. Handle unknown API routes (404)
app.all('/api/*', (req, res, next) => {
  next(new NotFoundError(`Endpoint ${req.originalUrl} not found on this server`));
});

// For non-API routes, let the client-side router handle SPA routing or serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 11. Global Error Handler (Express Middleware Chain endpoint)
app.use(errorHandler);

module.exports = app;
