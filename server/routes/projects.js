import express from 'express';
import { query, withTransaction } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { canAccessProject, canManageProject, isPrivilegedRole } from '../services/permissions.js';
import { logActivity } from '../services/notifications.js';

const router = express.Router();
router.use(authenticate);

// GET /api/projects
router.get('/', async (req, res) => {
  try {
    const { status, search } = req.query;
    const params = [];
    const conditions = [];

    if (!isPrivilegedRole(req.user.role)) {
      params.push(req.user.id);
      conditions.push(`(
        EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $${params.length})
        OR EXISTS (
          SELECT 1 FROM tasks t
          JOIN task_assignees ta ON ta.task_id = t.id
          WHERE t.project_id = p.id AND ta.user_id = $${params.length}
        )
      )`);
    }

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${String(search).trim()}%`);
      conditions.push(`(p.name ILIKE $${params.length} OR p.code ILIKE $${params.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const taskScopeFilter = isPrivilegedRole(req.user.role)
      ? ''
      : `AND (EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = '${req.user.id}') OR EXISTS (SELECT 1 FROM task_watchers tw WHERE tw.task_id = t.id AND tw.user_id = '${req.user.id}'))`;

    const sql = `
      SELECT
        p.*,
        m.name AS manager_name,
        m.avatar_url AS manager_avatar,
        COALESCE((
          SELECT COUNT(*)::int FROM tasks t
          WHERE t.project_id = p.id AND t.is_archived = FALSE ${taskScopeFilter}
        ), 0) AS total_tasks,
        COALESCE((
          SELECT COUNT(*)::int FROM tasks t
          WHERE t.project_id = p.id AND t.is_archived = FALSE AND t.status = 'completed' ${taskScopeFilter}
        ), 0) AS completed_tasks,
        COALESCE((
          SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'avatar_url', u.avatar_url, 'role', r.name))
          FROM project_members pm
          JOIN users u ON u.id = pm.user_id
          JOIN roles r ON r.id = u.role_id
          WHERE pm.project_id = p.id
        ), '[]'::json) AS members
      FROM projects p
      LEFT JOIN users m ON m.id = p.manager_id
      ${whereClause}
      ORDER BY p.created_at DESC
    `;

    const result = await query(sql, params);
    const projects = result.rows.map((p) => ({
      ...p,
      progress: p.total_tasks > 0 ? Math.round((p.completed_tasks / p.total_tasks) * 100) : 0,
    }));

    res.json({ projects });
  } catch (err) {
    console.error('[Projects] List error:', err);
    res.status(500).json({ error: 'Failed to load projects.' });
  }
});

// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  try {
    const projectId = req.params.id;
    const allowed = await canAccessProject(req.user, projectId);
    if (!allowed) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    const pRes = await query(
      `SELECT p.*, m.name AS manager_name, m.email AS manager_email, m.avatar_url AS manager_avatar
       FROM projects p
       LEFT JOIN users m ON m.id = p.manager_id
       WHERE p.id = $1`,
      [projectId]
    );
    if (pRes.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const membersRes = await query(
      `SELECT u.id, u.name, u.username, u.email, u.avatar_url, u.specialty, r.name AS role, r.label AS role_label, pm.member_role
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       JOIN roles r ON r.id = u.role_id
       WHERE pm.project_id = $1
       ORDER BY u.name ASC`,
      [projectId]
    );

    const activityRes = await query(
      `SELECT al.*, u.name AS actor_name, u.avatar_url AS actor_avatar
       FROM activity_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.project_id = $1
       ORDER BY al.created_at DESC
       LIMIT 40`,
      [projectId]
    );

    res.json({
      project: pRes.rows[0],
      members: membersRes.rows,
      activities: activityRes.rows,
    });
  } catch (err) {
    console.error('[Projects] Detail error:', err);
    res.status(500).json({ error: 'Failed to load project details.' });
  }
});

// POST /api/projects
router.post('/', requireRole('super_admin', 'project_manager'), async (req, res) => {
  try {
    const {
      name,
      description = '',
      manager_id,
      status = 'active',
      start_date = null,
      end_date = null,
      color = '#2563EB',
      memberIds = [],
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Project name is required.' });
    }

    const project = await withTransaction(async (client) => {
      const countRes = await client.query('SELECT COUNT(*)::int AS c FROM projects');
      const code = `PRJ-${201 + countRes.rows[0].c + Math.floor(Math.random() * 50)}`;
      const mgrId = manager_id || req.user.id;

      const ins = await client.query(
        `INSERT INTO projects (code, name, description, manager_id, status, start_date, end_date, color, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [code, String(name).trim(), description, mgrId, status, start_date || null, end_date || null, color, req.user.id]
      );
      const proj = ins.rows[0];

      const uniqueMembers = new Set([mgrId, req.user.id, ...(Array.isArray(memberIds) ? memberIds : [])]);
      for (const uid of uniqueMembers) {
        if (uid) {
          await client.query(
            `INSERT INTO project_members (project_id, user_id, member_role)
             VALUES ($1,$2,$3) ON CONFLICT (project_id, user_id) DO NOTHING`,
            [proj.id, uid, uid === mgrId ? 'manager' : 'contributor']
          );
        }
      }

      return proj;
    });

    await logActivity({
      projectId: project.id,
      userId: req.user.id,
      action: 'project_created',
      details: { name: project.name, code: project.code },
    });

    res.status(201).json({ project });
  } catch (err) {
    console.error('[Projects] Create error:', err);
    res.status(500).json({ error: 'Failed to create project.' });
  }
});

// PATCH /api/projects/:id
router.patch('/:id', async (req, res) => {
  try {
    const projectId = req.params.id;
    const allowed = await canManageProject(req.user, projectId);
    if (!allowed) {
      return res.status(403).json({ error: 'Only admins or project managers can update projects.' });
    }

    const { name, description, manager_id, status, start_date, end_date, color, memberIds } = req.body || {};

    const project = await withTransaction(async (client) => {
      const upd = await client.query(
        `UPDATE projects SET
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          manager_id = COALESCE($3, manager_id),
          status = COALESCE($4, status),
          start_date = COALESCE($5, start_date),
          end_date = COALESCE($6, end_date),
          color = COALESCE($7, color),
          updated_at = NOW()
         WHERE id = $8
         RETURNING *`,
        [
          name ? String(name).trim() : null,
          description !== undefined ? description : null,
          manager_id || null,
          status || null,
          start_date !== undefined ? start_date || null : null,
          end_date !== undefined ? end_date || null : null,
          color || null,
          projectId,
        ]
      );
      if (upd.rowCount === 0) {
        throw Object.assign(new Error('Project not found.'), { statusCode: 404 });
      }

      if (Array.isArray(memberIds)) {
        await client.query('DELETE FROM project_members WHERE project_id = $1', [projectId]);
        const uniqueMembers = new Set([upd.rows[0].manager_id, ...memberIds].filter(Boolean));
        for (const uid of uniqueMembers) {
          await client.query(
            `INSERT INTO project_members (project_id, user_id, member_role)
             VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            [projectId, uid, uid === upd.rows[0].manager_id ? 'manager' : 'contributor']
          );
        }
      }

      return upd.rows[0];
    });

    await logActivity({
      projectId: project.id,
      userId: req.user.id,
      action: 'project_updated',
      details: { name: project.name, status: project.status },
    });

    res.json({ project });
  } catch (err) {
    console.error('[Projects] Update error:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to update project.' });
  }
});

// DELETE /api/projects/:id
router.delete('/:id', requireRole('super_admin', 'project_manager'), async (req, res) => {
  try {
    const del = await query('DELETE FROM projects WHERE id = $1 RETURNING id', [req.params.id]);
    if (del.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found.' });
    }
    res.json({ message: 'Project deleted.' });
  } catch (err) {
    console.error('[Projects] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete project.' });
  }
});

export default router;
