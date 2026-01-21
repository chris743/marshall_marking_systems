const express = require('express');
const router = express.Router();

const healthRoutes = require('./health');
const printerRoutes = require('./printers');
const printRoutes = require('./print');
const productRoutes = require('./products');
const templateRoutes = require('./templates');
const variableRoutes = require('./variables');
const printerConfigRoutes = require('./printerConfigs');
const scannerRoutes = require('./scanners');
const scanLocationRoutes = require('./scanLocations');
const licensePlateRoutes = require('./licensePlates');
const scanEventRoutes = require('./scanEvents');

// Health check
router.use('/health', healthRoutes);

// Printer management
router.use('/printers', printerRoutes);
router.use('/printers', printRoutes);

// Bulk print (needs special path handling)
router.post('/printers/print/bulk', printRoutes);

// Products
router.use('/products', productRoutes);

// Templates
router.use('/templates', templateRoutes);

// Variables - template scoped and direct
router.use('/', variableRoutes);

// Printer configs
router.use('/printer-configs', printerConfigRoutes);

// Scanners
router.use('/scanners', scannerRoutes);

// Scan locations (mounted at root for /scanners/:id/locations and /locations/:id)
router.use('/', scanLocationRoutes);

// License plates
router.use('/', licensePlateRoutes);

// Scan events
router.use('/', scanEventRoutes);

module.exports = router;
