const express = require('express');
const router = express.Router();
const { all, get, run } = require('../db/database');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { logAudit } = require('../utils/auditLogger');

// List Doctors
router.get('/', verifyToken, async (req, res) => {
  try {
    const doctors = await all(`SELECT d.*, u.email, u.phone FROM doctors d LEFT JOIN users u ON d.user_id = u.id ORDER BY d.id ASC`);
    res.json(doctors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Doctor Profile
router.post('/', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    const { user_id, full_name, specialization, qualification, department, consultation_fee, room_no, availability } = req.body;
    if (!full_name || !specialization || !department || !consultation_fee) {
      return res.status(400).json({ error: 'Required: full_name, specialization, department, consultation_fee' });
    }

    const result = await run(
      `INSERT INTO doctors (user_id, full_name, specialization, qualification, department, consultation_fee, room_no, availability)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id || null, full_name, specialization, qualification || '', department, consultation_fee, room_no || 'TBD', availability || 'Mon-Fri 09:00 - 17:00']
    );

    await logAudit(req.user, 'ADD_DOCTOR', 'Doctor Management', `Added doctor ${full_name} (${specialization})`);
    res.status(201).json({ message: 'Doctor added successfully', doctorId: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Doctor Details
router.put('/:id', verifyToken, authorizeRoles('Administrator', 'Doctor'), async (req, res) => {
  try {
    const { full_name, specialization, qualification, department, consultation_fee, room_no, availability } = req.body;
    await run(
      `UPDATE doctors SET full_name = ?, specialization = ?, qualification = ?, department = ?, consultation_fee = ?, room_no = ?, availability = ? WHERE id = ?`,
      [full_name, specialization, qualification, department, consultation_fee, room_no, availability, req.params.id]
    );

    await logAudit(req.user, 'UPDATE_DOCTOR', 'Doctor Management', `Updated doctor ID ${req.params.id}`);
    res.json({ message: 'Doctor updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Doctor Weekly Schedule
router.get('/:id/schedule', verifyToken, async (req, res) => {
  try {
    const doctorId = req.params.id;
    await run(`
      CREATE TABLE IF NOT EXISTS doctor_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doctor_id INTEGER NOT NULL,
        day_of_week TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        is_available INTEGER DEFAULT 1
      );
    `);
    const schedule = await all(`SELECT * FROM doctor_schedules WHERE doctor_id = ? ORDER BY CASE day_of_week WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 WHEN 'Sunday' THEN 7 END`, [doctorId]);
    res.json(schedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save Doctor Weekly Schedule (upsert all days)
router.post('/:id/schedule', verifyToken, authorizeRoles('Administrator', 'Doctor'), async (req, res) => {
  try {
    const doctorId = req.params.id;
    const { slots } = req.body; // Array of { day_of_week, start_time, end_time, is_available }

    if (!Array.isArray(slots)) {
      return res.status(400).json({ error: 'slots array required' });
    }

    // Delete existing schedule for this doctor
    await run(`DELETE FROM doctor_schedules WHERE doctor_id = ?`, [doctorId]);

    // Insert new slots
    for (const slot of slots) {
      await run(
        `INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, is_available) VALUES (?, ?, ?, ?, ?)`,
        [doctorId, slot.day_of_week, slot.start_time || '09:00', slot.end_time || '17:00', slot.is_available ? 1 : 0]
      );
    }

    await logAudit(req.user, 'UPDATE_DOCTOR_SCHEDULE', 'Doctor Management', `Updated schedule for doctor ID ${doctorId}`);
    res.json({ message: 'Schedule saved successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
