const express = require('express');
const router = express.Router();
const { all, get, run } = require('../db/database');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { logAudit } = require('../utils/auditLogger');

// List Lab Tests
router.get('/', verifyToken, async (req, res) => {
  try {
    const { status, patient_id } = req.query;
    let sql = `
      SELECT lt.*, p.full_name as patient_name, p.mrn, d.full_name as doctor_name
      FROM lab_tests lt
      JOIN patients p ON lt.patient_id = p.id
      JOIN doctors d ON lt.doctor_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ` AND lt.status = ?`;
      params.push(status);
    }
    if (patient_id) {
      sql += ` AND lt.patient_id = ?`;
      params.push(patient_id);
    }

    sql += ` ORDER BY lt.requested_date DESC`;
    const tests = await all(sql, params);
    res.json(tests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Lab Test Request
router.post('/', verifyToken, authorizeRoles('Administrator', 'Doctor', 'Laboratory Staff'), async (req, res) => {
  try {
    const { patient_id, doctor_id, test_name, category, notes } = req.body;
    if (!patient_id || !doctor_id || !test_name) {
      return res.status(400).json({ error: 'Required: patient_id, doctor_id, test_name' });
    }

    const result = await run(
      `INSERT INTO lab_tests (patient_id, doctor_id, test_name, category, notes, status)
       VALUES (?, ?, ?, ?, ?, 'Requested')`,
      [patient_id, doctor_id, test_name, category || 'General', notes || '']
    );

    // Auto add lab item to invoice draft or new invoice
    const testCost = 75.00; // Standard lab fee baseline
    const invNum = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const invResult = await run(
      `INSERT INTO invoices (invoice_number, patient_id, total_amount, tax, discount, net_amount, status)
       VALUES (?, ?, ?, 0, 0, ?, 'Unpaid')`,
      [invNum, patient_id, testCost, testCost]
    );
    await run(
      `INSERT INTO invoice_items (invoice_id, description, category, unit_price, quantity, amount)
       VALUES (?, ?, 'Lab', ?, 1, ?)`,
      [invResult.lastID, `Lab Test: ${test_name}`, testCost, testCost]
    );

    await logAudit(req.user, 'REQUEST_LAB_TEST', 'Laboratory', `Requested ${test_name} for patient ID ${patient_id}`);
    res.status(201).json({ message: 'Lab test requested successfully', testId: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Lab Test Result / Status
router.put('/:id', verifyToken, authorizeRoles('Administrator', 'Laboratory Staff', 'Doctor'), async (req, res) => {
  try {
    const { status, result_summary, normal_range, notes } = req.body;
    const completed_date = status === 'Completed' ? new Date().toISOString() : null;

    await run(
      `UPDATE lab_tests SET 
       status = ?, result_summary = COALESCE(?, result_summary), normal_range = COALESCE(?, normal_range), 
       notes = COALESCE(?, notes), completed_date = COALESCE(?, completed_date)
       WHERE id = ?`,
      [status, result_summary || null, normal_range || null, notes || null, completed_date, req.params.id]
    );

    await logAudit(req.user, 'UPDATE_LAB_TEST', 'Laboratory', `Updated lab test ID ${req.params.id} to status ${status}`);
    res.json({ message: 'Lab test updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
