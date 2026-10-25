const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDB } = require('./db/database');

const uploadsDir = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (e) {
  // Ignore filesystem errors in read-only environments
}

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const doctorRoutes = require('./routes/doctors');
const appointmentRoutes = require('./routes/appointments');
const emrRoutes = require('./routes/emr');
const labRoutes = require('./routes/lab');
const pharmacyRoutes = require('./routes/pharmacy');
const billingRoutes = require('./routes/billing');
const staffRoutes = require('./routes/staff');
const reportRoutes = require('./routes/reports');
const auditRoutes = require('./routes/audit');
const backupRoutes = require('./routes/backup');
const departmentRoutes = require('./routes/departments');
const admissionRoutes = require('./routes/admissions');
const { startBackupScheduler } = require('./utils/backupScheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// Database auto-init middleware (ensures DB is ready in serverless environments)
let dbInitialized = false;
app.use(async (req, res, next) => {
  if (!dbInitialized) {
    try {
      await initDB();
      dbInitialized = true;
    } catch (e) {
      console.error('Failed to initialize database in middleware:', e);
    }
  }
  next();
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/emr', emrRoutes);
app.use('/api/lab', labRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/backup', backupRoutes);

// Fallback to index.html for Single Page Application
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server & Initialize Database
async function startServer() {
  try {
    await initDB();
    startBackupScheduler();
    if (!process.env.VERCEL) {
      app.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(`🏥 Hospital Management System (HMS) Server Running`);
        console.log(`🌐 Server URL: http://localhost:${PORT}`);
        console.log(`=======================================================`);
      });
    }
  } catch (err) {
    console.error('Failed to initialize Hospital Management System server:', err);
  }
}

startServer();

module.exports = app;
