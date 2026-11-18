import express from 'express';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// GET /api/notifications
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 100);
    const [listRes, countRes] = await Promise.all([
      query(
        `SELECT n.*, a.name AS actor_name, a.avatar_url AS actor_avatar
         FROM notifications n
         LEFT JOIN users a ON a.id = n.actor_id
         WHERE n.user_id = $1
         ORDER BY n.created_at DESC
         LIMIT $2`,
        [req.user.id, limit]
      ),
      query(
        `SELECT COUNT(*)::int AS unread_count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
        [req.user.id]
      ),
    ]);

    res.json({
      notifications: listRes.rows,
      unreadCount: countRes.rows[0].unread_count,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res) => {
  try {
    await query(
      `UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notification as read.' });
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req, res) => {
  try {
    await query(
      `UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all notifications as read.' });
  }
});

export default router;
