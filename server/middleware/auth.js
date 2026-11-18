import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';

export function signAuthToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      username: user.username,
    },
    process.env.JWT_SECRET || 'dev_secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : req.query.token || '';

    if (!token) {
      return res.status(401).json({ error: 'Authentication token required.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    const userRes = await query(
      `SELECT u.id, u.name, u.username, u.email, u.avatar_url, u.status, u.email_verified,
              u.phone, u.location, u.specialty, u.hourly_rate, u.skills, u.bio,
              r.name AS role, r.label AS role_label
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [decoded.id]
    );

    if (userRes.rowCount === 0) {
      return res.status(401).json({ error: 'Account no longer exists.' });
    }

    const user = userRes.rows[0];
    if (user.status === 'deactivated') {
      return res.status(403).json({ error: 'Account has been deactivated.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action.' });
    }
    next();
  };
}
