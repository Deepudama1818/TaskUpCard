import express from 'express';
import { query } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// GET /api/settings
router.get('/', async (_req, res) => {
  try {
    const result = await query('SELECT key, value, updated_at FROM app_settings');
    const settings = Object.fromEntries(result.rows.map((r) => [r.key, r.value]));
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load workspace settings.' });
  }
});

// PUT /api/settings/:key
router.put('/:key', requireRole('super_admin'), async (req, res) => {
  try {
    const { key } = req.params;
    const value = req.body?.value;
    if (!value || typeof value !== 'object') {
      return res.status(400).json({ error: 'Settings payload must be a JSON object.' });
    }
    const upd = await query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING *`,
      [key, JSON.stringify(value), req.user.id]
    );
    res.json({ setting: upd.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings.' });
  }
});

export default router;
