const express = require('express');
const router = express.Router();
const { all, get, run } = require('../db/database');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { logAudit } = require('../utils/auditLogger');

// List Staff Members
router.get('/', verifyToken, authorizeRoles('Administrator', 'Accountant', 'Doctor', 'Nurse'), async (req, res) => {
  try {
    const staff = await all(`SELECT * FROM staff ORDER BY id ASC`);
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Staff Member (SSD 3.9 Employee Registration)
router.post('/', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    const { full_name, role, department, phone, salary, joining_date } = req.body;
    if (!full_name || !role || !department) {
      return res.status(400).json({ error: 'Required: full_name, role, department' });
    }

    const empId = `EMP-${Math.floor(100 + Math.random() * 900)}`;

    const result = await run(
      `INSERT INTO staff (employee_id, full_name, role, department, phone, salary, joining_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [empId, full_name, role, department, phone || '', salary || 0, joining_date || new Date().toISOString().split('T')[0]]
    );

    await logAudit(req.user, 'ADD_STAFF', 'Staff Management', `Added employee ${full_name} (${empId})`);

    res.status(201).json({ message: 'Staff registered successfully', staffId: result.lastID, employee_id: empId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Log Staff Attendance (SSD 3.9 Attendance)
router.post('/attendance', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    const { staff_id, date, status } = req.body; // status: Present, Absent, Half-Day
    if (!staff_id || !status) {
      return res.status(400).json({ error: 'staff_id and status are required' });
    }

    await run(`
      CREATE TABLE IF NOT EXISTS staff_attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL,
        attendance_date DATE NOT NULL,
        status TEXT NOT NULL,
        FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
      );
    `);

    const attDate = date || new Date().toISOString().split('T')[0];
    await run(
      `INSERT INTO staff_attendance (staff_id, attendance_date, status) VALUES (?, ?, ?)`,
      [staff_id, attDate, status]
    );

    await logAudit(req.user, 'RECORD_ATTENDANCE', 'Staff Management', `Logged attendance '${status}' for staff ID ${staff_id}`);
    res.json({ message: 'Attendance recorded successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get All Leave Requests (SSD 3.9 Leave Records)
router.get('/leaves', verifyToken, authorizeRoles('Administrator', 'Accountant'), async (req, res) => {
  try {
    const leaves = await all(`
      SELECT sl.*, s.full_name, s.employee_id, s.role, s.department
      FROM staff_leaves sl
      JOIN staff s ON sl.staff_id = s.id
      ORDER BY sl.applied_at DESC
    `);
    res.json(leaves);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Apply for Leave (any user can apply for their staff record)
router.post('/leave', verifyToken, async (req, res) => {
  try {
    const { staff_id, leave_type, start_date, end_date, reason } = req.body;
    if (!staff_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'staff_id, start_date, and end_date are required' });
    }

    const result = await run(
      `INSERT INTO staff_leaves (staff_id, leave_type, start_date, end_date, reason, status) VALUES (?, ?, ?, ?, ?, 'Pending')`,
      [staff_id, leave_type || 'Annual Leave', start_date, end_date, reason || 'Personal']
    );

    await logAudit(req.user, 'APPLY_LEAVE', 'Staff Management', `Leave applied for staff ID ${staff_id} from ${start_date} to ${end_date}`);
    res.status(201).json({ message: 'Leave application submitted', leaveId: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve or Reject Leave (Admin only)
router.put('/leave/:id', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    const { status } = req.body; // 'Approved' or 'Rejected'
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be Approved or Rejected' });
    }
    await run(`UPDATE staff_leaves SET status = ? WHERE id = ?`, [status, req.params.id]);
    await logAudit(req.user, 'UPDATE_LEAVE_STATUS', 'Staff Management', `Leave ID ${req.params.id} ${status}`);
    res.json({ message: `Leave ${status} successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Staff Member Details
router.put('/:id', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    const staffId = req.params.id;
    const { full_name, role, department, phone, salary } = req.body;

    await run(
      `UPDATE staff SET full_name = ?, role = ?, department = ?, phone = ?, salary = ? WHERE id = ?`,
      [full_name, role, department, phone || '', salary || 0, staffId]
    );

    await logAudit(req.user, 'UPDATE_STAFF', 'Staff Management', `Updated staff member ID ${staffId} — ${full_name}`);
    res.json({ message: 'Staff details updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
