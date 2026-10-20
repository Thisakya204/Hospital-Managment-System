const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { get, all, run } = require('../db/database');
const { generateToken, verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { logAudit } = require('../utils/auditLogger');

// Login Route
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = await get(`SELECT * FROM users WHERE username = ?`, [username]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials provided.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials provided.' });
    }

    const token = generateToken(user);
    await logAudit(
      { id: user.id, full_name: user.full_name, role: user.role_name },
      'USER_LOGIN',
      'Auth',
      `User ${user.username} logged in successfully.`
    );

    res.json({
      message: 'Authentication successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        role: user.role_name,
        department: user.department
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Password Management (Change Password)
router.put('/change-password', verifyToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await run(`UPDATE users SET password_hash = ? WHERE id = ?`, [newHash, req.user.id]);

    await logAudit(req.user, 'CHANGE_PASSWORD', 'Auth', 'User updated account password successfully.');
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Current Logged In User Info
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await get(`SELECT id, username, full_name, email, role_name as role, department, phone, created_at FROM users WHERE id = ?`, [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List All Users (Admin only)
router.get('/users', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    const users = await all(`SELECT id, username, full_name, email, role_name as role, department, phone, created_at FROM users ORDER BY id DESC`);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register New User (Admin only)
router.post('/register', verifyToken, authorizeRoles('Administrator'), async (req, res) => {
  try {
    const { username, password, full_name, email, role_name, department, phone } = req.body;
    if (!username || !password || !full_name || !email || !role_name) {
      return res.status(400).json({ error: 'Required fields missing: username, password, full_name, email, role_name' });
    }

    const existing = await get(`SELECT id FROM users WHERE username = ? OR email = ?`, [username, email]);
    if (existing) {
      return res.status(400).json({ error: 'Username or email already exists in system.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await run(
      `INSERT INTO users (username, password_hash, full_name, email, role_name, department, phone) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [username, hash, full_name, email, role_name, department || 'General', phone || '']
    );

    await logAudit(req.user, 'CREATE_USER', 'User Management', `Created user ${username} (${role_name})`);
    res.status(201).json({ message: 'User created successfully', userId: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
