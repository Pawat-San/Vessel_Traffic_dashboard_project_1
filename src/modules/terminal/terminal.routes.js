const express = require('express');
const terminalController = require('./terminal.controller');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const { createTerminalSchema, updateTerminalSchema } = require('./terminal.schema');

const router = express.Router();

// All terminal routes require authentication
router.use(authenticate);

// View terminals is allowed for any authenticated user (admin, operator, viewer)
router.get('/', terminalController.getAllTerminals);
router.get('/:id', terminalController.getTerminalById);

// Admin-only endpoints for managing terminals
router.post('/', authorize(['admin']), validate.body(createTerminalSchema), terminalController.createTerminal);
router.put('/:id', authorize(['admin']), validate.body(updateTerminalSchema), terminalController.updateTerminal);
router.delete('/:id', authorize(['admin']), terminalController.deleteTerminal);

module.exports = router;
