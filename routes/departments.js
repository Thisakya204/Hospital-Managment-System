const express = require('express');
const router = express.Router();
const { all, get, run } = require('../db/database');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { logAudit } = require('../utils/auditLogger');

// List All Departments with Doctor Count & Head Doctor Info
router.get('/', verifyToken, async (req, res) => {
  try {
    const departments = await all(`
      SELECT 
        d.*,
        doc.full_name as head_doctor_name,
        (SELECT COUNT(*) FROM doctors doc2 WHERE doc2.department = d.name) as doctor_count,
        (SELECT COUNT(*) FROM staff s WHERE s.department = d.name) as staff_count
      FROM departments d
      LEFT JOIN doctors doc ON d.head_doctor_id = doc.id
      ORDER BY d.name ASC
    `);
    res.json(departments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Single Department
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const department = await get(`
      SELECT 
        d.*,
        doc.full_name as head_doctor_name
      FROM departments d
      LEFT JOIN doctors doc ON d.head_doctor_id = doc.id
      WHERE d.id = ?
    `, [req.params.id]);

    if (!department) return res.status(404).json({ error: 'Department not found' });
    res.json(department);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Department (Admin only)
router.post('/', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    const { dept_code, name, head_doctor_id, description, phone, location_floor, status } = req.body;
    if (!dept_code || !name) {
      return res.status(400).json({ error: 'Required fields: dept_code, name' });
    }

    const result = await run(`
      INSERT INTO departments (dept_code, name, head_doctor_id, description, phone, location_floor, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [dept_code, name, head_doctor_id || null, description || '', phone || '', location_floor || 'General Ward', status || 'Active']);

    await logAudit(req.user, 'ADD_DEPARTMENT', 'Department Management', `Created department ${name} (${dept_code})`);
    res.status(201).json({ message: 'Department created successfully', departmentId: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Department (Admin only)
router.put('/:id', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    const { dept_code, name, head_doctor_id, description, phone, location_floor, status } = req.body;
    await run(`
      UPDATE departments SET
        dept_code = COALESCE(?, dept_code),
        name = COALESCE(?, name),
        head_doctor_id = ?,
        description = COALESCE(?, description),
        phone = COALESCE(?, phone),
        location_floor = COALESCE(?, location_floor),
        status = COALESCE(?, status)
      WHERE id = ?
    `, [dept_code, name, head_doctor_id || null, description, phone, location_floor, status, req.params.id]);

    await logAudit(req.user, 'UPDATE_DEPARTMENT', 'Department Management', `Updated department ID ${req.params.id}`);
    res.json({ message: 'Department updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Department (Admin only)
router.delete('/:id', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    await run(`DELETE FROM departments WHERE id = ?`, [req.params.id]);
    await logAudit(req.user, 'DELETE_DEPARTMENT', 'Department Management', `Deleted department ID ${req.params.id}`);
    res.json({ message: 'Department deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
