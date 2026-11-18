import express from 'express';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { canEditTaskStructure, isPrivilegedRole } from '../services/permissions.js';
import { logActivity } from '../services/notifications.js';
import { emitWorkspace } from '../services/realtime.js';

const router = express.Router();
router.use(authenticate);

// GET /api/calendar
router.get('/', async (req, res) => {
  try {
    const { projectId, freelancerId, status } = req.query;
    const params = [];
    const conditions = ['t.is_archived = FALSE', 't.due_date IS NOT NULL'];

    if (!isPrivilegedRole(req.user.role)) {
      params.push(req.user.id);
      conditions.push(`(
        t.creator_id = $${params.length}
        OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = $${params.length})
        OR EXISTS (SELECT 1 FROM task_watchers tw WHERE tw.task_id = t.id AND tw.user_id = $${params.length})
      )`);
    }

    if (projectId && projectId !== 'all') {
      params.push(projectId);
      conditions.push(`t.project_id = $${params.length}`);
    }
    if (freelancerId && freelancerId !== 'all') {
      params.push(freelancerId);
      conditions.push(`EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = $${params.length})`);
    }
    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }

    const sql = `
      SELECT t.id, t.task_code, t.title, t.status, t.priority, t.start_date, t.due_date,
             p.id AS project_id, p.name AS project_name, p.color AS project_color,
             COALESCE((
               SELECT json_agg(json_build_object('id', u.id, 'name', u.name))
               FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = t.id
             ), '[]'::json) AS assignees
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.due_date ASC
    `;

    const result = await query(sql, params);
    const now = Date.now();
    const events = result.rows.map((row) => {
      const isOverdue =
        row.status !== 'completed' &&
        row.status !== 'cancelled' &&
        new Date(row.due_date).getTime() < now;

      return {
        id: row.id,
        title: `${row.task_code} · ${row.title}`,
        start: row.due_date,
        allDay: true,
        extendedProps: {
          ...row,
          isOverdue,
        },
      };
    });

    res.json({ events });
  } catch (err) {
    console.error('[Calendar] Error:', err);
    res.status(500).json({ error: 'Failed to load calendar tasks.' });
  }
});

// PATCH /api/calendar/:taskId/reschedule
router.patch('/:taskId/reschedule', async (req, res) => {
  try {
    if (!canEditTaskStructure(req.user)) {
      return res.status(403).json({ error: 'Only admins and project managers can reschedule deadlines.' });
    }
    const { due_date } = req.body || {};
    if (!due_date) {
      return res.status(400).json({ error: 'New due_date is required.' });
    }

    const upd = await query(
      `UPDATE tasks SET due_date = $1, updated_at = NOW() WHERE id = $2 RETURNING id, project_id, task_code, due_date`,
      [due_date, req.params.taskId]
    );
    if (upd.rowCount === 0) return res.status(404).json({ error: 'Task not found.' });

    await logActivity({
      projectId: upd.rows[0].project_id,
      taskId: upd.rows[0].id,
      userId: req.user.id,
      action: 'deadline_changed',
      details: { to: due_date },
    });

    emitWorkspace('task:updated', { id: upd.rows[0].id, due_date });
    res.json({ task: upd.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reschedule task.' });
  }
});

export default router;
