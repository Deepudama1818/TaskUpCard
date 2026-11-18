import { query } from '../db/pool.js';
import { emitToUser } from './realtime.js';
import { sendEmail } from './email.js';

export async function createNotification({
  userId,
  actorId = null,
  taskId = null,
  projectId = null,
  type,
  title,
  message,
  link = '/tasks',
  sendEmailToo = false,
}) {
  if (!userId || userId === actorId) return null;

  const res = await query(
    `INSERT INTO notifications (user_id, actor_id, task_id, project_id, type, title, message, link)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [userId, actorId, taskId, projectId, type, title, message, link]
  );
  const notification = res.rows[0];

  emitToUser(userId, 'notification:new', notification);

  if (sendEmailToo) {
    const userRes = await query('SELECT email, name FROM users WHERE id = $1 AND status = $2', [userId, 'active']);
    if (userRes.rowCount > 0) {
      const recipient = userRes.rows[0];
      await sendEmail({
        to: recipient.email,
        subject: `[TaskUpCard] ${title}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; color: #0f172a;">
            <h3 style="margin: 0 0 8px;">${title}</h3>
            <p style="color: #334155; line-height: 1.5;">${message}</p>
            <p style="margin-top: 16px; font-size: 13px; color: #64748b;">Log in to TaskUpCard to view details.</p>
          </div>
        `,
      });
    }
  }

  return notification;
}

export async function logActivity({ projectId = null, taskId = null, userId = null, action, details = {} }) {
  const res = await query(
    `INSERT INTO activity_logs (project_id, task_id, user_id, action, details)
     VALUES ($1,$2,$3,$4,$5::jsonb)
     RETURNING *`,
    [projectId, taskId, userId, action, JSON.stringify(details)]
  );
  return res.rows[0];
}

export async function notifyTaskParticipants({
  taskId,
  actorId,
  type,
  title,
  message,
  excludeUserIds = [],
  sendEmailToo = false,
}) {
  const res = await query(
    `SELECT DISTINCT user_id FROM (
       SELECT user_id FROM task_assignees WHERE task_id = $1
       UNION
       SELECT user_id FROM task_watchers WHERE task_id = $1
       UNION
       SELECT creator_id AS user_id FROM tasks WHERE id = $1 AND creator_id IS NOT NULL
     ) participants`,
    [taskId]
  );

  const excluded = new Set([actorId, ...excludeUserIds].filter(Boolean));
  const taskMeta = await query('SELECT project_id FROM tasks WHERE id = $1', [taskId]);
  const projectId = taskMeta.rows[0]?.project_id || null;

  for (const row of res.rows) {
    if (!excluded.has(row.user_id)) {
      await createNotification({
        userId: row.user_id,
        actorId,
        taskId,
        projectId,
        type,
        title,
        message,
        link: `/tasks/${taskId}`,
        sendEmailToo,
      });
    }
  }
}

export async function checkDeadlinesAndNotify() {
  try {
    // Tasks due in next 24h or overdue that haven't had a reminder notification in the last 24h
    const res = await query(`
      SELECT t.id, t.task_code, t.title, t.project_id, t.due_date, ta.user_id
      FROM tasks t
      JOIN task_assignees ta ON ta.task_id = t.id
      WHERE t.is_archived = FALSE
        AND t.status NOT IN ('completed', 'cancelled')
        AND t.due_date IS NOT NULL
        AND t.due_date <= NOW() + INTERVAL '24 hours'
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.task_id = t.id
            AND n.user_id = ta.user_id
            AND n.type IN ('deadline_approaching', 'task_overdue')
            AND n.created_at >= NOW() - INTERVAL '24 hours'
        )
    `);

    const now = Date.now();
    for (const row of res.rows) {
      const isOverdue = new Date(row.due_date).getTime() < now;
      await createNotification({
        userId: row.user_id,
        taskId: row.id,
        projectId: row.project_id,
        type: isOverdue ? 'task_overdue' : 'deadline_approaching',
        title: isOverdue
          ? `Overdue: ${row.task_code} ${row.title}`
          : `Deadline approaching: ${row.task_code} ${row.title}`,
        message: isOverdue
          ? `Task ${row.task_code} passed its deadline on ${new Date(row.due_date).toLocaleDateString()}.`
          : `Task ${row.task_code} is due within 24 hours.`,
        link: `/tasks/${row.id}`,
      });
    }
  } catch (err) {
    console.warn('[Notifications] Deadline check skipped:', err.message);
  }
}
