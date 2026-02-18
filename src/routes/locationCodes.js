const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { sql, getPool } = require('../../sqlServerClient');
const { requireDb } = require('../middleware/dbCheck');

router.use(requireDb);

// List all location codes
router.get('/location-codes', async (req, res) => {
  try {
    const pool = await getPool();

    const result = await pool.request()
      .query(`SELECT lc.*,
              (SELECT COUNT(*) FROM labeling_group_configs gc WHERE gc.location_code_id = lc.id) as usage_count
              FROM labeling_location_codes lc
              ORDER BY lc.code`);

    res.json({ success: true, codes: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create location code
router.post('/location-codes', async (req, res) => {
  try {
    const { code, description } = req.body;
    const newId = crypto.randomUUID();
    const pool = await getPool();

    await pool.request()
      .input('id', sql.UniqueIdentifier, newId)
      .input('code', sql.VarChar, code)
      .input('description', sql.NVarChar, description || null)
      .query(`INSERT INTO labeling_location_codes (id, code, description)
              VALUES (@id, @code, @description)`);

    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, newId)
      .query('SELECT * FROM labeling_location_codes WHERE id = @id');

    res.status(201).json({ success: true, code: result.recordset[0] });
  } catch (error) {
    if (error.message.includes('UQ_location_codes_code')) {
      return res.status(409).json({ success: false, error: 'Code already exists' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update location code
router.put('/location-codes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, description, enabled } = req.body;
    const pool = await getPool();

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .input('code', sql.VarChar, code)
      .input('description', sql.NVarChar, description || null)
      .input('enabled', sql.Bit, enabled !== false)
      .query(`UPDATE labeling_location_codes
              SET code = @code, description = @description, enabled = @enabled
              WHERE id = @id`);

    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM labeling_location_codes WHERE id = @id');

    res.json({ success: true, code: result.recordset[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete location code
router.delete('/location-codes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    // Check if in use
    const usage = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT COUNT(*) as cnt FROM labeling_group_configs WHERE location_code_id = @id');

    if (usage.recordset[0].cnt > 0) {
      return res.status(409).json({
        success: false,
        error: `Code is used in ${usage.recordset[0].cnt} group config(s). Remove those first.`
      });
    }

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('DELETE FROM labeling_location_codes WHERE id = @id');

    res.json({ success: true, message: 'Location code deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
