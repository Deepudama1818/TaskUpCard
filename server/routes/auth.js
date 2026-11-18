import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query, withTransaction } from '../db/pool.js';
import { authenticate, signAuthToken } from '../middleware/auth.js';
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../services/email.js';

const router = express.Router();

function sanitizeUser(u) {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    role: u.role,
    role_label: u.role_label,
    avatar_url: u.avatar_url,
    phone: u.phone,
    location: u.location,
    specialty: u.specialty,
    hourly_rate: Number(u.hourly_rate || 0),
    skills: Array.isArray(u.skills) ? u.skills : [],
    bio: u.bio,
    status: u.status,
    email_verified: u.email_verified,
    last_login_at: u.last_login_at,
    created_at: u.created_at,
  };
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const userRes = await query(
      `SELECT u.*, r.name AS role, r.label AS role_label
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE LOWER(u.email) = LOWER($1)`,
      [String(email).trim()]
    );

    if (userRes.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = userRes.rows[0];
    if (user.status === 'deactivated') {
      return res.status(403).json({ error: 'This account has been deactivated. Contact your workspace administrator.' });
    }

    const valid = await bcrypt.compare(String(password), user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    await query('UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);

    const cleanUser = sanitizeUser(user);
    const token = signAuthToken(cleanUser);

    res.json({ token, user: cleanUser });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Unable to sign in.' });
  }
});

// GET /api/auth/invite/:token
router.get('/invite/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const invRes = await query(
      `SELECT i.id, i.email, i.name, i.specialty, i.skills, i.status, i.expires_at,
              r.name AS role, r.label AS role_label
       FROM invitations i
       JOIN roles r ON r.id = i.role_id
       WHERE i.token = $1`,
      [token]
    );

    if (invRes.rowCount === 0) {
      return res.status(404).json({ error: 'Invitation link not found.' });
    }
    const inv = invRes.rows[0];
    if (inv.status !== 'pending') {
      return res.status(400).json({ error: `Invitation has already been ${inv.status}.` });
    }
    if (new Date(inv.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invitation link has expired.' });
    }

    res.json({ invitation: inv });
  } catch (err) {
    console.error('[Auth] Inspect invite error:', err);
    res.status(500).json({ error: 'Failed to load invitation.' });
  }
});

// POST /api/auth/accept-invite
router.post('/accept-invite', async (req, res) => {
  try {
    const { token, name, username, password, phone, location, bio } = req.body || {};
    if (!token || !password || String(password).length < 8) {
      return res.status(400).json({ error: 'Valid invitation token and password (min 8 chars) are required.' });
    }

    const result = await withTransaction(async (client) => {
      const invRes = await client.query(
        `SELECT i.*, r.name AS role, r.label AS role_label
         FROM invitations i
         JOIN roles r ON r.id = i.role_id
         WHERE i.token = $1 FOR UPDATE`,
        [token]
      );
      if (invRes.rowCount === 0) {
        throw Object.assign(new Error('Invitation not found.'), { statusCode: 404 });
      }
      const inv = invRes.rows[0];
      if (inv.status !== 'pending' || new Date(inv.expires_at) < new Date()) {
        throw Object.assign(new Error('Invitation is no longer valid.'), { statusCode: 400 });
      }

      const passwordHash = await bcrypt.hash(String(password), 10);
      const cleanName = (name || inv.name).trim();
      const baseUsername = (username || cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '.')).replace(/^\.+|\.+$/g, '');
      const uniqueUsername = `${baseUsername || 'user'}.${crypto.randomBytes(2).toString('hex')}`;

      const existingUser = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [inv.email]);
      let userRow;
      if (existingUser.rowCount > 0) {
        const upRes = await client.query(
          `UPDATE users SET name = $1, password_hash = $2, phone = COALESCE($3, phone),
            location = COALESCE($4, location), bio = COALESCE($5, bio),
            status = 'active', email_verified = TRUE, last_login_at = NOW(), updated_at = NOW()
           WHERE id = $6
           RETURNING *`,
          [cleanName, passwordHash, phone || null, location || null, bio || null, existingUser.rows[0].id]
        );
        userRow = upRes.rows[0];
      } else {
        const insRes = await client.query(
          `INSERT INTO users (
            role_id, name, username, email, password_hash, phone, location,
            specialty, skills, bio, status, email_verified, last_login_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,'active',TRUE,NOW())
          RETURNING *`,
          [
            inv.role_id,
            cleanName,
            uniqueUsername,
            inv.email.toLowerCase(),
            passwordHash,
            phone || null,
            location || null,
            inv.specialty || null,
            JSON.stringify(inv.skills || []),
            bio || null,
          ]
        );
        userRow = insRes.rows[0];
      }

      const projectIds = Array.isArray(inv.project_ids) ? inv.project_ids : [];
      for (const pid of projectIds) {
        await client.query(
          `INSERT INTO project_members (project_id, user_id, member_role)
           VALUES ($1,$2,'contributor') ON CONFLICT (project_id, user_id) DO NOTHING`,
          [pid, userRow.id]
        );
      }

      await client.query(
        `UPDATE invitations SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
        [inv.id]
      );

      return { ...userRow, role: inv.role, role_label: inv.role_label };
    });

    const cleanUser = sanitizeUser(result);
    const authToken = signAuthToken(cleanUser);
    res.json({ token: authToken, user: cleanUser });
  } catch (err) {
    console.error('[Auth] Accept invite error:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to activate account.' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const userRes = await query('SELECT id, name, email, status FROM users WHERE LOWER(email) = LOWER($1)', [
      String(email).trim(),
    ]);

    if (userRes.rowCount === 0) {
      // Return generic success to avoid email enumeration
      return res.json({ message: 'If an account matches that email, a reset link has been sent.' });
    }

    const user = userRes.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1,$2,$3)`,
      [user.id, token, expiresAt]
    );

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${baseUrl}/?resetToken=${token}`;
    await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });

    res.json({
      message: 'If an account matches that email, a reset link has been sent.',
      // Include previewToken only when SMTP is not configured so local users can complete flow immediately
      ...(!process.env.SMTP_HOST ? { previewResetToken: token } : {}),
    });
  } catch (err) {
    console.error('[Auth] Forgot password error:', err);
    res.status(500).json({ error: 'Failed to initiate password reset.' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password || String(password).length < 8) {
      return res.status(400).json({ error: 'Valid reset token and password (min 8 characters) are required.' });
    }

    await withTransaction(async (client) => {
      const tokenRes = await client.query(
        `SELECT * FROM password_reset_tokens WHERE token = $1 FOR UPDATE`,
        [token]
      );
      if (tokenRes.rowCount === 0) {
        throw Object.assign(new Error('Invalid password reset token.'), { statusCode: 400 });
      }
      const record = tokenRes.rows[0];
      if (record.used_at || new Date(record.expires_at) < new Date()) {
        throw Object.assign(new Error('Reset token has expired or already been used.'), { statusCode: 400 });
      }

      const passwordHash = await bcrypt.hash(String(password), 10);
      await client.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
        passwordHash,
        record.user_id,
      ]);
      await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [record.id]);
    });

    res.json({ message: 'Password updated successfully. You may now sign in.' });
  } catch (err) {
    console.error('[Auth] Reset password error:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Unable to reset password.' });
  }
});

// POST /api/auth/send-verification
router.post('/send-verification', authenticate, async (req, res) => {
  try {
    const token = crypto.randomBytes(24).toString('hex');
    await query('UPDATE users SET verification_token = $1 WHERE id = $2', [token, req.user.id]);
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const verifyUrl = `${baseUrl}/?verifyToken=${token}`;
    await sendVerificationEmail({ to: req.user.email, name: req.user.name, verifyUrl });
    res.json({
      message: 'Verification email dispatched.',
      ...(!process.env.SMTP_HOST ? { previewVerifyToken: token } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send verification email.' });
  }
});

// GET /api/auth/verify-email/:token
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const upd = await query(
      `UPDATE users SET email_verified = TRUE, verification_token = NULL, updated_at = NOW()
       WHERE verification_token = $1 RETURNING id, email`,
      [token]
    );
    if (upd.rowCount === 0) {
      return res.status(400).json({ error: 'Invalid or expired verification token.' });
    }
    res.json({ message: 'Email address verified successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

// PATCH /api/auth/profile
router.patch('/profile', authenticate, async (req, res) => {
  try {
    const { name, phone, location, specialty, bio, skills, currentPassword, newPassword } = req.body || {};

    if (newPassword) {
      if (String(newPassword).length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters.' });
      }
      const uRes = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      const ok = await bcrypt.compare(String(currentPassword || ''), uRes.rows[0].password_hash);
      if (!ok) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
      const nextHash = await bcrypt.hash(String(newPassword), 10);
      await query('UPDATE users SET password_hash = $1 WHERE id = $2', [nextHash, req.user.id]);
    }

    const updated = await query(
      `UPDATE users SET
        name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        location = COALESCE($3, location),
        specialty = COALESCE($4, specialty),
        bio = COALESCE($5, bio),
        skills = COALESCE($6::jsonb, skills),
        updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        name ? String(name).trim() : null,
        phone !== undefined ? phone : null,
        location !== undefined ? location : null,
        specialty !== undefined ? specialty : null,
        bio !== undefined ? bio : null,
        Array.isArray(skills) ? JSON.stringify(skills) : null,
        req.user.id,
      ]
    );

    const fullUser = { ...updated.rows[0], role: req.user.role, role_label: req.user.role_label };
    res.json({ user: sanitizeUser(fullUser) });
  } catch (err) {
    console.error('[Auth] Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, (_req, res) => {
  res.json({ message: 'Signed out cleanly.' });
});

export default router;
