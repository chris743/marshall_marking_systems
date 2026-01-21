const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { sql, getPool } = require('../../sqlServerClient');
const { requireDb } = require('../middleware/dbCheck');

router.use(requireDb);

// Get all variables for a template
router.get('/templates/:templateId/variables', async (req, res) => {
  try {
    const { templateId } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input('templateId', sql.UniqueIdentifier, templateId)
      .query('SELECT * FROM labeling_variables WHERE template_id = @templateId ORDER BY sort_order, created_at');

    const variables = result.recordset.map(v => ({
      ...v,
      options: v.options ? (typeof v.options === 'string' ? JSON.parse(v.options) : v.options) : null
    }));

    res.json({
      success: true,
      variables: variables
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create variable for a template
router.post('/templates/:templateId/variables', async (req, res) => {
  try {
    const { templateId } = req.params;
    const { key, label, default_value, field_type, options, required, sort_order } = req.body;

    if (!key || !label) {
      return res.status(400).json({
        success: false,
        error: 'Key and label are required'
      });
    }

    const pool = await getPool();
    const newId = crypto.randomUUID();

    await pool.request()
      .input('id', sql.UniqueIdentifier, newId)
      .input('template_id', sql.UniqueIdentifier, templateId)
      .input('key', sql.VarChar, key)
      .input('label', sql.NVarChar, label)
      .input('default_value', sql.NVarChar, default_value || '')
      .input('field_type', sql.VarChar, field_type || 'text')
      .input('options', sql.NVarChar, options ? JSON.stringify(options) : null)
      .input('required', sql.Bit, required || false)
      .input('sort_order', sql.Int, sort_order || 0)
      .query(`
        INSERT INTO labeling_variables (id, template_id, [key], label, default_value, field_type, options, required, sort_order)
        VALUES (@id, @template_id, @key, @label, @default_value, @field_type, @options, @required, @sort_order)
      `);

    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, newId)
      .query('SELECT * FROM labeling_variables WHERE id = @id');

    const variable = result.recordset[0];
    if (variable.options) {
      variable.options = typeof variable.options === 'string' ? JSON.parse(variable.options) : variable.options;
    }

    res.json({
      success: true,
      message: 'Variable created successfully',
      variable: variable
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Bulk upsert variables for a template
router.put('/templates/:templateId/variables', async (req, res) => {
  try {
    const { templateId } = req.params;
    const { variables } = req.body;

    if (!Array.isArray(variables)) {
      return res.status(400).json({
        success: false,
        error: 'Variables must be an array'
      });
    }

    const pool = await getPool();

    // Delete existing variables for this template
    await pool.request()
      .input('templateId', sql.UniqueIdentifier, templateId)
      .query('DELETE FROM labeling_variables WHERE template_id = @templateId');

    // Insert new variables
    if (variables.length > 0) {
      for (let i = 0; i < variables.length; i++) {
        const v = variables[i];
        await pool.request()
          .input('template_id', sql.UniqueIdentifier, templateId)
          .input('key', sql.VarChar, v.key)
          .input('label', sql.NVarChar, v.label)
          .input('default_value', sql.NVarChar, v.default_value || v.defaultValue || '')
          .input('field_type', sql.VarChar, v.field_type || v.fieldType || 'text')
          .input('options', sql.NVarChar, v.options ? JSON.stringify(v.options) : null)
          .input('required', sql.Bit, v.required || false)
          .input('sort_order', sql.Int, v.sort_order ?? i)
          .query(`
            INSERT INTO labeling_variables (template_id, [key], label, default_value, field_type, options, required, sort_order)
            VALUES (@template_id, @key, @label, @default_value, @field_type, @options, @required, @sort_order)
          `);
      }
    }

    const result = await pool.request()
      .input('templateId', sql.UniqueIdentifier, templateId)
      .query('SELECT * FROM labeling_variables WHERE template_id = @templateId ORDER BY sort_order');

    const returnedVars = result.recordset.map(v => ({
      ...v,
      options: v.options ? (typeof v.options === 'string' ? JSON.parse(v.options) : v.options) : null
    }));

    res.json({
      success: true,
      message: 'Variables updated successfully',
      variables: returnedVars
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update variable
router.put('/variables/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { key, label, default_value, field_type, options, required, sort_order } = req.body;

    const pool = await getPool();
    const updates = [];
    const request = pool.request().input('id', sql.UniqueIdentifier, id);

    if (key !== undefined) {
      updates.push('[key] = @key');
      request.input('key', sql.VarChar, key);
    }
    if (label !== undefined) {
      updates.push('label = @label');
      request.input('label', sql.NVarChar, label);
    }
    if (default_value !== undefined) {
      updates.push('default_value = @default_value');
      request.input('default_value', sql.NVarChar, default_value);
    }
    if (field_type !== undefined) {
      updates.push('field_type = @field_type');
      request.input('field_type', sql.VarChar, field_type);
    }
    if (options !== undefined) {
      updates.push('options = @options');
      request.input('options', sql.NVarChar, options ? JSON.stringify(options) : null);
    }
    if (required !== undefined) {
      updates.push('required = @required');
      request.input('required', sql.Bit, required);
    }
    if (sort_order !== undefined) {
      updates.push('sort_order = @sort_order');
      request.input('sort_order', sql.Int, sort_order);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    const updateResult = await request.query(`
      UPDATE labeling_variables SET ${updates.join(', ')}
      WHERE id = @id
    `);

    if (updateResult.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        error: 'Variable not found'
      });
    }

    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM labeling_variables WHERE id = @id');

    const variable = result.recordset[0];
    if (variable.options) {
      variable.options = typeof variable.options === 'string' ? JSON.parse(variable.options) : variable.options;
    }

    res.json({
      success: true,
      message: 'Variable updated successfully',
      variable: variable
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete variable
router.delete('/variables/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('DELETE FROM labeling_variables WHERE id = @id');

    res.json({
      success: true,
      message: 'Variable deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
