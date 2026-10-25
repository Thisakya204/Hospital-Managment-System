const express = require('express');
const router = express.Router();
const { all, get, run } = require('../db/database');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { logAudit } = require('../utils/auditLogger');

// List / Search Patients
router.get('/', verifyToken, async (req, res) => {
  try {
    const search = req.query.search ? `%${req.query.search}%` : '%';
    const patients = await all(
      `SELECT * FROM patients 
       WHERE full_name LIKE ? OR mrn LIKE ? OR phone LIKE ? 
       ORDER BY id DESC`,
      [search, search, search]
    );
    res.json(patients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Single Patient details with full medical timeline
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const patientId = req.params.id;
    const patient = await get(`SELECT * FROM patients WHERE id = ?`, [patientId]);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const appointments = await all(
      `SELECT a.*, d.full_name as doctor_name, d.specialization 
       FROM appointments a 
       JOIN doctors d ON a.doctor_id = d.id 
       WHERE a.patient_id = ? ORDER BY a.appointment_date DESC`,
      [patientId]
    );

    const emrRecords = await all(
      `SELECT mr.*, d.full_name as doctor_name 
       FROM medical_records mr 
       JOIN doctors d ON mr.doctor_id = d.id 
       WHERE mr.patient_id = ? ORDER BY mr.record_date DESC`,
      [patientId]
    );

    const labTests = await all(
      `SELECT lt.*, d.full_name as doctor_name 
       FROM lab_tests lt 
       JOIN doctors d ON lt.doctor_id = d.id 
       WHERE lt.patient_id = ? ORDER BY lt.requested_date DESC`,
      [patientId]
    );

    const invoices = await all(
      `SELECT * FROM invoices WHERE patient_id = ? ORDER BY id DESC`,
      [patientId]
    );

    const documents = await all(
      `SELECT * FROM patient_documents WHERE patient_id = ? ORDER BY id DESC`,
      [patientId]
    ).catch(() => []); // Graceful fallback if table empty

    res.json({
      patient,
      appointments,
      emrRecords,
      labTests,
      invoices,
      documents: documents || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register New Patient
router.post('/', verifyToken, authorizeRoles('Administrator', 'Receptionist', 'Doctor', 'Nurse'), async (req, res) => {
  try {
    const { full_name, dob, gender, phone, email, address, blood_group, emergency_contact, allergies } = req.body;
    if (!full_name || !dob || !gender || !phone) {
      return res.status(400).json({ error: 'Required fields: full_name, dob, gender, phone' });
    }

    const mrn = `MRN-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

    const result = await run(
      `INSERT INTO patients (mrn, full_name, dob, gender, phone, email, address, blood_group, emergency_contact, allergies)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [mrn, full_name, dob, gender, phone, email || '', address || '', blood_group || 'Unknown', emergency_contact || '', allergies || 'None']
    );

    await logAudit(req.user, 'REGISTER_PATIENT', 'Patient Management', `Registered patient ${full_name} (${mrn})`);
    res.status(201).json({ message: 'Patient registered successfully', patientId: result.lastID, mrn });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Patient Information (SSD 3.2 Update Patient Info)
router.put('/:id', verifyToken, authorizeRoles('Administrator', 'Receptionist', 'Doctor', 'Nurse'), async (req, res) => {
  try {
    const patientId = req.params.id;
    const { full_name, dob, gender, phone, email, address, blood_group, emergency_contact, allergies } = req.body;

    await run(
      `UPDATE patients SET 
       full_name = COALESCE(?, full_name), 
       dob = COALESCE(?, dob), 
       gender = COALESCE(?, gender), 
       phone = COALESCE(?, phone), 
       email = COALESCE(?, email), 
       address = COALESCE(?, address), 
       blood_group = COALESCE(?, blood_group), 
       emergency_contact = COALESCE(?, emergency_contact), 
       allergies = COALESCE(?, allergies)
       WHERE id = ?`,
      [full_name, dob, gender, phone, email, address, blood_group, emergency_contact, allergies, patientId]
    );

    await logAudit(req.user, 'UPDATE_PATIENT', 'Patient Management', `Updated info for patient ID ${patientId}`);
    res.json({ message: 'Patient updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, '..', 'uploads');
    try {
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
    } catch (e) {
      // Ignore
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'patient-doc-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB limit
});

// Upload Patient Document (SSD 3.2 Upload Documents)
router.post('/:id/documents', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const patientId = req.params.id;
    const document_name = req.body.document_name || (req.file ? req.file.originalname : 'Document');
    const document_type = req.body.document_type || 'Scan/Report';
    const notes = req.body.notes || '';
    const file_url = req.file ? `/uploads/${req.file.filename}` : null;
    const file_size = req.file ? `${(req.file.size / 1024).toFixed(1)} KB` : null;

    // Ensure table exists with file_url and file_size
    await run(`
      CREATE TABLE IF NOT EXISTS patient_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        document_name TEXT NOT NULL,
        document_type TEXT DEFAULT 'General',
        file_url TEXT,
        file_size TEXT,
        notes TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try {
      await run(`IF COL_LENGTH('dbo.patient_documents', 'file_url') IS NULL ALTER TABLE dbo.patient_documents ADD file_url NVARCHAR(MAX) NULL;`);
      await run(`IF COL_LENGTH('dbo.patient_documents', 'file_size') IS NULL ALTER TABLE dbo.patient_documents ADD file_size NVARCHAR(100) NULL;`);
    } catch (e) {
      // Ignore if not MSSQL or already exists
    }

    const result = await run(
      `INSERT INTO patient_documents (patient_id, document_name, document_type, file_url, file_size, notes) VALUES (?, ?, ?, ?, ?, ?)`,
      [patientId, document_name, document_type, file_url, file_size, notes]
    );

    await logAudit(req.user, 'UPLOAD_PATIENT_DOCUMENT', 'Patient Management', `Uploaded document '${document_name}' (${document_type}) for patient ID ${patientId}`);
    res.status(201).json({ message: 'Document uploaded successfully', documentId: result.lastID, file_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Patient (Admin only)
router.delete('/:id', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    const patientId = req.params.id;
    await run(`DELETE FROM patients WHERE id = ?`, [patientId]);
    await logAudit(req.user, 'DELETE_PATIENT', 'Patient Management', `Deleted patient ID ${patientId}`);
    res.json({ message: 'Patient record deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
