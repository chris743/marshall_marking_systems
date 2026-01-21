const express = require('express');
const router = express.Router();
const { getPrinters, getPrinter, setPrinter, deletePrinter, savePrinters } = require('../services/printerStore');
const { checkPrinterStatus, getPeelSensorStatus } = require('../services/printerService');

// List all printers
router.get('/', (req, res) => {
  const printers = getPrinters();
  const printerList = Object.entries(printers).map(([id, printer]) => ({
    id,
    ...printer
  }));

  res.json({
    success: true,
    printers: printerList,
    count: printerList.length
  });
});

// Get specific printer
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const printer = getPrinter(id);

  if (!printer) {
    return res.status(404).json({
      success: false,
      error: 'Printer not found'
    });
  }

  res.json({
    success: true,
    printer: { id, ...printer }
  });
});

// Add a new printer
router.post('/', async (req, res) => {
  try {
    const { ip, name, description } = req.body;

    if (!ip) {
      return res.status(400).json({
        success: false,
        error: 'IP address is required'
      });
    }

    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid IP address format'
      });
    }

    const id = `printer_${Date.now()}`;
    const status = await checkPrinterStatus(ip);

    const printerData = {
      ip,
      name: name || `ZT411-${ip}`,
      description: description || '',
      addedAt: new Date().toISOString(),
      lastChecked: new Date().toISOString(),
      status: status.online ? 'online' : 'offline'
    };

    setPrinter(id, printerData);
    savePrinters();

    res.json({
      success: true,
      message: 'Printer added successfully',
      printer: { id, ...printerData }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update printer
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { ip, name, description } = req.body;
    const printer = getPrinter(id);

    if (!printer) {
      return res.status(404).json({
        success: false,
        error: 'Printer not found'
      });
    }

    if (ip) {
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(ip)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid IP address format'
        });
      }
      printer.ip = ip;
    }
    if (name) printer.name = name;
    if (description !== undefined) printer.description = description;

    printer.updatedAt = new Date().toISOString();
    setPrinter(id, printer);
    savePrinters();

    res.json({
      success: true,
      message: 'Printer updated successfully',
      printer: { id, ...printer }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Remove printer
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const printer = getPrinter(id);

    if (!printer) {
      return res.status(404).json({
        success: false,
        error: 'Printer not found'
      });
    }

    deletePrinter(id);
    savePrinters();

    res.json({
      success: true,
      message: 'Printer removed successfully',
      printer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Check printer status
router.get('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const printer = getPrinter(id);

    if (!printer) {
      return res.status(404).json({
        success: false,
        error: 'Printer not found'
      });
    }

    console.log(`\nChecking status for printer: ${printer.name} (${printer.ip})`);
    const status = await checkPrinterStatus(printer.ip);

    const newStatus = status.online ? 'online' : 'offline';
    console.log(`Status result: ${newStatus}`);

    printer.status = newStatus;
    printer.lastChecked = new Date().toISOString();

    setPrinter(id, printer);
    savePrinters();

    res.json({
      success: true,
      printer: { id, ...printer },
      connectivity: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get peel sensor status
router.get('/:id/peel-sensor', async (req, res) => {
  try {
    const { id } = req.params;
    const printer = getPrinter(id);

    if (!printer) {
      return res.status(404).json({
        success: false,
        error: 'Printer not found'
      });
    }

    const peelStatus = await getPeelSensorStatus(printer.ip);

    res.json({
      success: true,
      printer: printer.name,
      ip: printer.ip,
      peelSensor: peelStatus
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
