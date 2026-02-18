const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { sql, getPool } = require('../../sqlServerClient');
const { requireDb } = require('../middleware/dbCheck');

router.use(requireDb);

// List scanners assigned to a group
router.get('/groups/:groupId/scanners', async (req, res) => {
  try {
    const { groupId } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input('groupId', sql.UniqueIdentifier, groupId)
      .query(`SELECT gs.id as assignment_id, s.*
              FROM labeling_group_scanners gs
              JOIN labeling_scanners s ON gs.scanner_id = s.id
              WHERE gs.group_id = @groupId
              ORDER BY s.name`);

    res.json({ success: true, scanners: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Assign scanner to group
router.post('/groups/:groupId/scanners', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { scanner_id } = req.body;
    const newId = crypto.randomUUID();
    const pool = await getPool();

    const existing = await pool.request()
      .input('groupId', sql.UniqueIdentifier, groupId)
      .input('scannerId', sql.UniqueIdentifier, scanner_id)
      .query(`SELECT id FROM labeling_group_scanners
              WHERE group_id = @groupId AND scanner_id = @scannerId`);

    if (existing.recordset.length > 0) {
      return res.status(409).json({ success: false, error: 'Scanner already assigned to this group' });
    }

    await pool.request()
      .input('id', sql.UniqueIdentifier, newId)
      .input('groupId', sql.UniqueIdentifier, groupId)
      .input('scannerId', sql.UniqueIdentifier, scanner_id)
      .query(`INSERT INTO labeling_group_scanners (id, group_id, scanner_id)
              VALUES (@id, @groupId, @scannerId)`);

    res.status(201).json({ success: true, message: 'Scanner assigned' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Unassign scanner from group
router.delete('/groups/:groupId/scanners/:scannerId', async (req, res) => {
  try {
    const { groupId, scannerId } = req.params;
    const pool = await getPool();

    await pool.request()
      .input('groupId', sql.UniqueIdentifier, groupId)
      .input('scannerId', sql.UniqueIdentifier, scannerId)
      .query(`DELETE FROM labeling_group_scanners
              WHERE group_id = @groupId AND scanner_id = @scannerId`);

    res.json({ success: true, message: 'Scanner unassigned' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
