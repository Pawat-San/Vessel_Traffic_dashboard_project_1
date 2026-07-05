const express = require('express');
const vesselController = require('./vessel.controller');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const requirePasswordChange = require('../../middleware/requirePasswordChange');
const validate = require('../../middleware/validate');
const { createVesselSchema, updateVesselSchema, queryVesselSchema } = require('./vessel.schema');

const router = express.Router();

// All vessel routes require authentication
router.use(authenticate);
router.use(requirePasswordChange);

// View endpoints (Admin, Operator, Viewer can access)
router.get('/', validate.query(queryVesselSchema), vesselController.getVessels);
router.get('/summary', vesselController.getVesselSummary);
router.get('/:id', vesselController.getVesselById);

// Mutation endpoints
// Add/Edit Vessel -> Admin or Operator
router.post('/', authorize(['admin', 'operator']), validate.body(createVesselSchema), vesselController.createVessel);
router.put('/:id', authorize(['admin', 'operator']), validate.body(updateVesselSchema), vesselController.updateVessel);

// Delete Vessel -> Admin only
router.delete('/:id', authorize(['admin']), vesselController.deleteVessel);

// Trigger archiving manually -> Admin only
router.post('/archive', authorize(['admin']), vesselController.triggerArchive);

module.exports = router;
