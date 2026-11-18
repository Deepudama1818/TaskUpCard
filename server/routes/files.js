import express from 'express';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { canAccessTask, isPrivilegedRole } from '../services/permissions.js';
import { logActivity, notifyTaskParticipants } from '../services/notifications.js';
import { emitToTask } from '../services/realtime.js';
import {
  deleteStoredFile,
  saveUploadedFile,
  streamFileToResponse,
  uploadMiddleware,
} from '../services/storage.js';

const router = express.Router();
router.use(authenticate);

// POST /api/files/task/:taskId
router.post('/task/:taskId', uploadMiddleware.array('files', 8), async (req, res) => {
  try {
    const { taskId } = req.params;
    const allowed = await canAccessTask(req.user, taskId);
    if (!allowed) {
      return res.status(403).json({ error: 'You do not have permission to upload to this task.' });
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'Select at least one valid file to upload.' });
    }

    const taskMeta = await query('SELECT project_id, task_code, title FROM tasks WHERE id = $1', [taskId]);
    if (taskMeta.rowCount === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    const taskInfo = taskMeta.rows[0];

    const uploaded = [];
    for (const f of files) {
      const stored = await saveUploadedFile(f, `tasks/${taskId}`);
      const ins = await query(
        `INSERT INTO task_attachments (
          task_id, uploaded_by, original_name, stored_name, mime_type, file_size, storage_provider, storage_key
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *`,
        [
          taskId,
          req.user.id,
          f.originalname,
          stored.storedName,
          f.mimetype,
          f.size,
          stored.storageProvider,
          stored.storageKey,
        ]
      );
      uploaded.push({ ...ins.rows[0], uploaded_by_name: req.user.name });
    }

    await logActivity({
      projectId: taskInfo.project_id,
      taskId,
      userId: req.user.id,
      action: 'attachment_uploaded',
      details: { files: uploaded.map((u) => u.original_name) },
    });

    await notifyTaskParticipants({
      taskId,
      actorId: req.user.id,
      type: 'attachment_uploaded',
      title: `Deliverable uploaded to ${taskInfo.task_code}`,
      message: `${req.user.name} uploaded ${uploaded.length} file(s) to "${taskInfo.title}".`,
    });

    emitToTask(taskId, 'attachment:uploaded', { taskId, attachments: uploaded });
    res.status(201).json({ attachments: uploaded });
  } catch (err) {
    console.error('[Files] Upload error:', err);
    res.status(400).json({ error: err.message || 'File upload failed.' });
  }
});

// GET /api/files/:id/download (handles both task_attachments and comment_attachments)
router.get('/:id/download', async (req, res) => {
  try {
    const fileId = req.params.id;
    let record = null;
    let taskId = null;

    const tAtt = await query('SELECT * FROM task_attachments WHERE id = $1', [fileId]);
    if (tAtt.rowCount > 0) {
      record = tAtt.rows[0];
      taskId = record.task_id;
    } else {
      const cAtt = await query(
        `SELECT ca.*, tc.task_id
         FROM comment_attachments ca
         JOIN task_comments tc ON tc.id = ca.comment_id
         WHERE ca.id = $1`,
        [fileId]
      );
      if (cAtt.rowCount > 0) {
        record = cAtt.rows[0];
        taskId = record.task_id;
      }
    }

    if (!record || !taskId) {
      return res.status(404).json({ error: 'Attachment not found.' });
    }

    const allowed = await canAccessTask(req.user, taskId);
    if (!allowed) {
      return res.status(403).json({ error: 'You do not have permission to download this file.' });
    }

    await streamFileToResponse(record, res);
  } catch (err) {
    console.error('[Files] Download error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download file.' });
    }
  }
});

// DELETE /api/files/:id
router.delete('/:id', async (req, res) => {
  try {
    const attRes = await query('SELECT * FROM task_attachments WHERE id = $1', [req.params.id]);
    if (attRes.rowCount === 0) {
      return res.status(404).json({ error: 'Attachment not found.' });
    }
    const record = attRes.rows[0];

    if (record.uploaded_by !== req.user.id && !isPrivilegedRole(req.user.role)) {
      return res.status(403).json({ error: 'You can only delete files you uploaded.' });
    }

    await query('DELETE FROM task_attachments WHERE id = $1', [record.id]);
    await deleteStoredFile(record);
    emitToTask(record.task_id, 'attachment:deleted', { id: record.id });
    res.json({ message: 'Attachment deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete attachment.' });
  }
});

export default router;
