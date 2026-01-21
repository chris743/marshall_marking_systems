const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../../sqlServerClient');
const { requireDb } = require('../middleware/dbCheck');
const { processScan } = require('../services/scanProcessor');

router.use(requireDb);

// Handle incoming scan event - triggers label printing
router.post('/scan', async (req, res) => {
  try {
    const { scanner_id, license_plate_code } = req.body;

    if (!scanner_id || !license_plate_code) {
      return res.status(400).json({
        success: false,
        error: 'scanner_id and license_plate_code are required'
      });
    }

    const result = await processScan(scanner_id, license_plate_code);

    if (result.success) {
      res.json(result);
    } else {
      res.status(result.error === 'Database not connected' ? 503 : 400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get scan event history
router.get('/scan-events', async (req, res) => {
  try {
    const { scanner_id, limit = 100, offset = 0 } = req.query;
    const pool = await getPool();

    let query = `SELECT se.*, s.name as scanner_name
                 FROM labeling_scan_events se
                 JOIN labeling_scanners s ON se.scanner_id = s.id`;

    if (scanner_id) {
      query += ` WHERE se.scanner_id = @scannerId`;
    }

    query += ` ORDER BY se.scanned_at DESC
               OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;

    const request = pool.request()
      .input('limit', sql.Int, parseInt(limit))
      .input('offset', sql.Int, parseInt(offset));

    if (scanner_id) {
      request.input('scannerId', sql.UniqueIdentifier, scanner_id);
    }

    const result = await request.query(query);

    res.json({ success: true, events: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
