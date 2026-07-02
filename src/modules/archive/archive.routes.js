const express = require('express');
const archiveController = require('./archive.controller');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');

const router = express.Router();

// All archive routes require authentication
router.use(authenticate);

// View historical logs -> Allowed for all roles
router.get('/', archiveController.getArchivedVessels);

// Admin-only maintenance action to purge 90-day logs
router.post('/purge', authorize(['admin']), archiveController.purgeArchive);

module.exports = router;
