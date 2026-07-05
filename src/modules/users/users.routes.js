const express = require('express');
const usersController = require('./users.controller');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const requirePasswordChange = require('../../middleware/requirePasswordChange');
const validate = require('../../middleware/validate');
const {
  createUserSchema,
  updateUserSchema,
  adminResetPasswordSchema,
  selfChangePasswordSchema,
} = require('./users.schema');

const router = express.Router();

// All user routes require authentication
router.use(authenticate);

// Self-service password change must stay reachable even while must_change_password
// is set, so it is registered BEFORE the requirePasswordChange gate.
router.post('/me/change-password', validate.body(selfChangePasswordSchema), usersController.changeOwnPassword);

// Everything below is blocked until a forced password change is completed.
router.use(requirePasswordChange);

// Account management -> Admin or Superadmin only
router.get('/', authorize(['admin', 'superadmin']), usersController.list);
router.get('/:id', authorize(['admin', 'superadmin']), usersController.getById);
router.post('/', authorize(['admin', 'superadmin']), validate.body(createUserSchema), usersController.create);
router.put('/:id', authorize(['admin', 'superadmin']), validate.body(updateUserSchema), usersController.update);
router.delete('/:id', authorize(['admin', 'superadmin']), usersController.deactivate);
router.post('/:id/reset-password', authorize(['admin', 'superadmin']), validate.body(adminResetPasswordSchema), usersController.resetPassword);

module.exports = router;
