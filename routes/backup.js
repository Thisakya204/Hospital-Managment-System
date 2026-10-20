const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { performBackup, getBackupList, getDisasterRecoveryPlan, BACKUP_DIR } = require('../utils/backupScheduler');
const { logAudit } = require('../utils/auditLogger');

// List All Automated and Manual Backups (Section 10 Backup and Recovery)
router.get('/list', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    const list = getBackupList();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger Manual or Scheduled Backup (Daily / Weekly Full Backup)
router.post('/trigger', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    const type = req.body.type === 'Weekly' ? 'Weekly' : 'Daily';
    const result = await performBackup(type, req.user);
    res.json({ message: `${type} backup snapshot generated successfully.`, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download Specific Backup Snapshot
router.get('/download/:filename', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const targetFile = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(targetFile)) {
      return res.status(404).json({ error: 'Requested backup snapshot not found.' });
    }

    await logAudit(req.user, 'DOWNLOAD_BACKUP', 'Backup & Recovery', `Downloaded backup snapshot ${filename}`);
    res.download(targetFile, filename);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Disaster Recovery Plan & Procedures (Section 10 Disaster Recovery Plan)
router.get('/disaster-recovery-plan', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    const plan = getDisasterRecoveryPlan();
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
