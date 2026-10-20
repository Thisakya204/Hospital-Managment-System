const express = require('express');
const router = express.Router();
const { all } = require('../db/database');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// Get Audit Logs (Admin & Accountant only)
router.get('/', verifyToken, authorizeRoles('Administrator', 'Accountant'), async (req, res) => {
  try {
    const logs = await all(`SELECT TOP 100 * FROM audit_logs ORDER BY id DESC`);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
