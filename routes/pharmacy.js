const express = require('express');
const router = express.Router();
const { all, get, run } = require('../db/database');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { logAudit } = require('../utils/auditLogger');

// Get Pharmacy Inventory
router.get('/inventory', verifyToken, async (req, res) => {
  try {
    const search = req.query.search ? `%${req.query.search}%` : '%';
    const items = await all(
      `SELECT *, 
       (CASE WHEN stock_quantity <= reorder_level THEN 1 ELSE 0 END) as is_low_stock,
       (CASE WHEN expiry_date <= DATEADD(day, 30, CAST(GETDATE() AS DATE)) THEN 1 ELSE 0 END) as is_near_expiry
       FROM pharmacy_inventory 
       WHERE medicine_name LIKE ? OR category LIKE ? 
       ORDER BY medicine_name ASC`,
      [search, search]
    );
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add New Medicine to Inventory
router.post('/inventory', verifyToken, authorizeRoles('Administrator', 'Pharmacist'), async (req, res) => {
  try {
    const { medicine_name, category, unit_price, stock_quantity, expiry_date, batch_number, reorder_level } = req.body;
    if (!medicine_name || !unit_price || !stock_quantity || !expiry_date || !batch_number) {
      return res.status(400).json({ error: 'Required fields missing: medicine_name, unit_price, stock_quantity, expiry_date, batch_number' });
    }

    const result = await run(
      `INSERT INTO pharmacy_inventory (medicine_name, category, unit_price, stock_quantity, expiry_date, batch_number, reorder_level)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [medicine_name, category || 'General', unit_price, stock_quantity, expiry_date, batch_number, reorder_level || 20]
    );

    await logAudit(req.user, 'ADD_MEDICINE_INVENTORY', 'Pharmacy', `Added ${medicine_name} (${stock_quantity} units) to inventory.`);
    res.status(201).json({ message: 'Medicine added to inventory', itemId: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Inventory Stock / Price
router.put('/inventory/:id', verifyToken, authorizeRoles('Administrator', 'Pharmacist'), async (req, res) => {
  try {
    const { unit_price, stock_quantity, expiry_date, reorder_level } = req.body;
    await run(
      `UPDATE pharmacy_inventory SET unit_price = ?, stock_quantity = ?, expiry_date = ?, reorder_level = ? WHERE id = ?`,
      [unit_price, stock_quantity, expiry_date, reorder_level || 20, req.params.id]
    );

    await logAudit(req.user, 'UPDATE_INVENTORY', 'Pharmacy', `Updated inventory stock for ID ${req.params.id}`);
    res.json({ message: 'Inventory updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List Prescriptions (Pending / Dispensed)
router.get('/prescriptions', verifyToken, async (req, res) => {
  try {
    const prescriptions = await all(`
      SELECT pr.*, mr.patient_id, p.full_name as patient_name, p.mrn, d.full_name as doctor_name
      FROM prescriptions pr
      JOIN medical_records mr ON pr.medical_record_id = mr.id
      JOIN patients p ON mr.patient_id = p.id
      JOIN doctors d ON mr.doctor_id = d.id
      ORDER BY pr.id DESC
    `);
    res.json(prescriptions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dispense Prescription Medicine (Deducts Inventory Stock)
router.post('/dispense', verifyToken, authorizeRoles('Administrator', 'Pharmacist'), async (req, res) => {
  try {
    const { prescription_id, medicine_id, quantity } = req.body;
    if (!prescription_id) {
      return res.status(400).json({ error: 'prescription_id is required' });
    }

    const prescription = await get(`SELECT * FROM prescriptions WHERE id = ?`, [prescription_id]);
    if (!prescription) return res.status(404).json({ error: 'Prescription not found' });

    // Deduct stock if matching medicine found
    if (medicine_id) {
      const med = await get(`SELECT * FROM pharmacy_inventory WHERE id = ?`, [medicine_id]);
      if (med) {
        const qty = quantity || 1;
        if (med.stock_quantity < qty) {
          return res.status(400).json({ error: `Insufficient stock for ${med.medicine_name}. Available: ${med.stock_quantity}` });
        }
        await run(`UPDATE pharmacy_inventory SET stock_quantity = stock_quantity - ? WHERE id = ?`, [qty, medicine_id]);

        // Auto-add to patient invoice draft
        const mr = await get(`SELECT patient_id FROM medical_records WHERE id = ?`, [prescription.medical_record_id]);
        if (mr) {
          const invNum = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
          const totalCost = med.unit_price * qty;
          const invResult = await run(
            `INSERT INTO invoices (invoice_number, patient_id, total_amount, tax, discount, net_amount, status)
             VALUES (?, ?, ?, 0, 0, ?, 'Unpaid')`,
            [invNum, mr.patient_id, totalCost, totalCost]
          );
          await run(
            `INSERT INTO invoice_items (invoice_id, description, category, unit_price, quantity, amount)
             VALUES (?, ?, 'Pharmacy', ?, ?, ?)`,
            [invResult.lastID, `Pharmacy: ${med.medicine_name} (${prescription.dosage})`, med.unit_price, qty, totalCost]
          );
        }
      }
    }

    await run(`UPDATE prescriptions SET status = 'Dispensed' WHERE id = ?`, [prescription_id]);
    await logAudit(req.user, 'DISPENSE_MEDICINE', 'Pharmacy', `Dispensed prescription ID ${prescription_id} (${prescription.medicine_name})`);

    res.json({ message: 'Prescription dispensed successfully and stock updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
