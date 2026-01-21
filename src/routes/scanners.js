const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { sql, getPool } = require('../../sqlServerClient');
const { requireDb } = require('../middleware/dbCheck');
const scannerManager = require('../services/scannerConnectionManager');

router.use(requireDb);

// Get all scanner connection statuses
router.get('/status', (req, res) => {
  try {
    const status = scannerManager.getStatus();
    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get status for a specific scanner
router.get('/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const status = scannerManager.getScannerStatus(id);
    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Connect to a specific scanner
router.post('/:id/connect', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM labeling_scanners WHERE id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Scanner not found' });
    }

    const scanner = result.recordset[0];
    const connected = await scannerManager.connect(scanner);

    res.json({
      success: true,
      message: connected ? 'Connection initiated' : 'Connection failed',
      connected
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Disconnect from a specific scanner
router.post('/:id/disconnect', (req, res) => {
  try {
    const { id } = req.params;
    const disconnected = scannerManager.disconnect(id);

    res.json({
      success: true,
      message: disconnected ? 'Disconnected' : 'Scanner was not connected',
      disconnected
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test connection to a scanner (one-shot test)
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM labeling_scanners WHERE id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Scanner not found' });
    }

    const scanner = result.recordset[0];
    const testResult = await scannerManager.testConnection(scanner);

    res.json({
      success: testResult.success,
      message: testResult.message || testResult.error
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List all scanners
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT * FROM labeling_scanners ORDER BY name ASC');

    res.json({ success: true, scanners: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single scanner with locations
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const scannerResult = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM labeling_scanners WHERE id = @id');

    if (scannerResult.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Scanner not found' });
    }

    const locationsResult = await pool.request()
      .input('scannerId', sql.UniqueIdentifier, id)
      .query('SELECT * FROM labeling_scan_locations WHERE scanner_id = @scannerId ORDER BY location_number ASC');

    res.json({
      success: true,
      scanner: {
        ...scannerResult.recordset[0],
        locations: locationsResult.recordset
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create scanner
router.post('/', async (req, res) => {
  try {
    const { name, description, connection_type, connection_string, enabled } = req.body;
    const newId = crypto.randomUUID();
    const pool = await getPool();

    await pool.request()
      .input('id', sql.UniqueIdentifier, newId)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('connection_type', sql.VarChar, connection_type || 'serial')
      .input('connection_string', sql.NVarChar, connection_string || null)
      .input('enabled', sql.Bit, enabled !== false)
      .query(`INSERT INTO labeling_scanners (id, name, description, connection_type, connection_string, enabled)
              VALUES (@id, @name, @description, @connection_type, @connection_string, @enabled)`);

    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, newId)
      .query('SELECT * FROM labeling_scanners WHERE id = @id');

    const scanner = result.recordset[0];

    // If enabled and network type, connect to it
    if (scanner.enabled && scanner.connection_type === 'network' && scanner.connection_string) {
      scannerManager.connect(scanner).catch(err => {
        console.error(`Failed to connect to new scanner ${scanner.name}:`, err);
      });
    }

    res.status(201).json({ success: true, scanner });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update scanner
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, connection_type, connection_string, enabled } = req.body;
    const pool = await getPool();

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('connection_type', sql.VarChar, connection_type || 'serial')
      .input('connection_string', sql.NVarChar, connection_string || null)
      .input('enabled', sql.Bit, enabled !== false)
      .query(`UPDATE labeling_scanners SET name = @name, description = @description,
              connection_type = @connection_type, connection_string = @connection_string,
              enabled = @enabled WHERE id = @id`);

    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM labeling_scanners WHERE id = @id');

    const scanner = result.recordset[0];

    // Refresh scanner connection (reconnect if config changed)
    scannerManager.refreshScanner(scanner).catch(err => {
      console.error(`Failed to refresh scanner ${scanner.name}:`, err);
    });

    res.json({ success: true, scanner });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete scanner
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    // Disconnect scanner before deleting
    scannerManager.disconnect(id);

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('DELETE FROM labeling_scanners WHERE id = @id');

    res.json({ success: true, message: 'Scanner deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
