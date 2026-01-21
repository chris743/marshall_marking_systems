const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { sql, getPool } = require('../../sqlServerClient');
const { requireDb } = require('../middleware/dbCheck');

router.use(requireDb);

// List all folders
router.get('/folders', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`
        SELECT DISTINCT folder
        FROM labeling_templates
        WHERE folder IS NOT NULL AND folder != ''
        ORDER BY folder ASC
      `);

    const folders = result.recordset.map(r => r.folder);

    res.json({
      success: true,
      folders: folders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// List all templates
router.get('/', async (req, res) => {
  try {
    const { folder } = req.query;
    const pool = await getPool();

    let query = 'SELECT * FROM labeling_templates';
    const request = pool.request();

    if (folder !== undefined) {
      if (folder === '' || folder === 'null') {
        // Root folder (no folder assigned)
        query += ' WHERE (folder IS NULL OR folder = \'\')';
      } else {
        query += ' WHERE folder = @folder';
        request.input('folder', sql.NVarChar, folder);
      }
    }

    query += ' ORDER BY is_default DESC, name ASC';

    const result = await request.query(query);

    const templates = result.recordset.map(t => ({
      ...t,
      elements: typeof t.elements === 'string' ? JSON.parse(t.elements) : t.elements
    }));

    res.json({
      success: true,
      templates: templates
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single template
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM labeling_templates WHERE id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    const template = result.recordset[0];
    template.elements = typeof template.elements === 'string' ? JSON.parse(template.elements) : template.elements;

    res.json({
      success: true,
      template: template
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create template
router.post('/', async (req, res) => {
  try {
    const { name, description, folder, elements, label_width, label_height, is_default } = req.body;

    if (!name || !elements) {
      return res.status(400).json({
        success: false,
        error: 'Name and elements are required'
      });
    }

    const pool = await getPool();

    if (is_default) {
      await pool.request().query('UPDATE labeling_templates SET is_default = 0 WHERE is_default = 1');
    }

    const newId = crypto.randomUUID();

    await pool.request()
      .input('id', sql.UniqueIdentifier, newId)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || '')
      .input('folder', sql.NVarChar, folder || null)
      .input('elements', sql.NVarChar(sql.MAX), JSON.stringify(elements))
      .input('label_width', sql.Int, label_width || 812)
      .input('label_height', sql.Int, label_height || 406)
      .input('is_default', sql.Bit, is_default || false)
      .query(`
        INSERT INTO labeling_templates (id, name, description, folder, elements, label_width, label_height, is_default)
        VALUES (@id, @name, @description, @folder, @elements, @label_width, @label_height, @is_default)
      `);

    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, newId)
      .query('SELECT * FROM labeling_templates WHERE id = @id');

    const template = result.recordset[0];
    template.elements = typeof template.elements === 'string' ? JSON.parse(template.elements) : template.elements;

    res.json({
      success: true,
      message: 'Template created successfully',
      template: template
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update template
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, folder, elements, label_width, label_height, is_default } = req.body;

    const pool = await getPool();

    if (is_default) {
      await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query('UPDATE labeling_templates SET is_default = 0 WHERE id != @id');
    }

    const updates = [];
    const request = pool.request().input('id', sql.UniqueIdentifier, id);

    if (name !== undefined) {
      updates.push('name = @name');
      request.input('name', sql.NVarChar, name);
    }
    if (description !== undefined) {
      updates.push('description = @description');
      request.input('description', sql.NVarChar, description);
    }
    if (folder !== undefined) {
      updates.push('folder = @folder');
      request.input('folder', sql.NVarChar, folder || null);
    }
    if (elements !== undefined) {
      updates.push('elements = @elements');
      request.input('elements', sql.NVarChar(sql.MAX), JSON.stringify(elements));
    }
    if (label_width !== undefined) {
      updates.push('label_width = @label_width');
      request.input('label_width', sql.Int, label_width);
    }
    if (label_height !== undefined) {
      updates.push('label_height = @label_height');
      request.input('label_height', sql.Int, label_height);
    }
    if (is_default !== undefined) {
      updates.push('is_default = @is_default');
      request.input('is_default', sql.Bit, is_default);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    const updateResult = await request.query(`
      UPDATE labeling_templates SET ${updates.join(', ')}
      WHERE id = @id
    `);

    if (updateResult.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM labeling_templates WHERE id = @id');

    const template = result.recordset[0];
    template.elements = typeof template.elements === 'string' ? JSON.parse(template.elements) : template.elements;

    res.json({
      success: true,
      message: 'Template updated successfully',
      template: template
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete template
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('DELETE FROM labeling_templates WHERE id = @id');

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
