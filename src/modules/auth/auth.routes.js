const express = require('express');
const authController = require('./auth.controller');
const validate = require('../../middleware/validate');
const { loginSchema, refreshSchema } = require('./auth.schema');
const { loginRateLimiter } = require('../../middleware/rateLimiter');
const authenticate = require('../../middleware/authenticate');

const router = express.Router();

// Public routes
router.post('/login', loginRateLimiter, validate.body(loginSchema), authController.login);
router.post('/refresh', validate.body(refreshSchema), authController.refresh);

// Protected routes
router.post('/logout', authenticate, authController.logout);

module.exports = router;
