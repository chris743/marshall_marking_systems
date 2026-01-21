const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../../sqlServerClient');
const { requireDb } = require('../middleware/dbCheck');
const { PRODUCTS_TABLE } = require('../config/constants');

router.use(requireDb);

// Get all printer configs
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`
        SELECT
          pc.*,
          t.id as template_id, t.name as template_name, t.description as template_description,
          t.elements as template_elements, t.label_width as template_label_width,
          t.label_height as template_label_height, t.is_default as template_is_default,
          p.id as product_id, p.description as product_description, p.gtin as product_gtin,
          p.company_name as product_company_name, p.company_prefix as product_company_prefix,
          p.item_reference as product_item_reference, p.indicator_digit as product_indicator_digit,
          p.commodity as product_commodity, p.style as product_style
        FROM labeling_printer_configs pc
        LEFT JOIN labeling_templates t ON pc.template_id = t.id
        LEFT JOIN ${PRODUCTS_TABLE} p ON pc.product_id = p.id
      `);

    const configs = result.recordset.map(row => ({
      id: row.id,
      printer_id: row.printer_id,
      template_id: row.template_id,
      product_id: row.product_id,
      lot_number: row.lot_number,
      pack_date: row.pack_date,
      variable_values: row.variable_values ? (typeof row.variable_values === 'string' ? JSON.parse(row.variable_values) : row.variable_values) : {},
      created_at: row.created_at,
      updated_at: row.updated_at,
      template: row.template_id ? {
        id: row.template_id,
        name: row.template_name,
        description: row.template_description,
        elements: row.template_elements ? (typeof row.template_elements === 'string' ? JSON.parse(row.template_elements) : row.template_elements) : [],
        label_width: row.template_label_width,
        label_height: row.template_label_height,
        is_default: row.template_is_default
      } : null,
      product: row.product_id ? {
        id: row.product_id,
        description: row.product_description,
        gtin: row.product_gtin,
        company_name: row.product_company_name,
        company_prefix: row.product_company_prefix,
        item_reference: row.product_item_reference,
        indicator_digit: row.product_indicator_digit,
        commodity: row.product_commodity,
        style: row.product_style
      } : null
    }));

    res.json({
      success: true,
      configs: configs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get printer config
router.get('/:printerId', async (req, res) => {
  try {
    const { printerId } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input('printerId', sql.VarChar, printerId)
      .query(`
        SELECT
          pc.*,
          t.id as template_id, t.name as template_name, t.description as template_description,
          t.elements as template_elements, t.label_width as template_label_width,
          t.label_height as template_label_height, t.is_default as template_is_default,
          p.id as product_id, p.description as product_description, p.gtin as product_gtin,
          p.company_name as product_company_name, p.company_prefix as product_company_prefix,
          p.item_reference as product_item_reference, p.indicator_digit as product_indicator_digit,
          p.external_upc as product_external_upc, p.external_plu as product_external_plu,
          p.commodity as product_commodity, p.style as product_style
        FROM labeling_printer_configs pc
        LEFT JOIN labeling_templates t ON pc.template_id = t.id
        LEFT JOIN ${PRODUCTS_TABLE} p ON pc.product_id = p.id
        WHERE pc.printer_id = @printerId
      `);

    if (result.recordset.length === 0) {
      return res.json({
        success: true,
        config: null
      });
    }

    const row = result.recordset[0];

    const config = {
      id: row.id,
      printer_id: row.printer_id,
      template_id: row.template_id,
      product_id: row.product_id,
      lot_number: row.lot_number,
      pack_date: row.pack_date,
      variable_values: row.variable_values ? (typeof row.variable_values === 'string' ? JSON.parse(row.variable_values) : row.variable_values) : {},
      created_at: row.created_at,
      updated_at: row.updated_at,
      template: row.template_id ? {
        id: row.template_id,
        name: row.template_name,
        description: row.template_description,
        elements: row.template_elements ? (typeof row.template_elements === 'string' ? JSON.parse(row.template_elements) : row.template_elements) : [],
        label_width: row.template_label_width,
        label_height: row.template_label_height,
        is_default: row.template_is_default
      } : null,
      product: row.product_id ? {
        id: row.product_id,
        description: row.product_description,
        gtin: row.product_gtin,
        company_name: row.product_company_name,
        company_prefix: row.product_company_prefix,
        item_reference: row.product_item_reference,
        indicator_digit: row.product_indicator_digit,
        external_upc: row.product_external_upc,
        external_plu: row.product_external_plu,
        commodity: row.product_commodity,
        style: row.product_style
      } : null
    };

    res.json({
      success: true,
      config: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Save/update printer config (upsert)
router.put('/:printerId', async (req, res) => {
  try {
    const { printerId } = req.params;
    const { template_id, product_id, lot_number, pack_date, pack_date_format, pack_date_offset, variable_values } = req.body;

    const pool = await getPool();

    const existsResult = await pool.request()
      .input('printerId', sql.VarChar, printerId)
      .query('SELECT id FROM labeling_printer_configs WHERE printer_id = @printerId');

    if (existsResult.recordset.length > 0) {
      await pool.request()
        .input('printerId', sql.VarChar, printerId)
        .input('template_id', sql.UniqueIdentifier, template_id || null)
        .input('product_id', sql.UniqueIdentifier, product_id || null)
        .input('lot_number', sql.VarChar, lot_number || '')
        .input('pack_date', sql.VarChar, pack_date || '')
        .input('pack_date_format', sql.VarChar, pack_date_format || 'YYMMDD')
        .input('pack_date_offset', sql.Int, pack_date_offset || 0)
        .input('variable_values', sql.NVarChar, JSON.stringify(variable_values || {}))
        .query(`
          UPDATE labeling_printer_configs
          SET template_id = @template_id, product_id = @product_id,
              lot_number = @lot_number, pack_date = @pack_date,
              pack_date_format = @pack_date_format, pack_date_offset = @pack_date_offset,
              variable_values = @variable_values
          WHERE printer_id = @printerId
        `);
    } else {
      await pool.request()
        .input('printerId', sql.VarChar, printerId)
        .input('template_id', sql.UniqueIdentifier, template_id || null)
        .input('product_id', sql.UniqueIdentifier, product_id || null)
        .input('lot_number', sql.VarChar, lot_number || '')
        .input('pack_date', sql.VarChar, pack_date || '')
        .input('pack_date_format', sql.VarChar, pack_date_format || 'YYMMDD')
        .input('pack_date_offset', sql.Int, pack_date_offset || 0)
        .input('variable_values', sql.NVarChar, JSON.stringify(variable_values || {}))
        .query(`
          INSERT INTO labeling_printer_configs (printer_id, template_id, product_id, lot_number, pack_date, pack_date_format, pack_date_offset, variable_values)
          VALUES (@printerId, @template_id, @product_id, @lot_number, @pack_date, @pack_date_format, @pack_date_offset, @variable_values)
        `);
    }

    const result = await pool.request()
      .input('printerId', sql.VarChar, printerId)
      .query(`
        SELECT
          pc.*,
          t.id as template_id, t.name as template_name, t.description as template_description,
          t.elements as template_elements, t.label_width as template_label_width,
          t.label_height as template_label_height, t.is_default as template_is_default,
          p.id as product_id, p.description as product_description, p.gtin as product_gtin,
          p.company_name as product_company_name, p.company_prefix as product_company_prefix,
          p.item_reference as product_item_reference, p.indicator_digit as product_indicator_digit,
          p.commodity as product_commodity, p.style as product_style
        FROM labeling_printer_configs pc
        LEFT JOIN labeling_templates t ON pc.template_id = t.id
        LEFT JOIN ${PRODUCTS_TABLE} p ON pc.product_id = p.id
        WHERE pc.printer_id = @printerId
      `);

    const row = result.recordset[0];
    const config = {
      id: row.id,
      printer_id: row.printer_id,
      template_id: row.template_id,
      product_id: row.product_id,
      lot_number: row.lot_number,
      pack_date: row.pack_date,
      variable_values: row.variable_values ? (typeof row.variable_values === 'string' ? JSON.parse(row.variable_values) : row.variable_values) : {},
      template: row.template_id ? {
        id: row.template_id,
        name: row.template_name,
        description: row.template_description,
        elements: row.template_elements ? (typeof row.template_elements === 'string' ? JSON.parse(row.template_elements) : row.template_elements) : [],
        label_width: row.template_label_width,
        label_height: row.template_label_height,
        is_default: row.template_is_default
      } : null,
      product: row.product_id ? {
        id: row.product_id,
        description: row.product_description,
        gtin: row.product_gtin,
        company_name: row.product_company_name,
        company_prefix: row.product_company_prefix,
        item_reference: row.product_item_reference,
        indicator_digit: row.product_indicator_digit,
        commodity: row.product_commodity,
        style: row.product_style
      } : null
    };

    res.json({
      success: true,
      message: 'Printer config saved successfully',
      config: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Clear printer config
router.delete('/:printerId', async (req, res) => {
  try {
    const { printerId } = req.params;
    const pool = await getPool();

    await pool.request()
      .input('printerId', sql.VarChar, printerId)
      .query('DELETE FROM labeling_printer_configs WHERE printer_id = @printerId');

    res.json({
      success: true,
      message: 'Printer config cleared successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
