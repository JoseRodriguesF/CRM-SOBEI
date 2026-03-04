const express = require('express');
const unitsController = require('../controllers/unitsController');

const router = express.Router();

// Unidades
router.get('/', unitsController.listUnits);
router.post('/', unitsController.createUnit);
router.put('/:id', unitsController.updateUnit);
router.delete('/:id', unitsController.deleteUnit);

// Serviços de uma unidade
router.get('/:unitId/services', unitsController.listServices);
router.post('/:unitId/services', unitsController.createService);
router.put('/:unitId/services/:serviceId', unitsController.updateService);
router.delete('/:unitId/services/:serviceId', unitsController.deleteService);

module.exports = router;
