import express from 'express';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { isPrivilegedRole } from '../services/permissions.js';

const router = express.Router();
router.use(authenticate);

// GET /api/analytics/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const privileged = isPrivilegedRole(req.user.role);
    const params = [];
    let taskScope = 't.is_archived = FALSE';

    if (!privileged) {
      params.push(req.user.id);
      taskScope += ` AND (
        t.creator_id = $1
        OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = $1)
        OR EXISTS (SELECT 1 FROM task_watchers tw WHERE tw.task_id = t.id AND tw.user_id = $1)
      )`;
    }

    const summaryRes = await query(
      `SELECT
        COUNT(*)::int AS total_tasks,
        COUNT(*) FILTER (WHERE t.status IN ('open', 'todo'))::int AS todo_tasks,
        COUNT(*) FILTER (WHERE t.status = 'in_progress')::int AS in_progress_tasks,
        COUNT(*) FILTER (WHERE t.status = 'under_review')::int AS under_review_tasks,
        COUNT(*) FILTER (WHERE t.status = 'revision_required')::int AS revision_tasks,
        COUNT(*) FILTER (WHERE t.status = 'completed')::int AS completed_tasks,
        COUNT(*) FILTER (WHERE t.status NOT IN ('completed', 'cancelled') AND t.due_date IS NOT NULL AND t.due_date < NOW())::int AS overdue_tasks,
        COUNT(*) FILTER (WHERE t.status NOT IN ('completed', 'cancelled') AND t.due_date IS NOT NULL AND t.due_date >= NOW() AND t.due_date <= NOW() + INTERVAL '7 days')::int AS upcoming_deadlines
       FROM tasks t
       WHERE ${taskScope}`,
      params
    );

    const projectScope = privileged
      ? "p.status = 'active'"
      : `p.status = 'active' AND (EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $1) OR EXISTS (SELECT 1 FROM tasks t JOIN task_assignees ta ON ta.task_id = t.id WHERE t.project_id = p.id AND ta.user_id = $1))`;

    const [activeProjectsRes, freelancersRes, recentActivityRes, recentTasksRes, upcomingRes, projectProgressRes, workloadRes] =
      await Promise.all([
        query(`SELECT COUNT(*)::int AS count FROM projects p WHERE ${projectScope}`, privileged ? [] : params),
        query(`SELECT COUNT(*)::int AS count FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'freelancer' AND u.status = 'active'`),
        query(
          `SELECT al.*, u.name AS actor_name, u.avatar_url AS actor_avatar,
                  t.task_code, t.title AS task_title, p.name AS project_name
           FROM activity_logs al
           LEFT JOIN users u ON u.id = al.user_id
           LEFT JOIN tasks t ON t.id = al.task_id
           LEFT JOIN projects p ON p.id = al.project_id
           ${
             privileged
               ? ''
               : `WHERE al.user_id = $1 OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = al.task_id AND ta.user_id = $1)`
           }
           ORDER BY al.created_at DESC
           LIMIT 12`,
          privileged ? [] : params
        ),
        query(
          `SELECT t.id, t.task_code, t.title, t.status, t.priority, t.due_date, t.assigned_date,
                  p.name AS project_name, p.color AS project_color
           FROM tasks t
           JOIN projects p ON p.id = t.project_id
           WHERE ${taskScope}
           ORDER BY t.created_at DESC
           LIMIT 6`,
          params
        ),
        query(
          `SELECT t.id, t.task_code, t.title, t.status, t.priority, t.due_date,
                  p.name AS project_name, p.color AS project_color
           FROM tasks t
           JOIN projects p ON p.id = t.project_id
           WHERE ${taskScope} AND t.status NOT IN ('completed', 'cancelled') AND t.due_date IS NOT NULL
           ORDER BY t.due_date ASC
           LIMIT 6`,
          params
        ),
        query(
          `SELECT p.id, p.name, p.code, p.color,
                  COUNT(t.id)::int AS total_tasks,
                  COUNT(t.id) FILTER (WHERE t.status = 'completed')::int AS completed_tasks
           FROM projects p
           LEFT JOIN tasks t ON t.project_id = p.id AND t.is_archived = FALSE
           WHERE p.status != 'archived' ${
             privileged
               ? ''
               : `AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $1)`
           }
           GROUP BY p.id
           ORDER BY p.created_at DESC
           LIMIT 6`,
          privileged ? [] : params
        ),
        privileged
          ? query(`
              SELECT u.id, u.name, u.avatar_url, u.specialty,
                     COUNT(t.id) FILTER (WHERE t.status NOT IN ('completed', 'cancelled'))::int AS active_count,
                     COUNT(t.id) FILTER (WHERE t.status = 'completed')::int AS completed_count
              FROM users u
              JOIN roles r ON r.id = u.role_id
              LEFT JOIN task_assignees ta ON ta.user_id = u.id
              LEFT JOIN tasks t ON t.id = ta.task_id AND t.is_archived = FALSE
              WHERE r.name = 'freelancer' AND u.status = 'active'
              GROUP BY u.id
              ORDER BY active_count DESC, u.name ASC
            `)
          : Promise.resolve({ rows: [] }),
      ]);

    res.json({
      kpis: {
        ...summaryRes.rows[0],
        active_projects: activeProjectsRes.rows[0].count,
        total_freelancers: freelancersRes.rows[0].count,
      },
      recentActivity: recentActivityRes.rows,
      recentTasks: recentTasksRes.rows,
      upcomingDeadlines: upcomingRes.rows,
      projectProgress: projectProgressRes.rows.map((p) => ({
        ...p,
        percentage: p.total_tasks > 0 ? Math.round((p.completed_tasks / p.total_tasks) * 100) : 0,
      })),
      freelancerWorkload: workloadRes.rows,
    });
  } catch (err) {
    console.error('[Analytics] Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard analytics.' });
  }
});

// GET /api/analytics/reports
router.get('/reports', async (req, res) => {
  try {
    const { startDate, endDate, projectId, freelancerId, status } = req.query;
    const privileged = isPrivilegedRole(req.user.role);

    const params = [];
    const conditions = ['t.is_archived = FALSE'];

    if (!privileged) {
      params.push(req.user.id);
      conditions.push(`EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = $${params.length})`);
    }
    if (startDate) {
      params.push(startDate);
      conditions.push(`t.created_at >= $${params.length}::date`);
    }
    if (endDate) {
      params.push(endDate);
      conditions.push(`t.created_at <= ($${params.length}::date + INTERVAL '1 day')`);
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

    const whereClause = conditions.join(' AND ');

    const [totalsRes, freelancerProdRes, projectCompRes, monthlyTrendsRes, statusDistRes] = await Promise.all([
      query(
        `SELECT
          COUNT(*)::int AS total_assigned,
          COUNT(*) FILTER (WHERE t.status = 'completed')::int AS total_completed,
          COUNT(*) FILTER (WHERE t.status NOT IN ('completed', 'cancelled'))::int AS pending_tasks,
          COUNT(*) FILTER (WHERE t.status NOT IN ('completed', 'cancelled') AND t.due_date IS NOT NULL AND t.due_date < NOW())::int AS overdue_tasks,
          ROUND(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at)) / 86400.0) FILTER (WHERE t.completed_at IS NOT NULL)::numeric, 1) AS avg_completion_days
         FROM tasks t
         WHERE ${whereClause}`,
        params
      ),
      query(
        `SELECT u.id, u.name, u.specialty, u.avatar_url,
                COUNT(t.id)::int AS assigned_count,
                COUNT(t.id) FILTER (WHERE t.status = 'completed')::int AS completed_count,
                COUNT(t.id) FILTER (WHERE t.status NOT IN ('completed', 'cancelled') AND t.due_date IS NOT NULL AND t.due_date < NOW())::int AS overdue_count,
                COALESCE(SUM(t.actual_hours), 0)::numeric(8,1) AS hours_logged
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN task_assignees ta ON ta.user_id = u.id
         LEFT JOIN tasks t ON t.id = ta.task_id AND ${whereClause}
         WHERE r.name = 'freelancer' ${!privileged ? `AND u.id = '${req.user.id}'` : ''}
         GROUP BY u.id
         ORDER BY completed_count DESC, assigned_count DESC`,
        params
      ),
      query(
        `SELECT p.id, p.name, p.code, p.color,
                COUNT(t.id)::int AS total_tasks,
                COUNT(t.id) FILTER (WHERE t.status = 'completed')::int AS completed_tasks
         FROM projects p
         LEFT JOIN tasks t ON t.project_id = p.id AND ${whereClause}
         GROUP BY p.id
         HAVING COUNT(t.id) > 0
         ORDER BY p.name ASC`,
        params
      ),
      query(
        `SELECT TO_CHAR(DATE_TRUNC('month', COALESCE(t.completed_at, t.created_at)), 'Mon YYYY') AS month_label,
                DATE_TRUNC('month', COALESCE(t.completed_at, t.created_at)) AS month_date,
                COUNT(*) FILTER (WHERE t.status = 'completed')::int AS completed_count,
                COUNT(*)::int AS created_count
         FROM tasks t
         WHERE ${whereClause}
         GROUP BY month_label, month_date
         ORDER BY month_date ASC
         LIMIT 12`,
        params
      ),
      query(
        `SELECT t.status, COUNT(*)::int AS count
         FROM tasks t
         WHERE ${whereClause}
         GROUP BY t.status`,
        params
      ),
    ]);

    res.json({
      summary: {
        ...totalsRes.rows[0],
        avg_completion_days: Number(totalsRes.rows[0].avg_completion_days || 0),
      },
      freelancerProductivity: freelancerProdRes.rows.map((r) => ({
        ...r,
        hours_logged: Number(r.hours_logged || 0),
        completion_rate: r.assigned_count > 0 ? Math.round((r.completed_count / r.assigned_count) * 100) : 0,
      })),
      projectCompletion: projectCompRes.rows.map((p) => ({
        ...p,
        percentage: p.total_tasks > 0 ? Math.round((p.completed_tasks / p.total_tasks) * 100) : 0,
      })),
      monthlyTrends: monthlyTrendsRes.rows,
      statusDistribution: statusDistRes.rows,
    });
  } catch (err) {
    console.error('[Analytics] Reports error:', err);
    res.status(500).json({ error: 'Failed to generate reports.' });
  }
});

export default router;
