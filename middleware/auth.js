const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../models/db');

// Express route authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, config.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }

    const user = db.findUserById(decoded.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    req.user = db.getSafeUser(user);
    next();
  });
}

// Socket.IO authentication middleware (optional token verification)
function verifySocketToken(token) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    const user = db.findUserById(decoded.id);
    return user ? db.getSafeUser(user) : null;
  } catch (err) {
    return null;
  }
}

module.exports = {
  authenticateToken,
  verifySocketToken
};
