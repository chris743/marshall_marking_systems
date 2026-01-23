const crypto = require('crypto');
const { sql, getPool, isConnected } = require('../../sqlServerClient');
const { getPrinter } = require('./printerStore');
const { sendZPL } = require('./printerService');
const { substituteProductVars, generateZPLFromElements } = require('./zplGenerator');
const { PRODUCTS_TABLE } = require('../config/constants');

/**
 * Parse scanner data in format: {{prefix}}star;{{type}};{{code}}stop;
 * Example: "0000star;QR Code;A-01stop;"
 * Returns the extracted code (e.g., "A-01") or null if format doesn't match
 */
function parseScannerData(data) {
  if (!data || typeof data !== 'string') return null;

  // Clean the data - keep only printable ASCII
  const cleanData = data.replace(/[^\x20-\x7E]/g, '');
  console.log(`[ScanProcessor] Cleaned data: "${cleanData}"`);

  // Format: {{prefix}}star;{{type}};{{code}}stop;
  // The code is the last segment before "stop;"
  const match = cleanData.match(/star;.*?;([^;]+)stop;?/i);
  if (match && match[1]) {
    const code = match[1].trim();
    console.log(`[ScanProcessor] Extracted code: "${code}"`);
    return code;
  }

  // Fallback: try simpler format star;{{code}}stop;
  const simpleMatch = cleanData.match(/star;([^;]+)stop;?/i);
  if (simpleMatch && simpleMatch[1]) {
    const code = simpleMatch[1].trim();
    console.log(`[ScanProcessor] Extracted code (simple format): "${code}"`);
    return code;
  }

  console.log(`[ScanProcessor] Could not parse data - no valid pattern found`);
  return null;
}

/**
 * Process a scan event and trigger label printing
 * @param {string} scannerId - UUID of the scanner
 * @param {string} licensePlateCode - The scanned barcode/code
 * @returns {object} Result with success status, labels printed, etc.
 */
async function processScan(scannerId, licensePlateCode) {
  if (!isConnected()) {
    return {
      success: false,
      error: 'Database not connected',
      labels_printed: 0
    };
  }

  if (!scannerId || !licensePlateCode) {
    return {
      success: false,
      error: 'scanner_id and license_plate_code are required',
      labels_printed: 0
    };
  }

  try {
    const pool = await getPool();
    const eventId = crypto.randomUUID();

    // First try exact match for the scanned code
    let configsResult = await pool.request()
      .input('scannerId', sql.UniqueIdentifier, scannerId)
      .input('code', sql.VarChar, licensePlateCode)
      .query(`SELECT lpc.*, sl.printer_id, sl.name as location_name, sl.location_number,
              t.elements, t.label_width, t.label_height, t.name as template_name,
              p.*
              FROM labeling_license_plate_configs lpc
              JOIN labeling_scan_locations sl ON lpc.location_id = sl.id
              LEFT JOIN labeling_templates t ON lpc.template_id = t.id
              LEFT JOIN ${PRODUCTS_TABLE} p ON lpc.product_id = p.id
              WHERE sl.scanner_id = @scannerId
              AND lpc.license_plate_code = @code
              AND lpc.enabled = 1
              AND sl.enabled = 1
              ORDER BY sl.location_number`);

    let configs = configsResult.recordset;

    // If no exact match, fall back to DEFAULT configuration
    if (configs.length === 0 && licensePlateCode !== 'DEFAULT') {
      configsResult = await pool.request()
        .input('scannerId', sql.UniqueIdentifier, scannerId)
        .query(`SELECT lpc.*, sl.printer_id, sl.name as location_name, sl.location_number,
                t.elements, t.label_width, t.label_height, t.name as template_name,
                p.*
                FROM labeling_license_plate_configs lpc
                JOIN labeling_scan_locations sl ON lpc.location_id = sl.id
                LEFT JOIN labeling_templates t ON lpc.template_id = t.id
                LEFT JOIN ${PRODUCTS_TABLE} p ON lpc.product_id = p.id
                WHERE sl.scanner_id = @scannerId
                AND lpc.license_plate_code = 'DEFAULT'
                AND lpc.enabled = 1
                AND sl.enabled = 1
                ORDER BY sl.location_number`);
        configs = configsResult.recordset;
    }

    // Add pack_date (today) to each config if not already set
    const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
    configs = configs.map(config => ({
      ...config,
      pack_date: config.pack_date || today
    }));

    if (configs.length === 0) {
      // Log the event with no_config status
      await pool.request()
        .input('id', sql.UniqueIdentifier, eventId)
        .input('scanner_id', sql.UniqueIdentifier, scannerId)
        .input('license_plate_code', sql.VarChar, licensePlateCode)
        .input('status', sql.VarChar, 'no_config')
        .query(`INSERT INTO labeling_scan_events (id, scanner_id, license_plate_code, status)
                VALUES (@id, @scanner_id, @license_plate_code, @status)`);

      return {
        success: true,
        message: 'No print configurations found for this code',
        labels_printed: 0,
        event_id: eventId
      };
    }

    const printResults = [];
    let totalPrinted = 0;
    let hasErrors = false;

    for (const config of configs) {
      if (!config.printer_id || !config.elements) {
        printResults.push({
          location: config.location_name,
          location_number: config.location_number,
          status: 'skipped',
          reason: !config.printer_id ? 'No printer assigned' : 'No template configured'
        });
        continue;
      }

      try {
        const elements = typeof config.elements === 'string'
          ? JSON.parse(config.elements)
          : config.elements;

        const processedElements = elements.map(el => {
          const processed = { ...el };
          if (processed.text) {
            processed.text = substituteProductVars(processed.text, config);
          }
          if (processed.data) {
            processed.data = substituteProductVars(processed.data, config);
          }
          return processed;
        });

        const copies = config.copies || 1;
        // Pass copies to ZPL generator - uses ^PQ command for bulk printing (single request)
        const zpl = await generateZPLFromElements(processedElements, config.label_width, config.label_height, copies);

        const printer = getPrinter(config.printer_id);
        if (!printer) {
          printResults.push({
            location: config.location_name,
            location_number: config.location_number,
            status: 'error',
            reason: `Printer ${config.printer_id} not found`
          });
          hasErrors = true;
          continue;
        }

        // Single request with ^PQ command handles multiple copies
        await sendZPL(printer.ip, zpl);
        totalPrinted += copies;

        printResults.push({
          location: config.location_name,
          location_number: config.location_number,
          printer: config.printer_id,
          copies: copies,
          status: 'success'
        });
      } catch (printError) {
        printResults.push({
          location: config.location_name,
          location_number: config.location_number,
          status: 'error',
          reason: printError.message
        });
        hasErrors = true;
      }
    }

    // Log the scan event
    await pool.request()
      .input('id', sql.UniqueIdentifier, eventId)
      .input('scanner_id', sql.UniqueIdentifier, scannerId)
      .input('license_plate_code', sql.VarChar, licensePlateCode)
      .input('labels_printed', sql.Int, totalPrinted)
      .input('status', sql.VarChar, hasErrors ? 'partial' : 'success')
      .query(`INSERT INTO labeling_scan_events (id, scanner_id, license_plate_code, labels_printed, status)
              VALUES (@id, @scanner_id, @license_plate_code, @labels_printed, @status)`);

    return {
      success: true,
      labels_printed: totalPrinted,
      results: printResults,
      event_id: eventId
    };
  } catch (error) {
    console.error('Scan processing error:', error);
    return {
      success: false,
      error: error.message,
      labels_printed: 0
    };
  }
}

module.exports = {
  parseScannerData,
  processScan
};
