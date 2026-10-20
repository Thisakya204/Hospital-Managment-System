const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'hms-super-secret-key-2026';

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role_name,
      department: user.department
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function verifyToken(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No valid authentication token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication session.' });
  }
}

// Role-Based Access Control (RBAC) Guard
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'User is not authenticated.' });
    }

    if (!allowedRoles.includes(req.user.role) && req.user.role !== 'Administrator') {
      return res.status(403).json({
        error: `Access Forbidden: Role '${req.user.role}' does not have permissions for this action.`
      });
    }

    next();
  };
}

module.exports = {
  JWT_SECRET,
  generateToken,
  verifyToken,
  authorizeRoles
};
