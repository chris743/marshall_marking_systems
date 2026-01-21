const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { sql, getPool } = require('../../sqlServerClient');
const { requireDb } = require('../middleware/dbCheck');
const { PRODUCTS_TABLE } = require('../config/constants');

router.use(requireDb);

// Get configs for a license plate code
router.get('/license-plates/:code/configs', async (req, res) => {
  try {
    const { code } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input('code', sql.VarChar, code)
      .query(`SELECT lpc.*, sl.name as location_name, sl.location_number, sl.printer_id,
              s.name as scanner_name, t.name as template_name,
              p.id as product_id, p.description as product_description, p.gtin,
              p.company_name, p.company_prefix, p.item_reference, p.indicator_digit,
              p.commodity, p.style
              FROM labeling_license_plate_configs lpc
              JOIN labeling_scan_locations sl ON lpc.location_id = sl.id
              JOIN labeling_scanners s ON sl.scanner_id = s.id
              LEFT JOIN labeling_templates t ON lpc.template_id = t.id
              LEFT JOIN ${PRODUCTS_TABLE} p ON lpc.product_id = p.id
              WHERE lpc.license_plate_code = @code
              ORDER BY s.name, sl.location_number`);

    res.json({ success: true, configs: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create/update license plate config
router.post('/license-plate-configs', async (req, res) => {
  try {
    const { license_plate_code, location_id, template_id, product_id, copies, enabled, lot_number, pack_date, pack_date_format, pack_date_offset, variable_values } = req.body;
    const pool = await getPool();
    const variableValuesJson = JSON.stringify(variable_values || {});

    const existing = await pool.request()
      .input('code', sql.VarChar, license_plate_code)
      .input('locationId', sql.UniqueIdentifier, location_id)
      .query(`SELECT id FROM labeling_license_plate_configs
              WHERE license_plate_code = @code AND location_id = @locationId`);

    if (existing.recordset.length > 0) {
      const existingId = existing.recordset[0].id;
      await pool.request()
        .input('id', sql.UniqueIdentifier, existingId)
        .input('template_id', sql.UniqueIdentifier, template_id || null)
        .input('product_id', sql.UniqueIdentifier, product_id || null)
        .input('copies', sql.Int, copies || 1)
        .input('lot_number', sql.VarChar, lot_number || '')
        .input('pack_date', sql.VarChar, pack_date || '')
        .input('pack_date_format', sql.VarChar, pack_date_format || 'YYMMDD')
        .input('pack_date_offset', sql.Int, pack_date_offset || 0)
        .input('variable_values', sql.NVarChar, variableValuesJson)
        .input('enabled', sql.Bit, enabled !== false)
        .query(`UPDATE labeling_license_plate_configs
                SET template_id = @template_id, product_id = @product_id, copies = @copies,
                    lot_number = @lot_number, pack_date = @pack_date, pack_date_format = @pack_date_format,
                    pack_date_offset = @pack_date_offset, variable_values = @variable_values, enabled = @enabled
                WHERE id = @id`);

      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, existingId)
        .query('SELECT * FROM labeling_license_plate_configs WHERE id = @id');

      res.json({ success: true, config: result.recordset[0], updated: true });
    } else {
      const newId = crypto.randomUUID();
      await pool.request()
        .input('id', sql.UniqueIdentifier, newId)
        .input('license_plate_code', sql.VarChar, license_plate_code)
        .input('location_id', sql.UniqueIdentifier, location_id)
        .input('template_id', sql.UniqueIdentifier, template_id || null)
        .input('product_id', sql.UniqueIdentifier, product_id || null)
        .input('copies', sql.Int, copies || 1)
        .input('lot_number', sql.VarChar, lot_number || '')
        .input('pack_date', sql.VarChar, pack_date || '')
        .input('pack_date_format', sql.VarChar, pack_date_format || 'YYMMDD')
        .input('pack_date_offset', sql.Int, pack_date_offset || 0)
        .input('variable_values', sql.NVarChar, variableValuesJson)
        .input('enabled', sql.Bit, enabled !== false)
        .query(`INSERT INTO labeling_license_plate_configs
                (id, license_plate_code, location_id, template_id, product_id, copies, lot_number, pack_date, pack_date_format, pack_date_offset, variable_values, enabled)
                VALUES (@id, @license_plate_code, @location_id, @template_id, @product_id, @copies, @lot_number, @pack_date, @pack_date_format, @pack_date_offset, @variable_values, @enabled)`);

      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, newId)
        .query('SELECT * FROM labeling_license_plate_configs WHERE id = @id');

      res.status(201).json({ success: true, config: result.recordset[0], created: true });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete license plate config
router.delete('/license-plate-configs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('DELETE FROM labeling_license_plate_configs WHERE id = @id');

    res.json({ success: true, message: 'Config deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
