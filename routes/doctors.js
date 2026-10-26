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

// Doctor validation helper
function validateDoctorInput(body) {
  let { full_name, specialization, department, consultation_fee } = body;
  if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
    return 'Doctor full name is required';
  }
  const cleanName = full_name.trim();
  if (cleanName.length < 3) {
    return 'Doctor name must be at least 3 characters long';
  }
  if (/\d/.test(cleanName)) {
    return 'Doctor name must contain letters only, numbers are not allowed (e.g. Dr. Kasun Fernando)';
  }
  if (!/^[a-zA-Z\s\.\-']+$/.test(cleanName)) {
    return 'Doctor name contains invalid characters. Use letters, dots, hyphens, and spaces only';
  }
  if (!specialization || typeof specialization !== 'string' || !specialization.trim()) {
    return 'Specialization is required';
  }
  const cleanSpec = specialization.trim();
  if (cleanSpec.length < 3 || /^(.)\1+$/i.test(cleanSpec)) {
    return 'Please select or enter a valid medical specialization (e.g. Cardiology)';
  }
  if (!department || typeof department !== 'string' || !department.trim()) {
    return 'Department is required';
  }
  const fee = parseFloat(consultation_fee);
  if (isNaN(fee) || fee <= 0) {
    return 'Consultation fee must be a positive amount greater than 0';
  }
  return null;
}

// Format doctor name and room
function formatDoctorData(body) {
  let name = (body.full_name || '').trim();
  if (!/^dr[\.\s]/i.test(name)) {
    name = `Dr. ${name}`;
  }
  let room = (body.room_no || '').trim();
  if (/^\d+$/.test(room)) {
    room = `Room ${room}`;
  } else if (!room) {
    room = 'Room 101';
  }
  return {
    formattedName: name,
    formattedRoom: room,
    fee: parseFloat(body.consultation_fee)
  };
}

// Add Doctor Profile
router.post('/', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    const error = validateDoctorInput(req.body);
    if (error) {
      return res.status(400).json({ error });
    }

    const { user_id, specialization, qualification, department, availability } = req.body;
    const { formattedName, formattedRoom, fee } = formatDoctorData(req.body);

    const result = await run(
      `INSERT INTO doctors (user_id, full_name, specialization, qualification, department, consultation_fee, room_no, availability)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id || null, formattedName, specialization.trim(), qualification ? qualification.trim() : '', department.trim(), fee, formattedRoom, availability || 'Mon-Fri 09:00 - 17:00']
    );

    await logAudit(req.user, 'ADD_DOCTOR', 'Doctor Management', `Added doctor ${formattedName} (${specialization})`);
    res.status(201).json({ message: 'Doctor added successfully', doctorId: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Doctor Details
router.put('/:id', verifyToken, authorizeRoles('Administrator', 'Doctor'), async (req, res) => {
  try {
    const error = validateDoctorInput(req.body);
    if (error) {
      return res.status(400).json({ error });
    }

    const { specialization, qualification, department, availability } = req.body;
    const { formattedName, formattedRoom, fee } = formatDoctorData(req.body);

    await run(
      `UPDATE doctors SET full_name = ?, specialization = ?, qualification = ?, department = ?, consultation_fee = ?, room_no = ?, availability = ? WHERE id = ?`,
      [formattedName, specialization.trim(), qualification ? qualification.trim() : '', department.trim(), fee, formattedRoom, availability, req.params.id]
    );

    await logAudit(req.user, 'UPDATE_DOCTOR', 'Doctor Management', `Updated doctor ID ${req.params.id} (${formattedName})`);
    res.json({ message: 'Doctor updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Doctor Profile (Admin only)
router.delete('/:id', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    const doctorId = req.params.id;
    const doctor = await get('SELECT * FROM doctors WHERE id = ?', [doctorId]);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    // Check for active linked appointments or medical records
    const appts = await get('SELECT COUNT(*) AS total FROM appointments WHERE doctor_id = ?', [doctorId]);
    const apptCount = appts ? (appts.total !== undefined ? appts.total : appts['total'] || 0) : 0;

    const records = await get('SELECT COUNT(*) AS total FROM medical_records WHERE doctor_id = ?', [doctorId]);
    const recordCount = records ? (records.total !== undefined ? records.total : records['total'] || 0) : 0;

    if (apptCount > 0 || recordCount > 0) {
      return res.status(400).json({
        error: `Cannot delete doctor "${doctor.full_name}" because they have ${apptCount} appointment(s) and ${recordCount} medical record(s) linked.`
      });
    }

    // Clean up doctor schedule & department head reference
    await run(`DELETE FROM doctor_schedules WHERE doctor_id = ?`, [doctorId]);
    await run(`UPDATE departments SET head_doctor_id = NULL WHERE head_doctor_id = ?`, [doctorId]);
    await run(`DELETE FROM doctors WHERE id = ?`, [doctorId]);

    await logAudit(req.user, 'DELETE_DOCTOR', 'Doctor Management', `Deleted doctor ${doctor.full_name} (ID: ${doctorId})`);
    res.json({ message: `Doctor ${doctor.full_name} deleted successfully` });
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
