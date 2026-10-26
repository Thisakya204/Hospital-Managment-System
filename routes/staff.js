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

// Staff validation helper
function validateStaffInput(body) {
  let { full_name, role, department, phone, salary } = body;
  if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
    return 'Staff full name is required';
  }
  const cleanName = full_name.trim();
  if (cleanName.length < 3) {
    return 'Staff name must be at least 3 characters long';
  }
  if (/\d/.test(cleanName)) {
    return 'Staff name must contain letters only, numbers are not allowed (e.g. Nimal Perera)';
  }
  if (!/^[a-zA-Z\s\.\-']+$/.test(cleanName)) {
    return 'Staff name contains invalid characters. Use letters, dots, and spaces only';
  }

  if (!role || typeof role !== 'string' || !role.trim()) {
    return 'Staff role is required';
  }
  if (!department || typeof department !== 'string' || !department.trim()) {
    return 'Staff department is required';
  }

  if (phone) {
    const cleanPhone = String(phone).trim();
    const digitsOnly = cleanPhone.replace(/\D/g, '');
    if (digitsOnly.length < 9 || digitsOnly.length > 15) {
      return 'Please enter a valid phone number with 9-15 digits (e.g. 0712345678)';
    }
    if (/^(\d)\1+$/.test(digitsOnly)) {
      return 'Phone number cannot consist of the same repeating digit';
    }
    if (!/^(?:\+?[0-9\s\-()]{9,18})$/.test(cleanPhone)) {
      return 'Invalid phone number format';
    }
  }

  if (salary !== undefined && salary !== null && salary !== '') {
    const sal = parseFloat(salary);
    if (isNaN(sal) || sal <= 0) {
      return 'Monthly salary must be a positive amount (e.g. Rs. 35,000)';
    }
  }

  return null;
}

// Add Staff Member (SSD 3.9 Employee Registration)
router.post('/', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    const error = validateStaffInput(req.body);
    if (error) {
      return res.status(400).json({ error });
    }

    const { full_name, role, department, phone, salary, joining_date } = req.body;
    const empId = `EMP-${Math.floor(100 + Math.random() * 900)}`;
    const cleanPhone = phone ? String(phone).trim() : '';
    const cleanSalary = salary ? parseFloat(salary) : 0;
    const cleanJoiningDate = joining_date && joining_date.trim() ? joining_date.trim() : new Date().toISOString().split('T')[0];

    const result = await run(
      `INSERT INTO staff (employee_id, full_name, role, department, phone, salary, joining_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [empId, full_name.trim(), role.trim(), department.trim(), cleanPhone, cleanSalary, cleanJoiningDate]
    );

    await logAudit(req.user, 'ADD_STAFF', 'Staff Management', `Added employee ${full_name.trim()} (${empId})`);

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
    const error = validateStaffInput(req.body);
    if (error) {
      return res.status(400).json({ error });
    }

    const staffId = req.params.id;
    const { full_name, role, department, phone, salary } = req.body;
    const cleanPhone = phone ? String(phone).trim() : '';
    const cleanSalary = salary ? parseFloat(salary) : 0;

    await run(
      `UPDATE staff SET full_name = ?, role = ?, department = ?, phone = ?, salary = ? WHERE id = ?`,
      [full_name.trim(), role.trim(), department.trim(), cleanPhone, cleanSalary, staffId]
    );

    await logAudit(req.user, 'UPDATE_STAFF', 'Staff Management', `Updated staff member ID ${staffId} — ${full_name.trim()}`);
    res.json({ message: 'Staff details updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Staff Member (Admin only)
router.delete('/:id', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    const staffId = req.params.id;
    const staff = await get('SELECT * FROM staff WHERE id = ?', [staffId]);
    if (!staff) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    // Clean up attendance and leaves if tables exist
    try { await run(`DELETE FROM staff_attendance WHERE staff_id = ?`, [staffId]); } catch (e) {}
    try { await run(`DELETE FROM staff_leaves WHERE staff_id = ?`, [staffId]); } catch (e) {}
    await run(`DELETE FROM staff WHERE id = ?`, [staffId]);

    await logAudit(req.user, 'DELETE_STAFF', 'Staff Management', `Deleted staff member ${staff.full_name} (${staff.employee_id})`);
    res.json({ message: `Staff member ${staff.full_name} (${staff.employee_id}) deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
