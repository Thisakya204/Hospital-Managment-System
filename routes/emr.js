const express = require('express');
const router = express.Router();
const { all, get, run } = require('../db/database');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { logAudit } = require('../utils/auditLogger');

// Get All Medical Records (EMR History)
router.get('/', verifyToken, async (req, res) => {
  try {
    const records = await all(
      `SELECT mr.*, 
              p.full_name as patient_name, p.mrn, p.gender, p.dob,
              d.full_name as doctor_name, d.specialization
       FROM medical_records mr
       JOIN patients p ON mr.patient_id = p.id
       JOIN doctors d ON mr.doctor_id = d.id
       ORDER BY mr.record_date DESC`
    );

    // Attach prescriptions to each record
    for (let r of records) {
      r.prescriptions = await all(`SELECT * FROM prescriptions WHERE medical_record_id = ?`, [r.id]);
    }

    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Patient EMR History
router.get('/patient/:patientId', verifyToken, async (req, res) => {
  try {
    const patientId = req.params.patientId;
    const records = await all(
      `SELECT mr.*, d.full_name as doctor_name, d.specialization
       FROM medical_records mr
       JOIN doctors d ON mr.doctor_id = d.id
       WHERE mr.patient_id = ?
       ORDER BY mr.record_date DESC`,
      [patientId]
    );

    // Attach prescriptions to each record
    for (let r of records) {
      r.prescriptions = await all(`SELECT * FROM prescriptions WHERE medical_record_id = ?`, [r.id]);
    }

    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create New EMR Diagnosis Record (Doctors only)
router.post('/', verifyToken, authorizeRoles('Administrator', 'Doctor'), async (req, res) => {
  try {
    const {
      patient_id,
      doctor_id,
      appointment_id,
      diagnosis,
      symptoms,
      treatment_plan,
      vitals_bp,
      vitals_temp,
      vitals_pulse,
      vitals_weight,
      prescriptions, // Array of { medicine_name, dosage, frequency, duration_days }
      lab_requests    // Array of { test_name, category }
    } = req.body;

    if (!patient_id || !doctor_id || !diagnosis) {
      return res.status(400).json({ error: 'Required: patient_id, doctor_id, diagnosis' });
    }

    const emrResult = await run(
      `INSERT INTO medical_records (patient_id, doctor_id, appointment_id, diagnosis, symptoms, treatment_plan, vitals_bp, vitals_temp, vitals_pulse, vitals_weight)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patient_id,
        doctor_id,
        appointment_id || null,
        diagnosis,
        symptoms || '',
        treatment_plan || '',
        vitals_bp || '',
        vitals_temp || '',
        vitals_pulse || '',
        vitals_weight || ''
      ]
    );

    const recordId = emrResult.lastID;

    // Insert Prescriptions if provided
    if (Array.isArray(prescriptions) && prescriptions.length > 0) {
      for (const p of prescriptions) {
        if (p.medicine_name && p.dosage) {
          await run(
            `INSERT INTO prescriptions (medical_record_id, medicine_name, dosage, frequency, duration_days, status)
             VALUES (?, ?, ?, ?, ?, 'Pending')`,
            [recordId, p.medicine_name, p.dosage, p.frequency || 'Once Daily', p.duration_days || 7]
          );
        }
      }
    }

    // Insert Lab Orders if provided
    if (Array.isArray(lab_requests) && lab_requests.length > 0) {
      for (const l of lab_requests) {
        if (l.test_name) {
          await run(
            `INSERT INTO lab_tests (patient_id, doctor_id, test_name, category, status)
             VALUES (?, ?, ?, ?, 'Requested')`,
            [patient_id, doctor_id, l.test_name, l.category || 'General']
          );
        }
      }
    }

    // Update appointment status to Completed if linked
    if (appointment_id) {
      await run(`UPDATE appointments SET status = 'Completed' WHERE id = ?`, [appointment_id]);
    }

    await logAudit(req.user, 'CREATE_EMR_RECORD', 'EMR', `Created EMR record for patient ID ${patient_id}: ${diagnosis}`);
    res.status(201).json({ message: 'Medical record created successfully', recordId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
