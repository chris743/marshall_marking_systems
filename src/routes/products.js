const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../../sqlServerClient');
const { requireDb } = require('../middleware/dbCheck');
const { PRODUCTS_TABLE } = require('../config/constants');

// Apply DB check to all routes
router.use(requireDb);

// Get products table config (allows runtime override)
router.get('/config', (req, res) => {
  res.json({
    success: true,
    table: PRODUCTS_TABLE
  });
});

// List products with pagination and search
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', inactive = 'false' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const pool = await getPool();

    let whereClause = '';
    const conditions = [];

    if (inactive === 'false') {
      conditions.push('inactive = 0');
    }

    if (search) {
      conditions.push(`(description LIKE @search OR gtin LIKE @search)`);
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    const countResult = await pool.request()
      .input('search', sql.NVarChar, `%${search}%`)
      .query(`SELECT COUNT(*) as total FROM ${PRODUCTS_TABLE} ${whereClause}`);
    const total = countResult.recordset[0].total;

    const result = await pool.request()
      .input('search', sql.NVarChar, `%${search}%`)
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, parseInt(limit))
      .query(`
        SELECT * FROM ${PRODUCTS_TABLE}
        ${whereClause}
        ORDER BY description
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    res.json({
      success: true,
      products: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Search products (autocomplete)
router.get('/search', async (req, res) => {
  try {
    const { q = '', limit = 20 } = req.query;

    if (!q || q.length < 2) {
      return res.json({
        success: true,
        products: []
      });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('search', sql.NVarChar, `%${q}%`)
      .input('limit', sql.Int, parseInt(limit))
      .query(`
        SELECT TOP (@limit) * FROM ${PRODUCTS_TABLE}
        WHERE inactive = 0 AND (description LIKE @search OR gtin LIKE @search)
        ORDER BY description
      `);

    res.json({
      success: true,
      products: result.recordset
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query(`SELECT * FROM ${PRODUCTS_TABLE} WHERE id = @id`);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    res.json({
      success: true,
      product: result.recordset[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
