const express = require('express');
const router = express.Router();
const { getPrinters, getPrinter, setPrinter, savePrinters } = require('../services/printerStore');
const { sendZPL, getPeelSensorStatus } = require('../services/printerService');

// Send ZPL print job (JSON)
router.post('/:id/print', async (req, res) => {
  const { id } = req.params;

  try {
    const { zpl } = req.body;
    const printer = getPrinter(id);

    if (!printer) {
      return res.status(404).json({
        success: false,
        error: 'Printer not found'
      });
    }

    if (!zpl) {
      return res.status(400).json({
        success: false,
        error: 'ZPL data is required'
      });
    }

    const driver = printer.driver || 'zebra';
    await sendZPL(printer.ip, zpl, { driver });

    printer.lastPrint = new Date().toISOString();
    printer.status = 'online';
    setPrinter(id, printer);
    savePrinters();

    res.json({
      success: true,
      message: 'Print job sent successfully',
      printer: printer.name,
      ip: printer.ip,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const printer = getPrinter(id);
    if (printer) {
      printer.status = 'offline';
      setPrinter(id, printer);
      savePrinters();
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Send raw ZPL print job (text/plain)
router.post('/:id/print/raw', async (req, res) => {
  const { id } = req.params;

  try {
    const zpl = req.body;
    const printer = getPrinter(id);

    if (!printer) {
      return res.status(404).json({
        success: false,
        error: 'Printer not found'
      });
    }

    if (!zpl) {
      return res.status(400).json({
        success: false,
        error: 'ZPL data is required'
      });
    }

    const driver = printer.driver || 'zebra';
    await sendZPL(printer.ip, zpl, { driver });

    printer.lastPrint = new Date().toISOString();
    printer.status = 'online';
    setPrinter(id, printer);
    savePrinters();

    res.json({
      success: true,
      message: 'Print job sent successfully',
      printer: printer.name,
      ip: printer.ip,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const printer = getPrinter(id);
    if (printer) {
      printer.status = 'offline';
      setPrinter(id, printer);
      savePrinters();
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Bulk print to multiple printers
router.post('/print/bulk', async (req, res) => {
  try {
    const { printerIds, zpl } = req.body;
    const printers = getPrinters();

    if (!printerIds || !Array.isArray(printerIds) || printerIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Array of printer IDs is required'
      });
    }

    if (!zpl) {
      return res.status(400).json({
        success: false,
        error: 'ZPL data is required'
      });
    }

    const results = [];

    for (const id of printerIds) {
      if (!printers[id]) {
        results.push({
          id,
          success: false,
          error: 'Printer not found'
        });
        continue;
      }

      try {
        const bulkDriver = printers[id].driver || 'zebra';
        await sendZPL(printers[id].ip, zpl, { driver: bulkDriver });
        printers[id].lastPrint = new Date().toISOString();
        printers[id].status = 'online';
        results.push({
          id,
          success: true,
          printer: printers[id].name
        });
      } catch (error) {
        printers[id].status = 'offline';
        results.push({
          id,
          success: false,
          error: error.message
        });
      }
    }

    savePrinters();

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      message: `Print jobs sent to ${successCount}/${printerIds.length} printers`,
      results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Continuous print - waits for label to be taken before printing next
router.post('/:id/print/continuous', async (req, res) => {
  const { id } = req.params;

  try {
    const { zpl, pollInterval = 200 } = req.body;
    const printer = getPrinter(id);

    if (!printer) {
      return res.status(404).json({
        success: false,
        error: 'Printer not found'
      });
    }

    if (!zpl) {
      return res.status(400).json({
        success: false,
        error: 'ZPL data is required'
      });
    }

    // Store continuous print job
    if (!printer.continuousPrint) {
      printer.continuousPrint = {
        active: true,
        zpl: zpl,
        pollInterval: pollInterval,
        count: 0,
        startedAt: new Date().toISOString(),
        waitingForPeel: false
      };
    } else {
      printer.continuousPrint.active = true;
      printer.continuousPrint.zpl = zpl;
      printer.continuousPrint.pollInterval = pollInterval;
      printer.continuousPrint.waitingForPeel = false;
      printer.continuousPrint.count = 0;
      printer.continuousPrint.startedAt = new Date().toISOString();
    }

    setPrinter(id, printer);
    savePrinters();

    // Start continuous printing loop
    const continuousPrintLoop = async () => {
      const contDriver = printer.driver || 'zebra';
      console.log(`Starting continuous print for ${printer.name} (driver: ${contDriver}) - using SGD sensor.peeler command`);
      console.log(`Strategy: Maintaining 2-label queue (1 presented + 1 in buffer)`);

      let labelsInQueue = 0;
      const TARGET_QUEUE_SIZE = 2;

      // Initial queue fill
      console.log(`Initial queue fill: sending ${TARGET_QUEUE_SIZE} labels to ${printer.name}`);
      for (let i = 0; i < TARGET_QUEUE_SIZE; i++) {
        try {
          const currentPrinter = getPrinter(id);
          await sendZPL(printer.ip, currentPrinter.continuousPrint.zpl, { driver: contDriver });
          currentPrinter.continuousPrint.count++;
          labelsInQueue++;
          console.log(`  → Queued label ${currentPrinter.continuousPrint.count} (queue size: ${labelsInQueue})`);
          setPrinter(id, currentPrinter);
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Failed to queue initial label: ${error.message}`);
        }
      }

      const p = getPrinter(id);
      p.status = 'online';
      p.lastPrint = new Date().toISOString();
      setPrinter(id, p);

      await new Promise(resolve => setTimeout(resolve, 500));

      // Main loop
      while (true) {
        const currentPrinter = getPrinter(id);
        if (!currentPrinter || !currentPrinter.continuousPrint || !currentPrinter.continuousPrint.active) {
          break;
        }

        try {
          const peelStatus = await getPeelSensorStatus(currentPrinter.ip, contDriver);

          console.log(`[DEBUG] Peel sensor for ${currentPrinter.name}:`, {
            sensorValue: peelStatus.sensorValue,
            labelTaken: peelStatus.labelTaken,
            labelsInQueue: labelsInQueue
          });

          if (peelStatus.error) {
            console.error(`Printer ${currentPrinter.name} peel sensor check failed: ${peelStatus.error}`);
            await new Promise(resolve => setTimeout(resolve, currentPrinter.continuousPrint.pollInterval));
            continue;
          }

          if (peelStatus.labelTaken && labelsInQueue > 0) {
            labelsInQueue--;
            console.log(`✓ Label taken from ${currentPrinter.name} (queue now: ${labelsInQueue})`);

            if (labelsInQueue < TARGET_QUEUE_SIZE) {
              console.log(`Replenishing: printing label ${currentPrinter.continuousPrint.count + 1} to ${currentPrinter.name}`);

              await sendZPL(currentPrinter.ip, currentPrinter.continuousPrint.zpl, { driver: contDriver });
              currentPrinter.continuousPrint.count++;
              labelsInQueue++;
              currentPrinter.lastPrint = new Date().toISOString();
              setPrinter(id, currentPrinter);

              console.log(`  → Queue replenished (queue size: ${labelsInQueue})`);
            }
          }

          await new Promise(resolve => setTimeout(resolve, currentPrinter.continuousPrint.pollInterval));

        } catch (error) {
          console.error(`Continuous print error for ${currentPrinter.name}:`, error.message);
          currentPrinter.status = 'offline';
          setPrinter(id, currentPrinter);
          await new Promise(resolve => setTimeout(resolve, currentPrinter.continuousPrint.pollInterval * 2));
        }
      }

      const finalPrinter = getPrinter(id);
      if (finalPrinter && finalPrinter.continuousPrint) {
        console.log(`✓ Continuous printing stopped for ${finalPrinter.name}. Total labels: ${finalPrinter.continuousPrint.count}`);
      }
      savePrinters();
    };

    // Start the loop in background
    continuousPrintLoop();

    res.json({
      success: true,
      message: 'Continuous printing started (2-label queue: 1 presented + 1 buffered for instant presentation)',
      printer: printer.name,
      ip: printer.ip,
      pollInterval: pollInterval,
      queueSize: 2,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stop continuous printing
router.post('/:id/print/continuous/stop', (req, res) => {
  const { id } = req.params;

  try {
    const printer = getPrinter(id);

    if (!printer) {
      return res.status(404).json({
        success: false,
        error: 'Printer not found'
      });
    }

    if (!printer.continuousPrint || !printer.continuousPrint.active) {
      return res.json({
        success: true,
        message: 'No active continuous print job',
        printer: printer.name
      });
    }

    const count = printer.continuousPrint.count;
    printer.continuousPrint.active = false;
    setPrinter(id, printer);
    savePrinters();

    res.json({
      success: true,
      message: 'Continuous printing stopped',
      printer: printer.name,
      labelsPrinted: count,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get continuous print status
router.get('/:id/print/continuous/status', (req, res) => {
  const { id } = req.params;

  try {
    const printer = getPrinter(id);

    if (!printer) {
      return res.status(404).json({
        success: false,
        error: 'Printer not found'
      });
    }

    if (!printer.continuousPrint) {
      return res.json({
        success: true,
        active: false,
        printer: printer.name
      });
    }

    res.json({
      success: true,
      active: printer.continuousPrint.active,
      printer: printer.name,
      labelsPrinted: printer.continuousPrint.count,
      waitingForPeel: printer.continuousPrint.waitingForPeel,
      pollInterval: printer.continuousPrint.pollInterval,
      startedAt: printer.continuousPrint.startedAt,
      queueStrategy: '2-label queue (1 presented + 1 in buffer)'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
