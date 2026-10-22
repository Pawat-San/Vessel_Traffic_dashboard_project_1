const express = require('express');
const authController = require('./auth.controller');
const validate = require('../../middleware/validate');
const { loginSchema } = require('./auth.schema');
const authOrigin = require('../../middleware/authOrigin');
const { loginRateLimiter, refreshRateLimiter } = require('../../middleware/rateLimiter');
const authenticate = require('../../middleware/authenticate');

const router = express.Router();

// Public routes
router.post('/login', authOrigin, validate.body(loginSchema), loginRateLimiter, authController.login);
router.post('/refresh', authOrigin, refreshRateLimiter, authController.refresh);

// Protected routes
router.post('/logout', authOrigin, authenticate, authController.logout);

module.exports = router;
