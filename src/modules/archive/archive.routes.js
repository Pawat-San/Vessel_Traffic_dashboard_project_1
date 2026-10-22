const express = require('express');
const archiveController = require('./archive.controller');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const requirePasswordChange = require('../../middleware/requirePasswordChange');
const validate = require('../../middleware/validate');
const { purgeQuerySchema } = require('./archive.schema');

const router = express.Router();

// All archive routes require authentication
router.use(authenticate);
router.use(requirePasswordChange);

// View historical logs -> Allowed for all roles
router.get('/', archiveController.getArchivedVessels);

// Superadmin-only maintenance action with validated retention.
router.post('/purge', authorize(['superadmin']), validate.query(purgeQuerySchema), archiveController.purgeArchive);

module.exports = router;
