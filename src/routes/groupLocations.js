const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { sql, getPool } = require('../../sqlServerClient');
const { requireDb } = require('../middleware/dbCheck');

router.use(requireDb);

// List assigned locations for a group (with scanner name, printer)
router.get('/groups/:groupId/locations', async (req, res) => {
  try {
    const { groupId } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input('groupId', sql.UniqueIdentifier, groupId)
      .query(`SELECT gl.id as assignment_id, sl.*, s.name as scanner_name
              FROM labeling_group_locations gl
              JOIN labeling_scan_locations sl ON gl.location_id = sl.id
              JOIN labeling_scanners s ON sl.scanner_id = s.id
              WHERE gl.group_id = @groupId
              ORDER BY s.name, sl.location_number`);

    res.json({ success: true, locations: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Assign location to group
router.post('/groups/:groupId/locations', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { location_id } = req.body;
    const newId = crypto.randomUUID();
    const pool = await getPool();

    // Check if already assigned
    const existing = await pool.request()
      .input('groupId', sql.UniqueIdentifier, groupId)
      .input('locationId', sql.UniqueIdentifier, location_id)
      .query(`SELECT id FROM labeling_group_locations
              WHERE group_id = @groupId AND location_id = @locationId`);

    if (existing.recordset.length > 0) {
      return res.status(409).json({ success: false, error: 'Location already assigned to this group' });
    }

    await pool.request()
      .input('id', sql.UniqueIdentifier, newId)
      .input('groupId', sql.UniqueIdentifier, groupId)
      .input('locationId', sql.UniqueIdentifier, location_id)
      .query(`INSERT INTO labeling_group_locations (id, group_id, location_id)
              VALUES (@id, @groupId, @locationId)`);

    res.status(201).json({ success: true, message: 'Location assigned' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Unassign location from group
router.delete('/groups/:groupId/locations/:locationId', async (req, res) => {
  try {
    const { groupId, locationId } = req.params;
    const pool = await getPool();

    await pool.request()
      .input('groupId', sql.UniqueIdentifier, groupId)
      .input('locationId', sql.UniqueIdentifier, locationId)
      .query(`DELETE FROM labeling_group_locations
              WHERE group_id = @groupId AND location_id = @locationId`);

    res.json({ success: true, message: 'Location unassigned' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List all enabled locations with scanner info (for assignment dialog)
router.get('/locations/available', async (req, res) => {
  try {
    const pool = await getPool();

    const result = await pool.request()
      .query(`SELECT sl.*, s.name as scanner_name
              FROM labeling_scan_locations sl
              JOIN labeling_scanners s ON sl.scanner_id = s.id
              WHERE sl.enabled = 1 AND s.enabled = 1
              ORDER BY s.name, sl.location_number`);

    res.json({ success: true, locations: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
