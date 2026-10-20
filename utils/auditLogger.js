const { run } = require('../db/database');

async function logAudit(user, action, module, details) {
  try {
    const userName = user ? (user.full_name || user.username || 'System') : 'System';
    const userRole = user ? (user.role || user.role_name || 'System') : 'System';
    const userId = user ? (user.id || null) : null;

    await run(
      `INSERT INTO audit_logs (user_id, user_name, user_role, action, module, details) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, userName, userRole, action, module, details]
    );
  } catch (err) {
    console.error('Audit Logging Error:', err.message);
  }
}

module.exports = { logAudit };
