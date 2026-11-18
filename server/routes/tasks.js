import express from 'express';
import { query, withTransaction } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import {
  canAccessTask,
  canEditTaskStructure,
  isPrivilegedRole,
} from '../services/permissions.js';
import {
  createNotification,
  logActivity,
  notifyTaskParticipants,
} from '../services/notifications.js';
import { emitToTask, emitWorkspace } from '../services/realtime.js';

const router = express.Router();
router.use(authenticate);

async function fetchFullTaskDetail(taskId) {
  const tRes = await query(
    `SELECT t.*, p.name AS project_name, p.code AS project_code, p.color AS project_color,
            c.name AS creator_name, c.avatar_url AS creator_avatar
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     LEFT JOIN users c ON c.id = t.creator_id
     WHERE t.id = $1`,
    [taskId]
  );
  if (tRes.rowCount === 0) return null;
  const task = tRes.rows[0];

  const [assignees, watchers, tags, subtasks, checklists, checklistItems, attachments, comments, timeEntries, activities] =
    await Promise.all([
      query(
        `SELECT u.id, u.name, u.username, u.email, u.avatar_url, u.specialty, r.name AS role
         FROM task_assignees ta
         JOIN users u ON u.id = ta.user_id
         JOIN roles r ON r.id = u.role_id
         WHERE ta.task_id = $1 ORDER BY u.name ASC`,
        [taskId]
      ),
      query(
        `SELECT u.id, u.name, u.username, u.avatar_url
         FROM task_watchers tw
         JOIN users u ON u.id = tw.user_id
         WHERE tw.task_id = $1 ORDER BY u.name ASC`,
        [taskId]
      ),
      query(
        `SELECT tg.id, tg.name, tg.color
         FROM task_tags tt
         JOIN tags tg ON tg.id = tt.tag_id
         WHERE tt.task_id = $1 ORDER BY tg.name ASC`,
        [taskId]
      ),
      query(
        `SELECT s.*, u.name AS assignee_name, u.avatar_url AS assignee_avatar
         FROM subtasks s
         LEFT JOIN users u ON u.id = s.assignee_id
         WHERE s.task_id = $1 ORDER BY s.position ASC, s.created_at ASC`,
        [taskId]
      ),
      query(`SELECT * FROM task_checklists WHERE task_id = $1 ORDER BY position ASC, created_at ASC`, [taskId]),
      query(
        `SELECT i.*
         FROM task_checklist_items i
         JOIN task_checklists cl ON cl.id = i.checklist_id
         WHERE cl.task_id = $1
         ORDER BY i.position ASC, i.created_at ASC`,
        [taskId]
      ),
      query(
        `SELECT a.*, u.name AS uploaded_by_name
         FROM task_attachments a
         LEFT JOIN users u ON u.id = a.uploaded_by
         WHERE a.task_id = $1 ORDER BY a.created_at DESC`,
        [taskId]
      ),
      query(
        `SELECT c.*, u.name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar, r.label AS author_role,
                COALESCE((
                  SELECT json_agg(json_build_object(
                    'id', ca.id,
                    'original_name', ca.original_name,
                    'mime_type', ca.mime_type,
                    'file_size', ca.file_size,
                    'created_at', ca.created_at
                  ))
                  FROM comment_attachments ca WHERE ca.comment_id = c.id
                ), '[]'::json) AS attachments
         FROM task_comments c
         JOIN users u ON u.id = c.user_id
         JOIN roles r ON r.id = u.role_id
         WHERE c.task_id = $1
         ORDER BY c.created_at ASC`,
        [taskId]
      ),
      query(
        `SELECT te.*, u.name AS user_name, u.avatar_url AS user_avatar
         FROM time_entries te
         JOIN users u ON u.id = te.user_id
         WHERE te.task_id = $1 ORDER BY te.logged_date DESC, te.created_at DESC`,
        [taskId]
      ),
      query(
        `SELECT al.*, u.name AS actor_name, u.avatar_url AS actor_avatar
         FROM activity_logs al
         LEFT JOIN users u ON u.id = al.user_id
         WHERE al.task_id = $1 ORDER BY al.created_at DESC LIMIT 60`,
        [taskId]
      ),
    ]);

  const itemsByChecklist = {};
  for (const item of checklistItems.rows) {
    if (!itemsByChecklist[item.checklist_id]) itemsByChecklist[item.checklist_id] = [];
    itemsByChecklist[item.checklist_id].push(item);
  }

  return {
    ...task,
    estimated_hours: Number(task.estimated_hours || 0),
    actual_hours: Number(task.actual_hours || 0),
    assignees: assignees.rows,
    watchers: watchers.rows,
    tags: tags.rows,
    subtasks: subtasks.rows,
    checklists: checklists.rows.map((cl) => ({
      ...cl,
      items: itemsByChecklist[cl.id] || [],
    })),
    attachments: attachments.rows,
    comments: comments.rows,
    time_entries: timeEntries.rows.map((e) => ({ ...e, hours: Number(e.hours) })),
    activities: activities.rows,
  };
}

// GET /api/tasks/tags/all
router.get('/tags/all', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM tags ORDER BY name ASC');
    res.json({ tags: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load tags.' });
  }
});

// GET /api/tasks
router.get('/', async (req, res) => {
  try {
    const {
      view = 'all',
      projectId,
      assigneeId,
      status,
      priority,
      tag,
      search,
      includeArchived = 'false',
      sortBy = 'updated_at',
    } = req.query;

    const params = [];
    const conditions = [];

    if (includeArchived !== 'true') {
      conditions.push('t.is_archived = FALSE');
    }

    if (!isPrivilegedRole(req.user.role) || view === 'my') {
      params.push(req.user.id);
      if (!isPrivilegedRole(req.user.role)) {
        conditions.push(`(
          t.creator_id = $${params.length}
          OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = $${params.length})
          OR EXISTS (SELECT 1 FROM task_watchers tw WHERE tw.task_id = t.id AND tw.user_id = $${params.length})
        )`);
      } else {
        conditions.push(`EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = $${params.length})`);
      }
    }

    if (projectId && projectId !== 'all') {
      params.push(projectId);
      conditions.push(`t.project_id = $${params.length}`);
    }
    if (assigneeId && assigneeId !== 'all') {
      params.push(assigneeId);
      conditions.push(`EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = $${params.length})`);
    }
    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }
    if (priority && priority !== 'all') {
      params.push(priority);
      conditions.push(`t.priority = $${params.length}`);
    }
    if (tag) {
      params.push(tag);
      conditions.push(`EXISTS (SELECT 1 FROM task_tags tt JOIN tags tg ON tg.id = tt.tag_id WHERE tt.task_id = t.id AND tg.name = $${params.length})`);
    }
    if (search) {
      params.push(`%${String(search).trim()}%`);
      conditions.push(`(t.title ILIKE $${params.length} OR t.task_code ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
    }

    const sortColumns = {
      updated_at: 't.updated_at DESC',
      due_date: 't.due_date ASC NULLS LAST',
      priority: "CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END ASC",
      created_at: 't.created_at DESC',
    };
    const orderClause = sortColumns[sortBy] || sortColumns.updated_at;
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        t.*,
        p.name AS project_name,
        p.code AS project_code,
        p.color AS project_color,
        c.name AS creator_name,
        COALESCE((
          SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'username', u.username, 'avatar_url', u.avatar_url))
          FROM task_assignees ta
          JOIN users u ON u.id = ta.user_id
          WHERE ta.task_id = t.id
        ), '[]'::json) AS assignees,
        COALESCE((
          SELECT json_agg(json_build_object('id', tg.id, 'name', tg.name, 'color', tg.color))
          FROM task_tags tt
          JOIN tags tg ON tg.id = tt.tag_id
          WHERE tt.task_id = t.id
        ), '[]'::json) AS tags,
        (SELECT COUNT(*)::int FROM task_comments tc WHERE tc.task_id = t.id) AS comment_count,
        (SELECT COUNT(*)::int FROM task_attachments tat WHERE tat.task_id = t.id) AS attachment_count,
        (SELECT COUNT(*)::int FROM subtasks st WHERE st.task_id = t.id) AS subtask_count,
        (SELECT COUNT(*)::int FROM subtasks st WHERE st.task_id = t.id AND st.is_completed = TRUE) AS subtask_completed_count
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN users c ON c.id = t.creator_id
      ${whereClause}
      ORDER BY ${orderClause}
    `;

    const result = await query(sql, params);
    const tasks = result.rows.map((row) => ({
      ...row,
      estimated_hours: Number(row.estimated_hours || 0),
      actual_hours: Number(row.actual_hours || 0),
    }));

    res.json({ tasks });
  } catch (err) {
    console.error('[Tasks] List error:', err);
    res.status(500).json({ error: 'Failed to load tasks.' });
  }
});

// GET /api/tasks/:id
router.get('/:id', async (req, res) => {
  try {
    const allowed = await canAccessTask(req.user, req.params.id);
    if (!allowed) {
      return res.status(403).json({ error: 'You do not have permission to view this task.' });
    }
    const detail = await fetchFullTaskDetail(req.params.id);
    if (!detail) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    res.json({ task: detail });
  } catch (err) {
    console.error('[Tasks] Detail error:', err);
    res.status(500).json({ error: 'Failed to fetch task details.' });
  }
});

// POST /api/tasks
router.post('/', async (req, res) => {
  try {
    if (!canEditTaskStructure(req.user)) {
      return res.status(403).json({ error: 'Only admins and project managers can create tasks.' });
    }

    const {
      project_id,
      title,
      description = '',
      status = 'open',
      priority = 'normal',
      start_date = null,
      due_date = null,
      estimated_hours = 0,
      assigneeIds = [],
      tags = [],
    } = req.body || {};

    if (!project_id || !title || !String(title).trim()) {
      return res.status(400).json({ error: 'Project and task title are required.' });
    }

    const createdTask = await withTransaction(async (client) => {
      const seqRes = await client.query("SELECT nextval('task_code_seq') AS seq");
      const taskCode = `TUC-${seqRes.rows[0].seq}`;

      const ins = await client.query(
        `INSERT INTO tasks (
          task_code, project_id, creator_id, title, description, status, priority,
          assigned_date, start_date, due_date, estimated_hours
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE,$8,$9,$10)
        RETURNING *`,
        [
          taskCode,
          project_id,
          req.user.id,
          String(title).trim(),
          description,
          status,
          priority,
          start_date || null,
          due_date || null,
          Number(estimated_hours || 0),
        ]
      );
      const task = ins.rows[0];

      // Creator watches task
      await client.query(`INSERT INTO task_watchers (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
        task.id,
        req.user.id,
      ]);

      // Assignees
      for (const uid of Array.isArray(assigneeIds) ? assigneeIds : []) {
        await client.query(
          `INSERT INTO task_assignees (task_id, user_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [task.id, uid, req.user.id]
        );
        await client.query(`INSERT INTO task_watchers (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
          task.id,
          uid,
        ]);
        await client.query(
          `INSERT INTO project_members (project_id, user_id, member_role) VALUES ($1,$2,'contributor') ON CONFLICT DO NOTHING`,
          [project_id, uid]
        );
      }

      // Tags
      for (const rawTag of Array.isArray(tags) ? tags : []) {
        const tagName = String(rawTag).trim().toLowerCase();
        if (!tagName) continue;
        const tRes = await client.query(
          `INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [tagName]
        );
        await client.query(`INSERT INTO task_tags (task_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
          task.id,
          tRes.rows[0].id,
        ]);
      }

      return task;
    });

    await logActivity({
      projectId: createdTask.project_id,
      taskId: createdTask.id,
      userId: req.user.id,
      action: 'task_created',
      details: { task_code: createdTask.task_code, title: createdTask.title },
    });

    for (const uid of Array.isArray(assigneeIds) ? assigneeIds : []) {
      await createNotification({
        userId: uid,
        actorId: req.user.id,
        taskId: createdTask.id,
        projectId: createdTask.project_id,
        type: 'task_assigned',
        title: `Assigned ${createdTask.task_code}: ${createdTask.title}`,
        message: `${req.user.name} assigned you a new task.`,
        link: `/tasks/${createdTask.id}`,
        sendEmailToo: true,
      });
    }

    const fullTask = await fetchFullTaskDetail(createdTask.id);
    emitWorkspace('task:created', fullTask);
    res.status(201).json({ task: fullTask });
  } catch (err) {
    console.error('[Tasks] Create error:', err);
    res.status(500).json({ error: 'Failed to create task.' });
  }
});

// PATCH /api/tasks/:id
router.patch('/:id', async (req, res) => {
  try {
    const taskId = req.params.id;
    const allowed = await canAccessTask(req.user, taskId);
    if (!allowed) {
      return res.status(403).json({ error: 'You do not have access to this task.' });
    }

    const existingRes = await query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (existingRes.rowCount === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    const prev = existingRes.rows[0];
    const privileged = canEditTaskStructure(req.user);

    const {
      title,
      description,
      status,
      priority,
      start_date,
      due_date,
      estimated_hours,
      is_archived,
      assigneeIds,
      tags,
    } = req.body || {};

    if (!privileged && (title !== undefined || priority !== undefined || due_date !== undefined || assigneeIds !== undefined || is_archived !== undefined)) {
      return res.status(403).json({ error: 'Freelancers can update task status, progress, comments, and deliverables.' });
    }

    await withTransaction(async (client) => {
      const completedAt =
        status === 'completed' && prev.status !== 'completed'
          ? new Date().toISOString()
          : status && status !== 'completed'
            ? null
            : prev.completed_at;

      await client.query(
        `UPDATE tasks SET
          title = COALESCE($1, title),
          description = COALESCE($2, description),
          status = COALESCE($3, status),
          priority = COALESCE($4, priority),
          start_date = COALESCE($5, start_date),
          due_date = COALESCE($6, due_date),
          estimated_hours = COALESCE($7, estimated_hours),
          is_archived = COALESCE($8, is_archived),
          completed_at = $9,
          updated_at = NOW()
         WHERE id = $10`,
        [
          title ? String(title).trim() : null,
          description !== undefined ? description : null,
          status || null,
          priority || null,
          start_date !== undefined ? start_date || null : null,
          due_date !== undefined ? due_date || null : null,
          estimated_hours !== undefined ? Number(estimated_hours) : null,
          is_archived !== undefined ? Boolean(is_archived) : null,
          completedAt,
          taskId,
        ]
      );

      if (Array.isArray(assigneeIds) && privileged) {
        const prevAssigneesRes = await client.query('SELECT user_id FROM task_assignees WHERE task_id = $1', [taskId]);
        const prevSet = new Set(prevAssigneesRes.rows.map((r) => r.user_id));

        await client.query('DELETE FROM task_assignees WHERE task_id = $1', [taskId]);
        for (const uid of assigneeIds) {
          await client.query(
            `INSERT INTO task_assignees (task_id, user_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            [taskId, uid, req.user.id]
          );
          await client.query(`INSERT INTO task_watchers (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
            taskId,
            uid,
          ]);
          await client.query(
            `INSERT INTO project_members (project_id, user_id, member_role) VALUES ($1,$2,'contributor') ON CONFLICT DO NOTHING`,
            [prev.project_id, uid]
          );

          if (!prevSet.has(uid)) {
            await createNotification({
              userId: uid,
              actorId: req.user.id,
              taskId,
              projectId: prev.project_id,
              type: 'task_reassigned',
              title: `Assigned to ${prev.task_code}: ${title || prev.title}`,
              message: `${req.user.name} assigned this task to you.`,
              link: `/tasks/${taskId}`,
              sendEmailToo: true,
            });
          }
        }
        await logActivity({
          projectId: prev.project_id,
          taskId,
          userId: req.user.id,
          action: 'assignee_changed',
          details: { count: assigneeIds.length },
        });
      }

      if (Array.isArray(tags) && privileged) {
        await client.query('DELETE FROM task_tags WHERE task_id = $1', [taskId]);
        for (const rawTag of tags) {
          const tagName = String(rawTag).trim().toLowerCase();
          if (!tagName) continue;
          const tRes = await client.query(
            `INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
            [tagName]
          );
          await client.query(`INSERT INTO task_tags (task_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
            taskId,
            tRes.rows[0].id,
          ]);
        }
      }
    });

    // Record granular activity logs and notifications
    if (status && status !== prev.status) {
      await logActivity({
        projectId: prev.project_id,
        taskId,
        userId: req.user.id,
        action: status === 'completed' ? 'task_completed' : 'status_changed',
        details: { from: prev.status, to: status },
      });
      await notifyTaskParticipants({
        taskId,
        actorId: req.user.id,
        type: status === 'revision_required' ? 'revision_required' : 'status_changed',
        title: `${prev.task_code} moved to ${status.replace('_', ' ')}`,
        message: `${req.user.name} changed status of "${prev.title}" from ${prev.status} to ${status}.`,
        sendEmailToo: status === 'revision_required' || status === 'under_review',
      });
    }

    if (priority && priority !== prev.priority) {
      await logActivity({
        projectId: prev.project_id,
        taskId,
        userId: req.user.id,
        action: 'priority_changed',
        details: { from: prev.priority, to: priority },
      });
    }

    if (due_date !== undefined && String(due_date || '') !== String(prev.due_date ? new Date(prev.due_date).toISOString() : '')) {
      await logActivity({
        projectId: prev.project_id,
        taskId,
        userId: req.user.id,
        action: 'deadline_changed',
        details: { to: due_date },
      });
    }

    const updatedDetail = await fetchFullTaskDetail(taskId);
    emitToTask(taskId, 'task:updated', updatedDetail);
    emitWorkspace('task:updated', updatedDetail);

    res.json({ task: updatedDetail });
  } catch (err) {
    console.error('[Tasks] Update error:', err);
    res.status(500).json({ error: 'Failed to update task.' });
  }
});

// POST /api/tasks/:id/duplicate
router.post('/:id/duplicate', async (req, res) => {
  try {
    if (!canEditTaskStructure(req.user)) {
      return res.status(403).json({ error: 'Insufficient permissions to duplicate tasks.' });
    }
    const source = await fetchFullTaskDetail(req.params.id);
    if (!source) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const newTask = await withTransaction(async (client) => {
      const seqRes = await client.query("SELECT nextval('task_code_seq') AS seq");
      const taskCode = `TUC-${seqRes.rows[0].seq}`;

      const ins = await client.query(
        `INSERT INTO tasks (
          task_code, project_id, creator_id, title, description, status, priority,
          assigned_date, start_date, due_date, estimated_hours
        ) VALUES ($1,$2,$3,$4,$5,'open',$6,CURRENT_DATE,$7,$8,$9)
        RETURNING *`,
        [
          taskCode,
          source.project_id,
          req.user.id,
          `${source.title} (Copy)`,
          source.description,
          source.priority,
          source.start_date,
          source.due_date,
          source.estimated_hours,
        ]
      );
      const created = ins.rows[0];

      for (const a of source.assignees) {
        await client.query(`INSERT INTO task_assignees (task_id, user_id, assigned_by) VALUES ($1,$2,$3)`, [
          created.id,
          a.id,
          req.user.id,
        ]);
      }
      for (const tg of source.tags) {
        await client.query(`INSERT INTO task_tags (task_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
          created.id,
          tg.id,
        ]);
      }
      for (const st of source.subtasks) {
        await client.query(`INSERT INTO subtasks (task_id, title, is_completed, position) VALUES ($1,$2,FALSE,$3)`, [
          created.id,
          st.title,
          st.position,
        ]);
      }
      return created;
    });

    const fullTask = await fetchFullTaskDetail(newTask.id);
    emitWorkspace('task:created', fullTask);
    res.status(201).json({ task: fullTask });
  } catch (err) {
    console.error('[Tasks] Duplicate error:', err);
    res.status(500).json({ error: 'Failed to duplicate task.' });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!canEditTaskStructure(req.user)) {
      return res.status(403).json({ error: 'Only admins and project managers can delete tasks.' });
    }
    const del = await query('DELETE FROM tasks WHERE id = $1 RETURNING id', [req.params.id]);
    if (del.rowCount === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    emitWorkspace('task:deleted', { id: req.params.id });
    res.json({ message: 'Task deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task.' });
  }
});

// Subtasks
router.post('/:id/subtasks', async (req, res) => {
  try {
    const allowed = await canAccessTask(req.user, req.params.id);
    if (!allowed) return res.status(403).json({ error: 'Access denied.' });
    const { title, assignee_id = null, due_date = null } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Subtask title required.' });

    const ins = await query(
      `INSERT INTO subtasks (task_id, title, assignee_id, due_date) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, String(title).trim(), assignee_id || null, due_date || null]
    );
    const updated = await fetchFullTaskDetail(req.params.id);
    emitToTask(req.params.id, 'task:updated', updated);
    res.status(201).json({ subtask: ins.rows[0], task: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add subtask.' });
  }
});

router.patch('/:id/subtasks/:subtaskId', async (req, res) => {
  try {
    const allowed = await canAccessTask(req.user, req.params.id);
    if (!allowed) return res.status(403).json({ error: 'Access denied.' });
    const { is_completed, title } = req.body || {};
    await query(
      `UPDATE subtasks SET
        is_completed = COALESCE($1, is_completed),
        title = COALESCE($2, title),
        updated_at = NOW()
       WHERE id = $3 AND task_id = $4`,
      [is_completed !== undefined ? Boolean(is_completed) : null, title || null, req.params.subtaskId, req.params.id]
    );
    const updated = await fetchFullTaskDetail(req.params.id);
    emitToTask(req.params.id, 'task:updated', updated);
    res.json({ task: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update subtask.' });
  }
});

router.delete('/:id/subtasks/:subtaskId', async (req, res) => {
  try {
    const allowed = await canAccessTask(req.user, req.params.id);
    if (!allowed) return res.status(403).json({ error: 'Access denied.' });
    await query('DELETE FROM subtasks WHERE id = $1 AND task_id = $2', [req.params.subtaskId, req.params.id]);
    const updated = await fetchFullTaskDetail(req.params.id);
    emitToTask(req.params.id, 'task:updated', updated);
    res.json({ task: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete subtask.' });
  }
});

// Checklists
router.post('/:id/checklists', async (req, res) => {
  try {
    const allowed = await canAccessTask(req.user, req.params.id);
    if (!allowed) return res.status(403).json({ error: 'Access denied.' });
    const { title } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Checklist title required.' });
    await query('INSERT INTO task_checklists (task_id, title) VALUES ($1,$2)', [req.params.id, String(title).trim()]);
    const updated = await fetchFullTaskDetail(req.params.id);
    emitToTask(req.params.id, 'task:updated', updated);
    res.status(201).json({ task: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add checklist.' });
  }
});

router.post('/:id/checklists/:checklistId/items', async (req, res) => {
  try {
    const allowed = await canAccessTask(req.user, req.params.id);
    if (!allowed) return res.status(403).json({ error: 'Access denied.' });
    const { label } = req.body || {};
    if (!label || !String(label).trim()) return res.status(400).json({ error: 'Item label required.' });
    await query('INSERT INTO task_checklist_items (checklist_id, label) VALUES ($1,$2)', [
      req.params.checklistId,
      String(label).trim(),
    ]);
    const updated = await fetchFullTaskDetail(req.params.id);
    emitToTask(req.params.id, 'task:updated', updated);
    res.status(201).json({ task: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add checklist item.' });
  }
});

router.patch('/:id/checklist-items/:itemId', async (req, res) => {
  try {
    const allowed = await canAccessTask(req.user, req.params.id);
    if (!allowed) return res.status(403).json({ error: 'Access denied.' });
    const { is_checked, label } = req.body || {};
    await query(
      `UPDATE task_checklist_items SET
        is_checked = COALESCE($1, is_checked),
        label = COALESCE($2, label),
        updated_at = NOW()
       WHERE id = $3`,
      [is_checked !== undefined ? Boolean(is_checked) : null, label || null, req.params.itemId]
    );
    const updated = await fetchFullTaskDetail(req.params.id);
    emitToTask(req.params.id, 'task:updated', updated);
    res.json({ task: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update checklist item.' });
  }
});

router.delete('/:id/checklist-items/:itemId', async (req, res) => {
  try {
    const allowed = await canAccessTask(req.user, req.params.id);
    if (!allowed) return res.status(403).json({ error: 'Access denied.' });
    await query('DELETE FROM task_checklist_items WHERE id = $1', [req.params.itemId]);
    const updated = await fetchFullTaskDetail(req.params.id);
    emitToTask(req.params.id, 'task:updated', updated);
    res.json({ task: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete checklist item.' });
  }
});

// Watchers
router.post('/:id/watchers', async (req, res) => {
  try {
    const allowed = await canAccessTask(req.user, req.params.id);
    if (!allowed) return res.status(403).json({ error: 'Access denied.' });
    const targetUserId = canEditTaskStructure(req.user) && req.body?.userId ? req.body.userId : req.user.id;
    await query(`INSERT INTO task_watchers (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
      req.params.id,
      targetUserId,
    ]);
    const updated = await fetchFullTaskDetail(req.params.id);
    emitToTask(req.params.id, 'task:updated', updated);
    res.json({ task: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add watcher.' });
  }
});

router.delete('/:id/watchers/:userId', async (req, res) => {
  try {
    const allowed = await canAccessTask(req.user, req.params.id);
    if (!allowed) return res.status(403).json({ error: 'Access denied.' });
    if (!canEditTaskStructure(req.user) && req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'You can only remove yourself as watcher.' });
    }
    await query('DELETE FROM task_watchers WHERE task_id = $1 AND user_id = $2', [req.params.id, req.params.userId]);
    const updated = await fetchFullTaskDetail(req.params.id);
    emitToTask(req.params.id, 'task:updated', updated);
    res.json({ task: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove watcher.' });
  }
});

// Time Entries
router.post('/:id/time-entries', async (req, res) => {
  try {
    const allowed = await canAccessTask(req.user, req.params.id);
    if (!allowed) return res.status(403).json({ error: 'Access denied.' });

    const { hours, description = '', logged_date } = req.body || {};
    const numHours = Number(hours);
    if (!Number.isFinite(numHours) || numHours <= 0 || numHours > 240) {
      return res.status(400).json({ error: 'Enter valid hours greater than 0.' });
    }

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO time_entries (task_id, user_id, hours, description, logged_date)
         VALUES ($1,$2,$3,$4,COALESCE($5::date, CURRENT_DATE))`,
        [req.params.id, req.user.id, numHours, description, logged_date || null]
      );
      await client.query(
        `UPDATE tasks SET
          actual_hours = COALESCE((SELECT SUM(hours) FROM time_entries WHERE task_id = $1), 0),
          updated_at = NOW()
         WHERE id = $1`,
        [req.params.id]
      );
    });

    const updated = await fetchFullTaskDetail(req.params.id);
    emitToTask(req.params.id, 'task:updated', updated);
    emitWorkspace('task:updated', updated);
    res.status(201).json({ task: updated });
  } catch (err) {
    console.error('[Tasks] Time entry error:', err);
    res.status(500).json({ error: 'Failed to log time entry.' });
  }
});

export { fetchFullTaskDetail };
export default router;
