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
  listUsersQuerySchema,
  activityEventsQuerySchema,
} = require('./users.schema');

const router = express.Router();

// All user routes require authentication
router.use(authenticate);

// Self-service password change must stay reachable even while must_change_password
// is set, so it is registered BEFORE the requirePasswordChange gate.
router.post('/me/change-password', validate.body(selfChangePasswordSchema), usersController.changeOwnPassword);

// Everything below is blocked until a forced password change is completed.
router.use(requirePasswordChange);

// Activity reporting and all Account Management are Superadmin-only.
// Fixed paths must remain above /:id so Express does not treat them as IDs.
router.get('/activity-summary', authorize(['superadmin']), usersController.activitySummary);
router.get('/activity-events', authorize(['superadmin']), validate.query(activityEventsQuerySchema), usersController.activityEvents);
router.get('/:id/activity-events', authorize(['superadmin']), validate.query(activityEventsQuerySchema), usersController.activityEvents);
router.get('/', authorize(['superadmin']), validate.query(listUsersQuerySchema), usersController.list);
router.get('/:id', authorize(['superadmin']), usersController.getById);
router.post('/', authorize(['superadmin']), validate.body(createUserSchema), usersController.create);
router.put('/:id', authorize(['superadmin']), validate.body(updateUserSchema), usersController.update);
router.delete('/:id', authorize(['superadmin']), usersController.deactivate);
router.post('/:id/reset-password', authorize(['superadmin']), validate.body(adminResetPasswordSchema), usersController.resetPassword);

module.exports = router;
