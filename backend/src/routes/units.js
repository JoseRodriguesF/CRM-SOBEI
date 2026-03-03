const express = require('express');
const unitsController = require('../controllers/unitsController');

const router = express.Router();

router.get('/', unitsController.listUnits);
router.post('/', unitsController.createUnit);
router.put('/:id', unitsController.updateUnit);
router.delete('/:id', unitsController.deleteUnit);

module.exports = router;
