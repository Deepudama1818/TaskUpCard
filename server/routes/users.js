import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query, withTransaction } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { sendInvitationEmail } from '../services/email.js';

const router = express.Router();

router.use(authenticate);

// GET /api/users - Directory of users/freelancers with task workload metrics
router.get('/', async (req, res) => {
  try {
    const { role, status, search } = req.query;
    const params = [];
    const conditions = [];

    if (req.user.role === 'freelancer') {
      // Freelancers can see active workspace members on shared projects or managers (for @mentions/collaboration)
      params.push(req.user.id);
      conditions.push(`(
        u.id = $1
        OR r.name IN ('super_admin', 'project_manager')
        OR EXISTS (
          SELECT 1 FROM project_members pm1
          JOIN project_members pm2 ON pm1.project_id = pm2.project_id
          WHERE pm1.user_id = $1 AND pm2.user_id = u.id
        )
      )`);
    }

    if (role) {
      params.push(role);
      conditions.push(`r.name = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`u.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${String(search).trim()}%`);
      conditions.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.specialty ILIKE $${params.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        u.id, u.name, u.username, u.email, u.avatar_url, u.phone, u.location,
        u.specialty, u.hourly_rate, u.skills, u.bio, u.status, u.email_verified,
        u.last_login_at, u.created_at,
        r.name AS role, r.label AS role_label,
        COALESCE((
          SELECT COUNT(*)::int FROM task_assignees ta
          JOIN tasks t ON t.id = ta.task_id
          WHERE ta.user_id = u.id AND t.is_archived = FALSE AND t.status NOT IN ('completed', 'cancelled')
        ), 0) AS active_tasks,
        COALESCE((
          SELECT COUNT(*)::int FROM task_assignees ta
          JOIN tasks t ON t.id = ta.task_id
          WHERE ta.user_id = u.id AND t.is_archived = FALSE AND t.status = 'completed'
        ), 0) AS completed_tasks,
        COALESCE((
          SELECT COUNT(*)::int FROM task_assignees ta
          JOIN tasks t ON t.id = ta.task_id
          WHERE ta.user_id = u.id AND t.is_archived = FALSE
            AND t.status NOT IN ('completed', 'cancelled')
            AND t.due_date IS NOT NULL AND t.due_date < NOW()
        ), 0) AS overdue_tasks,
        COALESCE((
          SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'code', p.code, 'color', p.color))
          FROM project_members pm
          JOIN projects p ON p.id = pm.project_id
          WHERE pm.user_id = u.id
        ), '[]'::json) AS projects
      FROM users u
      JOIN roles r ON r.id = u.role_id
      ${whereClause}
      ORDER BY r.id ASC, u.name ASC
    `;

    const result = await query(sql, params);
    res.json({ users: result.rows });
  } catch (err) {
    console.error('[Users] List error:', err);
    res.status(500).json({ error: 'Failed to load users.' });
  }
});

// GET /api/users/invitations
router.get('/invitations', requireRole('super_admin', 'project_manager'), async (_req, res) => {
  try {
    const result = await query(`
      SELECT i.*, r.name AS role, r.label AS role_label, inviter.name AS invited_by_name
      FROM invitations i
      JOIN roles r ON r.id = i.role_id
      LEFT JOIN users inviter ON inviter.id = i.invited_by
      ORDER BY i.created_at DESC
    `);
    res.json({ invitations: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invitations.' });
  }
});

// POST /api/users/invite
router.post('/invite', requireRole('super_admin', 'project_manager'), async (req, res) => {
  try {
    const { email, name, role = 'freelancer', projectIds = [], specialty = '', skills = [] } = req.body || {};
    if (!email || !name) {
      return res.status(400).json({ error: 'Name and email are required.' });
    }

    // Only Super Admin can invite another Super Admin or Project Manager
    const targetRole = req.user.role === 'super_admin' ? role : 'freelancer';
    const roleRes = await query('SELECT id, name, label FROM roles WHERE name = $1', [targetRole]);
    if (roleRes.rowCount === 0) {
      return res.status(400).json({ error: 'Invalid role specified.' });
    }
    const roleRow = roleRes.rows[0];

    const existing = await query('SELECT id, status FROM users WHERE LOWER(email) = LOWER($1)', [String(email).trim()]);
    if (existing.rowCount > 0 && existing.rows[0].status === 'active') {
      return res.status(409).json({ error: 'An active user with this email already exists.' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const invRes = await query(
      `INSERT INTO invitations (email, name, role_id, project_ids, specialty, skills, token, invited_by, expires_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7,$8,$9)
       RETURNING *`,
      [
        String(email).trim().toLowerCase(),
        String(name).trim(),
        roleRow.id,
        JSON.stringify(Array.isArray(projectIds) ? projectIds : []),
        specialty,
        JSON.stringify(Array.isArray(skills) ? skills : []),
        token,
        req.user.id,
        expiresAt,
      ]
    );

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const inviteUrl = `${baseUrl}/?inviteToken=${token}`;
    await sendInvitationEmail({
      to: String(email).trim(),
      name: String(name).trim(),
      inviteUrl,
      inviterName: req.user.name,
      roleLabel: roleRow.label,
    });

    res.status(201).json({
      invitation: { ...invRes.rows[0], role: roleRow.name, role_label: roleRow.label },
      inviteUrl,
    });
  } catch (err) {
    console.error('[Users] Invite error:', err);
    res.status(500).json({ error: 'Failed to create invitation.' });
  }
});

// DELETE /api/users/invitations/:id
router.delete('/invitations/:id', requireRole('super_admin', 'project_manager'), async (req, res) => {
  try {
    await query(`UPDATE invitations SET status = 'revoked' WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Invitation revoked.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke invitation.' });
  }
});

// POST /api/users - Direct creation by Super Admin
router.post('/', requireRole('super_admin'), async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role = 'freelancer',
      specialty = '',
      hourly_rate = 0,
      skills = [],
      phone = '',
      location = '',
      projectIds = [],
    } = req.body || {};

    if (!name || !email || !password || String(password).length < 8) {
      return res.status(400).json({ error: 'Name, email, and password (min 8 chars) are required.' });
    }

    const user = await withTransaction(async (client) => {
      const roleRes = await client.query('SELECT id, name, label FROM roles WHERE name = $1', [role]);
      if (roleRes.rowCount === 0) {
        throw Object.assign(new Error('Invalid role.'), { statusCode: 400 });
      }
      const roleRow = roleRes.rows[0];
      const existing = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [String(email).trim()]);
      if (existing.rowCount > 0) {
        throw Object.assign(new Error('Email already in use.'), { statusCode: 409 });
      }

      const hash = await bcrypt.hash(String(password), 10);
      const baseUsername = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
      const username = `${baseUsername || 'user'}.${crypto.randomBytes(2).toString('hex')}`;

      const ins = await client.query(
        `INSERT INTO users (
          role_id, name, username, email, password_hash, phone, location,
          specialty, hourly_rate, skills, status, email_verified
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,'active',TRUE)
        RETURNING *`,
        [
          roleRow.id,
          String(name).trim(),
          username,
          String(email).trim().toLowerCase(),
          hash,
          phone || null,
          location || null,
          specialty || null,
          Number(hourly_rate || 0),
          JSON.stringify(Array.isArray(skills) ? skills : []),
        ]
      );

      for (const pid of Array.isArray(projectIds) ? projectIds : []) {
        await client.query(
          `INSERT INTO project_members (project_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [pid, ins.rows[0].id]
        );
      }

      return { ...ins.rows[0], role: roleRow.name, role_label: roleRow.label };
    });

    res.status(201).json({ user });
  } catch (err) {
    console.error('[Users] Create error:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to create user.' });
  }
});

// PATCH /api/users/:id
router.patch('/:id', requireRole('super_admin', 'project_manager'), async (req, res) => {
  try {
    const targetId = req.params.id;
    const { name, role, status, specialty, hourly_rate, skills, phone, location, bio, projectIds } = req.body || {};

    if (req.user.role === 'project_manager' && (role || status === 'deactivated')) {
      return res.status(403).json({ error: 'Only Super Admins can change roles or deactivate accounts.' });
    }

    const updatedUser = await withTransaction(async (client) => {
      let roleId = null;
      if (role) {
        const rRes = await client.query('SELECT id FROM roles WHERE name = $1', [role]);
        if (rRes.rowCount === 0) throw Object.assign(new Error('Invalid role.'), { statusCode: 400 });
        roleId = rRes.rows[0].id;
      }

      const upd = await client.query(
        `UPDATE users SET
          name = COALESCE($1, name),
          role_id = COALESCE($2, role_id),
          status = COALESCE($3, status),
          specialty = COALESCE($4, specialty),
          hourly_rate = COALESCE($5, hourly_rate),
          skills = COALESCE($6::jsonb, skills),
          phone = COALESCE($7, phone),
          location = COALESCE($8, location),
          bio = COALESCE($9, bio),
          updated_at = NOW()
         WHERE id = $10
         RETURNING id`,
        [
          name || null,
          roleId,
          status || null,
          specialty !== undefined ? specialty : null,
          hourly_rate !== undefined ? Number(hourly_rate) : null,
          Array.isArray(skills) ? JSON.stringify(skills) : null,
          phone !== undefined ? phone : null,
          location !== undefined ? location : null,
          bio !== undefined ? bio : null,
          targetId,
        ]
      );

      if (upd.rowCount === 0) {
        throw Object.assign(new Error('User not found.'), { statusCode: 404 });
      }

      if (Array.isArray(projectIds)) {
        await client.query('DELETE FROM project_members WHERE user_id = $1', [targetId]);
        for (const pid of projectIds) {
          await client.query(
            'INSERT INTO project_members (project_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [pid, targetId]
          );
        }
      }

      const full = await client.query(
        `SELECT u.id, u.name, u.username, u.email, u.avatar_url, u.phone, u.location,
                u.specialty, u.hourly_rate, u.skills, u.bio, u.status, u.email_verified,
                r.name AS role, r.label AS role_label
         FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
        [targetId]
      );
      return full.rows[0];
    });

    res.json({ user: updatedUser });
  } catch (err) {
    console.error('[Users] Update error:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to update user.' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', requireRole('super_admin'), async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own active admin account.' });
    }
    const del = await query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
    if (del.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ message: 'User permanently deleted.' });
  } catch (err) {
    console.error('[Users] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

export default router;
