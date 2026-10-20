const express = require('express');
const router = express.Router();
const { all, get, run } = require('../db/database');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { logAudit } = require('../utils/auditLogger');

// List Invoices
router.get('/invoices', verifyToken, async (req, res) => {
  try {
    const { status, patient_id } = req.query;
    let sql = `
      SELECT i.*, p.full_name as patient_name, p.mrn, p.phone as patient_phone
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ` AND i.status = ?`;
      params.push(status);
    }
    if (patient_id) {
      sql += ` AND i.patient_id = ?`;
      params.push(patient_id);
    }

    sql += ` ORDER BY i.id DESC`;
    const invoices = await all(sql, params);
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Single Invoice with Detailed Items (Receipt generation view)
router.get('/invoices/:id', verifyToken, async (req, res) => {
  try {
    const invoice = await get(
      `SELECT i.*, p.full_name as patient_name, p.mrn, p.phone, p.email, p.address
       FROM invoices i
       JOIN patients p ON i.patient_id = p.id
       WHERE i.id = ?`,
      [req.params.id]
    );

    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const items = await all(`SELECT * FROM invoice_items WHERE invoice_id = ?`, [req.params.id]);

    res.json({
      invoice,
      items
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Custom Invoice
router.post('/invoices', verifyToken, authorizeRoles('Administrator', 'Accountant', 'Receptionist'), async (req, res) => {
  try {
    const { patient_id, items, tax, discount } = req.body;
    if (!patient_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'patient_id and items array are required.' });
    }

    let rawTotal = 0;
    for (const item of items) {
      rawTotal += (item.unit_price * item.quantity);
    }

    const taxVal = tax || 0;
    const discVal = discount || 0;
    const netAmount = Math.max(0, rawTotal + taxVal - discVal);

    const invNum = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const result = await run(
      `INSERT INTO invoices (invoice_number, patient_id, total_amount, tax, discount, net_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Unpaid')`,
      [invNum, patient_id, rawTotal, taxVal, discVal, netAmount]
    );

    const invoiceId = result.lastID;
    for (const item of items) {
      await run(
        `INSERT INTO invoice_items (invoice_id, description, category, unit_price, quantity, amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, item.description, item.category || 'General', item.unit_price, item.quantity, item.unit_price * item.quantity]
      );
    }

    await logAudit(req.user, 'CREATE_INVOICE', 'Billing', `Generated Invoice ${invNum} ($${netAmount}) for Patient ID ${patient_id}`);

    res.status(201).json({ message: 'Invoice generated successfully', invoiceId, invoice_number: invNum });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Record Payment for Invoice
router.put('/invoices/:id/pay', verifyToken, authorizeRoles('Administrator', 'Accountant', 'Receptionist'), async (req, res) => {
  try {
    const { payment_method, notes, transaction_ref } = req.body;
    if (!payment_method) {
      return res.status(400).json({ error: 'payment_method is required (e.g. Cash, Credit Card, Insurance)' });
    }

    const invoice = await get(`SELECT * FROM invoices WHERE id = ?`, [req.params.id]);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const now = new Date().toISOString();
    await run(
      `UPDATE invoices SET status = 'Paid', payment_method = ?, paid_date = ? WHERE id = ?`,
      [payment_method, now, req.params.id]
    );

    const paymentNum = `PAY-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const cashierName = req.user ? (req.user.full_name || req.user.username) : 'Cashier';

    await run(`
      INSERT INTO payments (payment_number, invoice_id, patient_id, amount, payment_method, transaction_ref, received_by, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [paymentNum, invoice.id, invoice.patient_id, invoice.net_amount, payment_method, transaction_ref || `REF-${Date.now()}`, cashierName, notes || `Settled for invoice ${invoice.invoice_number}`]);

    await logAudit(req.user, 'RECORD_PAYMENT', 'Billing', `Received payment ${paymentNum} ($${invoice.net_amount}) via ${payment_method} for Invoice ${invoice.invoice_number}`);

    res.json({ message: 'Payment recorded and invoice status updated to Paid', paymentNumber: paymentNum });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List Payment Transactions Ledger
router.get('/payments', verifyToken, async (req, res) => {
  try {
    const payments = await all(`
      SELECT 
        pay.*,
        p.full_name as patient_name,
        p.mrn,
        p.phone as patient_phone,
        inv.invoice_number
      FROM payments pay
      JOIN patients p ON pay.patient_id = p.id
      JOIN invoices inv ON pay.invoice_id = inv.id
      ORDER BY pay.id DESC
    `);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
