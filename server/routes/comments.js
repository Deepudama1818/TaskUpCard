import express from 'express';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { canAccessTask, isPrivilegedRole } from '../services/permissions.js';
import {
  createNotification,
  logActivity,
  notifyTaskParticipants,
} from '../services/notifications.js';
import { emitToTask } from '../services/realtime.js';
import { saveUploadedFile, uploadMiddleware } from '../services/storage.js';

const router = express.Router();
router.use(authenticate);

function extractMentions(text) {
  const matches = String(text || '').match(/@([a-zA-Z0-9._-]+)/g) || [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

// POST /api/comments/:taskId
router.post('/:taskId', uploadMiddleware.array('files', 5), async (req, res) => {
  try {
    const { taskId } = req.params;
    const allowed = await canAccessTask(req.user, taskId);
    if (!allowed) {
      return res.status(403).json({ error: 'You do not have permission to comment on this task.' });
    }

    const { body, parent_id = null } = req.body || {};
    const files = req.files || [];
    if ((!body || !String(body).trim()) && files.length === 0) {
      return res.status(400).json({ error: 'Comment text or attachment is required.' });
    }

    const cleanBody = String(body || '').trim() || 'Attached deliverable file(s).';
    const mentions = extractMentions(cleanBody);

    const ins = await query(
      `INSERT INTO task_comments (task_id, user_id, parent_id, body, mentions)
       VALUES ($1,$2,$3,$4,$5::jsonb)
       RETURNING *`,
      [taskId, req.user.id, parent_id || null, cleanBody, JSON.stringify(mentions)]
    );
    const comment = ins.rows[0];

    const attachments = [];
    for (const f of files) {
      const stored = await saveUploadedFile(f, `comments/${taskId}`);
      const attRes = await query(
        `INSERT INTO comment_attachments (
          comment_id, uploaded_by, original_name, stored_name, mime_type, file_size, storage_provider, storage_key
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id, original_name, mime_type, file_size, created_at`,
        [
          comment.id,
          req.user.id,
          f.originalname,
          stored.storedName,
          f.mimetype,
          f.size,
          stored.storageProvider,
          stored.storageKey,
        ]
      );
      attachments.push(attRes.rows[0]);
    }

    const taskMeta = await query('SELECT project_id, task_code, title FROM tasks WHERE id = $1', [taskId]);
    const taskInfo = taskMeta.rows[0];

    await logActivity({
      projectId: taskInfo?.project_id,
      taskId,
      userId: req.user.id,
      action: 'comment_added',
      details: { snippet: cleanBody.slice(0, 100) },
    });

    // Notify mentioned users specifically
    const notifiedMentionedIds = [];
    if (mentions.length > 0) {
      const mRes = await query(
        `SELECT id, username FROM users WHERE LOWER(username) = ANY($1::text[]) AND status = 'active'`,
        [mentions]
      );
      for (const mu of mRes.rows) {
        notifiedMentionedIds.push(mu.id);
        await createNotification({
          userId: mu.id,
          actorId: req.user.id,
          taskId,
          projectId: taskInfo?.project_id,
          type: 'mention',
          title: `${req.user.name} mentioned you on ${taskInfo?.task_code || 'a task'}`,
          message: cleanBody.slice(0, 160),
          link: `/tasks/${taskId}`,
          sendEmailToo: true,
        });
      }
    }

    // Notify remaining task participants
    await notifyTaskParticipants({
      taskId,
      actorId: req.user.id,
      type: 'comment_added',
      title: `New comment on ${taskInfo?.task_code || 'task'}`,
      message: `${req.user.name}: ${cleanBody.slice(0, 140)}`,
      excludeUserIds: notifiedMentionedIds,
    });

    const fullComment = {
      ...comment,
      author_name: req.user.name,
      author_username: req.user.username,
      author_avatar: req.user.avatar_url,
      author_role: req.user.role_label,
      attachments,
    };

    emitToTask(taskId, 'comment:created', fullComment);
    res.status(201).json({ comment: fullComment });
  } catch (err) {
    console.error('[Comments] Create error:', err);
    res.status(500).json({ error: err.message || 'Failed to post comment.' });
  }
});

// PATCH /api/comments/:taskId/:commentId
router.patch('/:taskId/:commentId', async (req, res) => {
  try {
    const { taskId, commentId } = req.params;
    const { body } = req.body || {};
    if (!body || !String(body).trim()) {
      return res.status(400).json({ error: 'Comment text cannot be empty.' });
    }

    const cRes = await query('SELECT * FROM task_comments WHERE id = $1 AND task_id = $2', [commentId, taskId]);
    if (cRes.rowCount === 0) return res.status(404).json({ error: 'Comment not found.' });
    if (cRes.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own comments.' });
    }

    const cleanBody = String(body).trim();
    const mentions = extractMentions(cleanBody);
    const upd = await query(
      `UPDATE task_comments SET body = $1, mentions = $2::jsonb, is_edited = TRUE, edited_at = NOW(), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [cleanBody, JSON.stringify(mentions), commentId]
    );

    emitToTask(taskId, 'comment:updated', upd.rows[0]);
    res.json({ comment: upd.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update comment.' });
  }
});

// DELETE /api/comments/:taskId/:commentId
router.delete('/:taskId/:commentId', async (req, res) => {
  try {
    const { taskId, commentId } = req.params;
    const cRes = await query('SELECT * FROM task_comments WHERE id = $1 AND task_id = $2', [commentId, taskId]);
    if (cRes.rowCount === 0) return res.status(404).json({ error: 'Comment not found.' });

    if (cRes.rows[0].user_id !== req.user.id && !isPrivilegedRole(req.user.role)) {
      return res.status(403).json({ error: 'You can only delete your own comments.' });
    }

    await query('DELETE FROM task_comments WHERE id = $1', [commentId]);
    emitToTask(taskId, 'comment:deleted', { id: commentId });
    res.json({ message: 'Comment deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete comment.' });
  }
});

export default router;
