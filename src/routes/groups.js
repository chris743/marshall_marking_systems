const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { sql, getPool } = require('../../sqlServerClient');
const { requireDb } = require('../middleware/dbCheck');
const { PRODUCTS_TABLE } = require('../config/constants');

router.use(requireDb);

// List all groups with scanner count
router.get('/groups', async (req, res) => {
  try {
    const pool = await getPool();

    const result = await pool.request()
      .query(`SELECT g.*,
              (SELECT COUNT(*) FROM labeling_group_scanners gs WHERE gs.group_id = g.id) as scanner_count,
              (SELECT COUNT(*) FROM labeling_group_configs gc WHERE gc.group_id = g.id) as code_count
              FROM labeling_groups g
              ORDER BY g.name`);

    res.json({ success: true, groups: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single group with configs and locations
router.get('/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const groupResult = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM labeling_groups WHERE id = @id');

    if (groupResult.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    const group = groupResult.recordset[0];

    // Fetch configs
    const configsResult = await pool.request()
      .input('groupId', sql.UniqueIdentifier, id)
      .query(`SELECT gc.*, lc.code as location_code, lc.description as code_description,
              t.name as template_name,
              p.id as product_id, p.description as product_description, p.gtin,
              p.company_name, p.company_prefix, p.item_reference, p.indicator_digit,
              p.commodity, p.style
              FROM labeling_group_configs gc
              JOIN labeling_location_codes lc ON gc.location_code_id = lc.id
              LEFT JOIN labeling_templates t ON gc.template_id = t.id
              LEFT JOIN ${PRODUCTS_TABLE} p ON gc.product_id = p.id
              WHERE gc.group_id = @groupId
              ORDER BY lc.code`);

    // Fetch scanners
    const scannersResult = await pool.request()
      .input('groupId', sql.UniqueIdentifier, id)
      .query(`SELECT gs.id as assignment_id, s.*
              FROM labeling_group_scanners gs
              JOIN labeling_scanners s ON gs.scanner_id = s.id
              WHERE gs.group_id = @groupId
              ORDER BY s.name`);

    res.json({
      success: true,
      group: {
        ...group,
        configs: configsResult.recordset.map(c => ({
          ...c,
          variable_values: c.variable_values ? JSON.parse(c.variable_values) : {}
        })),
        scanners: scannersResult.recordset
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create group
router.post('/groups', async (req, res) => {
  try {
    const { name, description, printer_id } = req.body;
    const newId = crypto.randomUUID();
    const pool = await getPool();

    await pool.request()
      .input('id', sql.UniqueIdentifier, newId)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('printer_id', sql.VarChar, printer_id || null)
      .query(`INSERT INTO labeling_groups (id, name, description, printer_id)
              VALUES (@id, @name, @description, @printer_id)`);

    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, newId)
      .query('SELECT * FROM labeling_groups WHERE id = @id');

    res.status(201).json({ success: true, group: result.recordset[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update group
router.put('/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, enabled, printer_id } = req.body;
    const pool = await getPool();

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('enabled', sql.Bit, enabled !== false)
      .input('printer_id', sql.VarChar, printer_id || null)
      .query(`UPDATE labeling_groups
              SET name = @name, description = @description, enabled = @enabled, printer_id = @printer_id
              WHERE id = @id`);

    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM labeling_groups WHERE id = @id');

    res.json({ success: true, group: result.recordset[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete group (CASCADE handles configs and locations)
router.delete('/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('DELETE FROM labeling_groups WHERE id = @id');

    res.json({ success: true, message: 'Group deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
