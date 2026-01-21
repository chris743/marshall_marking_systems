const express = require('express');
const router = express.Router();
const { getPrinters } = require('../services/printerStore');

// Health check endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    status: 'running',
    timestamp: new Date().toISOString(),
    printerCount: Object.keys(getPrinters()).length
  });
});

module.exports = router;
