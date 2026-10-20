const express = require('express');
const router = express.Router();
const { all, get, run } = require('../db/database');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { logAudit } = require('../utils/auditLogger');

// List In-Patient Admissions
router.get('/', verifyToken, async (req, res) => {
  try {
    const { status, patient_id } = req.query;
    let sql = `
      SELECT 
        a.*,
        p.full_name as patient_name,
        p.mrn,
        p.phone as patient_phone,
        p.gender as patient_gender,
        p.blood_group as patient_blood_group,
        doc.full_name as doctor_name,
        doc.specialization as doctor_specialization,
        d.name as department_name
      FROM admissions a
      JOIN patients p ON a.patient_id = p.id
      JOIN doctors doc ON a.doctor_id = doc.id
      LEFT JOIN departments d ON a.department_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ` AND a.status = ?`;
      params.push(status);
    }
    if (patient_id) {
      sql += ` AND a.patient_id = ?`;
      params.push(patient_id);
    }

    sql += ` ORDER BY a.id DESC`;
    const admissions = await all(sql, params);
    res.json(admissions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Single Admission
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const admission = await get(`
      SELECT 
        a.*,
        p.full_name as patient_name,
        p.mrn,
        p.phone as patient_phone,
        doc.full_name as doctor_name,
        d.name as department_name
      FROM admissions a
      JOIN patients p ON a.patient_id = p.id
      JOIN doctors doc ON a.doctor_id = doc.id
      LEFT JOIN departments d ON a.department_id = d.id
      WHERE a.id = ?
    `, [req.params.id]);

    if (!admission) return res.status(404).json({ error: 'Admission record not found' });
    res.json(admission);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admit New Patient
router.post('/', verifyToken, authorizeRoles('Administrator', 'Doctor', 'Nurse', 'Receptionist'), async (req, res) => {
  try {
    const { patient_id, doctor_id, department_id, room_no, bed_no, admission_type, notes } = req.body;
    if (!patient_id || !doctor_id || !room_no || !bed_no) {
      return res.status(400).json({ error: 'Required: patient_id, doctor_id, room_no, bed_no' });
    }

    const result = await run(`
      INSERT INTO admissions (patient_id, doctor_id, department_id, room_no, bed_no, admission_type, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, 'Admitted', ?)
    `, [patient_id, doctor_id, department_id || null, room_no, bed_no, admission_type || 'Normal', notes || '']);

    await logAudit(req.user, 'ADMIT_PATIENT', 'Admissions', `Admitted Patient #${patient_id} into ${room_no} (${bed_no})`);
    res.status(201).json({ message: 'Patient admitted successfully', admissionId: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Discharge Patient
router.put('/:id/discharge', verifyToken, authorizeRoles('Administrator', 'Doctor', 'Nurse'), async (req, res) => {
  try {
    const { notes } = req.body;
    const dischargeDate = new Date().toISOString();

    await run(`
      UPDATE admissions SET
        status = 'Discharged',
        discharge_date = ?,
        notes = CASE WHEN ? IS NOT NULL AND ? != '' THEN CONCAT(notes, ' | Discharge Notes: ', ?) ELSE notes END
      WHERE id = ?
    `, [dischargeDate, notes || '', notes || '', notes || '', req.params.id]);

    await logAudit(req.user, 'DISCHARGE_PATIENT', 'Admissions', `Discharged patient from Admission #${req.params.id}`);
    res.json({ message: 'Patient discharged successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Admission Info
router.put('/:id', verifyToken, authorizeRoles('Administrator', 'Doctor', 'Nurse'), async (req, res) => {
  try {
    const { room_no, bed_no, doctor_id, department_id, admission_type, notes } = req.body;
    await run(`
      UPDATE admissions SET
        room_no = COALESCE(?, room_no),
        bed_no = COALESCE(?, bed_no),
        doctor_id = COALESCE(?, doctor_id),
        department_id = COALESCE(?, department_id),
        admission_type = COALESCE(?, admission_type),
        notes = COALESCE(?, notes)
      WHERE id = ?
    `, [room_no, bed_no, doctor_id, department_id, admission_type, notes, req.params.id]);

    await logAudit(req.user, 'UPDATE_ADMISSION', 'Admissions', `Updated details for Admission #${req.params.id}`);
    res.json({ message: 'Admission details updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
