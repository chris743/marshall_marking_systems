const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { sql, getPool } = require('../../sqlServerClient');
const { requireDb } = require('../middleware/dbCheck');
const { PRODUCTS_TABLE } = require('../config/constants');

router.use(requireDb);

// List locations for a scanner
router.get('/scanners/:scannerId/locations', async (req, res) => {
  try {
    const { scannerId } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input('scannerId', sql.UniqueIdentifier, scannerId)
      .query('SELECT * FROM labeling_scan_locations WHERE scanner_id = @scannerId ORDER BY location_number ASC');

    res.json({ success: true, locations: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create location
router.post('/scanners/:scannerId/locations', async (req, res) => {
  try {
    const { scannerId } = req.params;
    const { location_number, name, printer_id, enabled } = req.body;
    const newId = crypto.randomUUID();
    const pool = await getPool();

    await pool.request()
      .input('id', sql.UniqueIdentifier, newId)
      .input('scanner_id', sql.UniqueIdentifier, scannerId)
      .input('location_number', sql.Int, location_number)
      .input('name', sql.NVarChar, name)
      .input('printer_id', sql.VarChar, printer_id || null)
      .input('enabled', sql.Bit, enabled !== false)
      .query(`INSERT INTO labeling_scan_locations (id, scanner_id, location_number, name, printer_id, enabled)
              VALUES (@id, @scanner_id, @location_number, @name, @printer_id, @enabled)`);

    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, newId)
      .query('SELECT * FROM labeling_scan_locations WHERE id = @id');

    res.status(201).json({ success: true, location: result.recordset[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update location
router.put('/locations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, printer_id, enabled } = req.body;
    const pool = await getPool();

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .input('name', sql.NVarChar, name)
      .input('printer_id', sql.VarChar, printer_id || null)
      .input('enabled', sql.Bit, enabled !== false)
      .query(`UPDATE labeling_scan_locations SET name = @name, printer_id = @printer_id,
              enabled = @enabled WHERE id = @id`);

    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM labeling_scan_locations WHERE id = @id');

    res.json({ success: true, location: result.recordset[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete location
router.delete('/locations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('DELETE FROM labeling_scan_locations WHERE id = @id');

    res.json({ success: true, message: 'Location deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get configs for a specific location
router.get('/locations/:locationId/configs', async (req, res) => {
  try {
    const { locationId } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input('locationId', sql.UniqueIdentifier, locationId)
      .query(`SELECT lpc.*, t.name as template_name,
              p.id as product_id, p.description as product_description, p.gtin,
              p.company_name, p.company_prefix, p.item_reference, p.indicator_digit,
              p.external_upc, p.external_plu, p.commodity, p.style
              FROM labeling_license_plate_configs lpc
              LEFT JOIN labeling_templates t ON lpc.template_id = t.id
              LEFT JOIN ${PRODUCTS_TABLE} p ON lpc.product_id = p.id
              WHERE lpc.location_id = @locationId
              ORDER BY lpc.license_plate_code`);

    const configs = result.recordset.map(config => ({
      ...config,
      variable_values: config.variable_values ? JSON.parse(config.variable_values) : {}
    }));

    res.json({ success: true, configs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
