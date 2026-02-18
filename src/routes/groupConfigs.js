const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { sql, getPool } = require('../../sqlServerClient');
const { requireDb } = require('../middleware/dbCheck');
const { PRODUCTS_TABLE } = require('../config/constants');

router.use(requireDb);

// List configs for a group (joined with location_code, template, product)
router.get('/groups/:groupId/configs', async (req, res) => {
  try {
    const { groupId } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input('groupId', sql.UniqueIdentifier, groupId)
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

    const configs = result.recordset.map(c => ({
      ...c,
      variable_values: c.variable_values ? JSON.parse(c.variable_values) : {}
    }));

    res.json({ success: true, configs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upsert config (check by group_id + location_code_id)
router.post('/group-configs', async (req, res) => {
  try {
    const { group_id, location_code_id, template_id, product_id, copies, enabled, lot_number, pack_date, pack_date_format, pack_date_offset, variable_values } = req.body;
    const pool = await getPool();
    const variableValuesJson = JSON.stringify(variable_values || {});

    const existing = await pool.request()
      .input('groupId', sql.UniqueIdentifier, group_id)
      .input('codeId', sql.UniqueIdentifier, location_code_id)
      .query(`SELECT id FROM labeling_group_configs
              WHERE group_id = @groupId AND location_code_id = @codeId`);

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
        .query(`UPDATE labeling_group_configs
                SET template_id = @template_id, product_id = @product_id, copies = @copies,
                    lot_number = @lot_number, pack_date = @pack_date, pack_date_format = @pack_date_format,
                    pack_date_offset = @pack_date_offset, variable_values = @variable_values, enabled = @enabled
                WHERE id = @id`);

      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, existingId)
        .query('SELECT * FROM labeling_group_configs WHERE id = @id');

      res.json({ success: true, config: result.recordset[0], updated: true });
    } else {
      const newId = crypto.randomUUID();
      await pool.request()
        .input('id', sql.UniqueIdentifier, newId)
        .input('group_id', sql.UniqueIdentifier, group_id)
        .input('location_code_id', sql.UniqueIdentifier, location_code_id)
        .input('template_id', sql.UniqueIdentifier, template_id || null)
        .input('product_id', sql.UniqueIdentifier, product_id || null)
        .input('copies', sql.Int, copies || 1)
        .input('lot_number', sql.VarChar, lot_number || '')
        .input('pack_date', sql.VarChar, pack_date || '')
        .input('pack_date_format', sql.VarChar, pack_date_format || 'YYMMDD')
        .input('pack_date_offset', sql.Int, pack_date_offset || 0)
        .input('variable_values', sql.NVarChar, variableValuesJson)
        .input('enabled', sql.Bit, enabled !== false)
        .query(`INSERT INTO labeling_group_configs
                (id, group_id, location_code_id, template_id, product_id, copies, lot_number, pack_date, pack_date_format, pack_date_offset, variable_values, enabled)
                VALUES (@id, @group_id, @location_code_id, @template_id, @product_id, @copies, @lot_number, @pack_date, @pack_date_format, @pack_date_offset, @variable_values, @enabled)`);

      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, newId)
        .query('SELECT * FROM labeling_group_configs WHERE id = @id');

      res.status(201).json({ success: true, config: result.recordset[0], created: true });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a config
router.delete('/group-configs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('DELETE FROM labeling_group_configs WHERE id = @id');

    res.json({ success: true, message: 'Config deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
