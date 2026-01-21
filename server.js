const app = require('./src/app');
const { PORT } = require('./src/config/constants');
const { getPrinters } = require('./src/services/printerStore');
const scannerManager = require('./src/services/scannerConnectionManager');
const { getPool, isConnected } = require('./sqlServerClient');
const { parseScannerData, processScan } = require('./src/services/scanProcessor');

// Initialize scanner connections after DB is ready
async function initializeScanners() {
  try {
    // Wait for database to be ready (check a few times)
    let attempts = 0;
    while (!isConnected() && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    if (!isConnected()) {
      console.log('Database not connected, skipping scanner initialization');
      return;
    }

    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT * FROM labeling_scanners WHERE enabled = 1');

    const count = await scannerManager.initializeAll(result.recordset);
    console.log(`Initialized ${count} scanner connection(s)`);
  } catch (error) {
    console.error('Failed to initialize scanners:', error.message);
  }
}

// Handle scanner data events - parse and trigger print jobs
scannerManager.on('data', async (scannerId, data, scanner) => {
  console.log(`[Scanner ${scanner?.name || scannerId}] Received raw: ${data}`);

  // Parse the scanner data format: star;{{content}}stop;
  const licensePlateCode = parseScannerData(data);

  if (!licensePlateCode) {
    console.log(`[Scanner ${scanner?.name || scannerId}] Could not parse data, expected format: star;{{content}}stop;`);
    return;
  }

  console.log(`[Scanner ${scanner?.name || scannerId}] Parsed license plate code: ${licensePlateCode}`);

  // Process the scan and trigger prints
  try {
    const result = await processScan(scannerId, licensePlateCode);

    if (result.success) {
      console.log(`[Scanner ${scanner?.name || scannerId}] Printed ${result.labels_printed} label(s) for code: ${licensePlateCode}`);
      if (result.results) {
        result.results.forEach(r => {
          if (r.status === 'success') {
            console.log(`  - ${r.location}: ${r.copies} copies to ${r.printer}`);
          } else if (r.status === 'error') {
            console.log(`  - ${r.location}: ERROR - ${r.reason}`);
          } else if (r.status === 'skipped') {
            console.log(`  - ${r.location}: SKIPPED - ${r.reason}`);
          }
        });
      }
    } else {
      console.error(`[Scanner ${scanner?.name || scannerId}] Scan processing failed: ${result.error || result.message}`);
    }
  } catch (err) {
    console.error(`[Scanner ${scanner?.name || scannerId}] Error processing scan: ${err.message}`);
  }
});

scannerManager.on('connected', (scannerId, scanner) => {
  console.log(`[Scanner ${scanner?.name || scannerId}] Connected`);
});

scannerManager.on('disconnected', (scannerId, scanner) => {
  console.log(`[Scanner ${scanner?.name || scannerId}] Disconnected`);
});

scannerManager.on('error', (scannerId, error, scanner) => {
  console.error(`[Scanner ${scanner?.name || scannerId}] Error: ${error.message}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  scannerManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  scannerManager.shutdown();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`ZT411 Printer API Server running on port ${PORT}`);
  console.log(`Loaded ${Object.keys(getPrinters()).length} printers`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET    /api/health - Health check`);
  console.log(`  GET    /api/printers - List all printers`);
  console.log(`  POST   /api/printers - Add new printer`);
  console.log(`  GET    /api/printers/:id - Get printer details`);
  console.log(`  PUT    /api/printers/:id - Update printer`);
  console.log(`  DELETE /api/printers/:id - Remove printer`);
  console.log(`  GET    /api/printers/:id/status - Check printer status`);
  console.log(`  GET    /api/printers/:id/peel-sensor - Get peel sensor status`);
  console.log(`  POST   /api/printers/:id/print - Send print job (JSON)`);
  console.log(`  POST   /api/printers/:id/print/raw - Send raw ZPL`);
  console.log(`  POST   /api/printers/:id/print/continuous - Start continuous printing`);
  console.log(`  POST   /api/printers/:id/print/continuous/stop - Stop continuous printing`);
  console.log(`  GET    /api/printers/:id/print/continuous/status - Get continuous print status`);
  console.log(`  POST   /api/printers/print/bulk - Send to multiple printers`);
  console.log(`  POST   /api/scan - Handle scan event (trigger prints)`);
  console.log(`  GET    /api/scanners - List scanners`);
  console.log(`  GET    /api/scanners/status - Get scanner connection status`);
  console.log(`  POST   /api/scanners/:id/connect - Connect to scanner`);
  console.log(`  POST   /api/scanners/:id/disconnect - Disconnect from scanner`);
  console.log(`  POST   /api/scanners/:id/test - Test scanner connection`);
  console.log(`  GET    /api/products - List products`);
  console.log(`  GET    /api/templates - List templates`);
  console.log(`  GET    /api/printer-configs - List printer configs`);

  // Initialize scanners after server starts
  initializeScanners();
});
