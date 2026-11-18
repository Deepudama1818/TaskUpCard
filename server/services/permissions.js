import { query } from '../db/pool.js';

export function isPrivilegedRole(roleName) {
  return roleName === 'super_admin' || roleName === 'project_manager';
}

export async function canAccessProject(user, projectId) {
  if (!user) return false;
  if (isPrivilegedRole(user.role)) return true;

  const res = await query(
    `SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2
     UNION
     SELECT 1 FROM tasks t
       JOIN task_assignees ta ON ta.task_id = t.id
       WHERE t.project_id = $1 AND ta.user_id = $2
     LIMIT 1`,
    [projectId, user.id]
  );
  return res.rowCount > 0;
}

export async function canManageProject(user, projectId) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  if (user.role === 'project_manager') {
    const res = await query('SELECT manager_id, created_by FROM projects WHERE id = $1', [projectId]);
    if (res.rowCount === 0) return false;
    return true; // Project managers can manage projects in their workspace
  }
  return false;
}

export async function canAccessTask(user, taskId) {
  if (!user) return false;
  if (isPrivilegedRole(user.role)) return true;

  // Freelancers can only access tasks assigned to them, created by them, or explicitly shared as watcher
  const res = await query(
    `SELECT 1 FROM tasks t
     WHERE t.id = $1 AND (
       t.creator_id = $2
       OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = $2)
       OR EXISTS (SELECT 1 FROM task_watchers tw WHERE tw.task_id = t.id AND tw.user_id = $2)
     )
     LIMIT 1`,
    [taskId, user.id]
  );
  return res.rowCount > 0;
}

export function canEditTaskStructure(user) {
  if (!user) return false;
  return isPrivilegedRole(user.role);
}
