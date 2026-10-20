const express = require('express');
const router = express.Router();
const { all, get, run } = require('../db/database');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { logAudit } = require('../utils/auditLogger');

// List Appointments
router.get('/', verifyToken, async (req, res) => {
  try {
    const { doctor_id, patient_id, status, date } = req.query;
    let sql = `
      SELECT a.*, p.full_name as patient_name, p.mrn, p.phone as patient_phone, d.full_name as doctor_name, d.specialization, d.room_no
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN doctors d ON a.doctor_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (doctor_id) {
      sql += ` AND a.doctor_id = ?`;
      params.push(doctor_id);
    }
    if (patient_id) {
      sql += ` AND a.patient_id = ?`;
      params.push(patient_id);
    }
    if (status) {
      sql += ` AND a.status = ?`;
      params.push(status);
    }
    if (date) {
      sql += ` AND a.appointment_date = ?`;
      params.push(date);
    }

    sql += ` ORDER BY a.appointment_date DESC, a.time_slot ASC`;
    const list = await all(sql, params);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Book New Appointment
router.post('/', verifyToken, authorizeRoles('Administrator', 'Receptionist', 'Doctor', 'Nurse'), async (req, res) => {
  try {
    const { patient_id, doctor_id, appointment_date, time_slot, reason } = req.body;
    if (!patient_id || !doctor_id || !appointment_date || !time_slot) {
      return res.status(400).json({ error: 'Required: patient_id, doctor_id, appointment_date, time_slot' });
    }

    // Check doctor availability slot clash
    const conflict = await get(
      `SELECT id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND time_slot = ? AND status != 'Cancelled'`,
      [doctor_id, appointment_date, time_slot]
    );
    if (conflict) {
      return res.status(400).json({ error: 'Doctor already has a scheduled appointment for this time slot.' });
    }

    const result = await run(
      `INSERT INTO appointments (patient_id, doctor_id, appointment_date, time_slot, reason, status)
       VALUES (?, ?, ?, ?, ?, 'Scheduled')`,
      [patient_id, doctor_id, appointment_date, time_slot, reason || 'General Consultation']
    );

    // Auto-generate invoice draft for consultation fee
    const doctor = await get(`SELECT full_name, consultation_fee FROM doctors WHERE id = ?`, [doctor_id]);
    if (doctor) {
      const invNum = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const invResult = await run(
        `INSERT INTO invoices (invoice_number, patient_id, total_amount, tax, discount, net_amount, status)
         VALUES (?, ?, ?, 0, 0, ?, 'Unpaid')`,
        [invNum, patient_id, doctor.consultation_fee, doctor.consultation_fee]
      );
      await run(
        `INSERT INTO invoice_items (invoice_id, description, category, unit_price, quantity, amount)
         VALUES (?, ?, 'Consultation', ?, 1, ?)`,
        [invResult.lastID, `Consultation with ${doctor.full_name}`, doctor.consultation_fee, doctor.consultation_fee]
      );
    }

    const patient = await get(`SELECT full_name FROM patients WHERE id = ?`, [patient_id]);
    await logAudit(req.user, 'BOOK_APPOINTMENT', 'Appointments', `Booked appointment for ${patient ? patient.full_name : patient_id} on ${appointment_date} ${time_slot}`);

    res.status(201).json({ message: 'Appointment booked successfully', appointmentId: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reschedule Appointment (SSD 3.4 Reschedule Appointment)
router.put('/:id/reschedule', verifyToken, async (req, res) => {
  try {
    const { appointment_date, time_slot } = req.body;
    if (!appointment_date || !time_slot) {
      return res.status(400).json({ error: 'appointment_date and time_slot are required' });
    }

    const appt = await get(`SELECT doctor_id FROM appointments WHERE id = ?`, [req.params.id]);
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    // Check clash
    const conflict = await get(
      `SELECT id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND time_slot = ? AND id != ? AND status != 'Cancelled'`,
      [appt.doctor_id, appointment_date, time_slot, req.params.id]
    );
    if (conflict) {
      return res.status(400).json({ error: 'Doctor has another appointment scheduled at that date and time.' });
    }

    await run(
      `UPDATE appointments SET appointment_date = ?, time_slot = ?, status = 'Scheduled' WHERE id = ?`,
      [appointment_date, time_slot, req.params.id]
    );

    await logAudit(req.user, 'RESCHEDULE_APPOINTMENT', 'Appointments', `Rescheduled appointment ID ${req.params.id} to ${appointment_date} ${time_slot}`);
    res.json({ message: 'Appointment rescheduled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Appointment Status (Scheduled, Waiting, Confirmed, Completed, Cancelled)
router.put('/:id/status', verifyToken, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Scheduled', 'Waiting', 'Confirmed', 'In-Consultation', 'Completed', 'Cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await run(`UPDATE appointments SET status = ? WHERE id = ?`, [status, req.params.id]);
    await logAudit(req.user, 'UPDATE_APPOINTMENT_STATUS', 'Appointments', `Updated appointment ID ${req.params.id} to '${status}'`);
    res.json({ message: `Appointment status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
