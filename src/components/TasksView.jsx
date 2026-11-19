import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  Plus,
  LayoutList,
  Columns3,
  MessageSquare,
  Paperclip,
  Copy,
  Archive,
  Trash2,
  Edit3,
  AlertTriangle,
} from 'lucide-react';
import {
  apiRequest,
  formatDate,
  getPriorityMeta,
  getStatusMeta,
  isTaskOverdue,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '../utils/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Avatar from './Avatar.jsx';
import TaskModal from './TaskModal.jsx';

const KANBAN_COLUMNS = [
  { key: 'todo', label: 'To Do', altStatuses: ['open', 'todo'] },
  { key: 'in_progress', label: 'In Progress', altStatuses: ['in_progress'] },
  { key: 'under_review', label: 'Under Review', altStatuses: ['under_review', 'revision_required'] },
  { key: 'completed', label: 'Completed', altStatuses: ['completed'] },
];

export default function TasksView({
  mode = 'all', // 'my' | 'all'
  projects = [],
  users = [],
  onOpenTask,
  refreshSignal,
  onTriggerRefresh,
}) {
  const { isPrivileged } = useAuth();
  const { notify, confirm } = useToast();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewLayout, setViewLayout] = useState('list'); // list | kanban

  const [filters, setFilters] = useState({
    search: '',
    projectId: 'all',
    assigneeId: 'all',
    status: 'all',
    priority: 'all',
    sortBy: 'updated_at',
    includeArchived: false,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [draggingTaskId, setDraggingTaskId] = useState(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        view: mode === 'my' ? 'my' : 'all',
        projectId: filters.projectId,
        assigneeId: filters.assigneeId,
        status: filters.status,
        priority: filters.priority,
        sortBy: filters.sortBy,
        includeArchived: String(filters.includeArchived),
      });
      if (filters.search.trim()) params.set('search', filters.search.trim());
      const res = await apiRequest(`/api/tasks?${params.toString()}`);
      setTasks(res.tasks || []);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [mode, filters, notify]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks, refreshSignal]);

  const handleStatusChange = async (taskId, newStatus) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    try {
      await apiRequest(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      notify(`Status updated to ${getStatusMeta(newStatus).label}.`, 'success');
      onTriggerRefresh?.();
    } catch (err) {
      notify(err.message, 'error');
      loadTasks();
    }
  };

  const handleDuplicate = async (e, task) => {
    e.stopPropagation();
    try {
      const res = await apiRequest(`/api/tasks/${task.id}/duplicate`, { method: 'POST' });
      notify(`Duplicated as ${res.task.task_code}.`, 'success');
      loadTasks();
      onTriggerRefresh?.();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleArchiveToggle = async (e, task) => {
    e.stopPropagation();
    try {
      await apiRequest(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_archived: !task.is_archived }),
      });
      notify(task.is_archived ? 'Task restored.' : 'Task archived.', 'success');
      loadTasks();
      onTriggerRefresh?.();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleDelete = async (e, task) => {
    e.stopPropagation();
    const ok = await confirm({
      title: `Delete ${task.task_code}?`,
      message: `This will permanently delete "${task.title}" along with its subtasks, comments, and attachments.`,
      confirmLabel: 'Delete Task',
      danger: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/api/tasks/${task.id}`, { method: 'DELETE' });
      notify('Task deleted.', 'success');
      loadTasks();
      onTriggerRefresh?.();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleDropOnColumn = (columnKey) => {
    if (!draggingTaskId) return;
    const task = tasks.find((t) => t.id === draggingTaskId);
    setDraggingTaskId(null);
    if (!task || task.status === columnKey) return;
    handleStatusChange(task.id, columnKey);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {mode === 'my' ? 'My Tasks' : 'All Workspace Tasks'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {mode === 'my'
              ? 'Tasks assigned directly to you across shared projects.'
              : 'Manage task assignments, priorities, deadlines, and deliverable reviews.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="nx3-segmented flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setViewLayout('list')}
              aria-pressed={viewLayout === 'list'}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                viewLayout === 'list'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              List
            </button>
            <button
              type="button"
              onClick={() => setViewLayout('kanban')}
              aria-pressed={viewLayout === 'kanban'}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                viewLayout === 'kanban'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              Board
            </button>
          </div>

          {isPrivileged && (
            <button
              type="button"
              onClick={() => {
                setEditingTask(null);
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              New Task
            </button>
          )}
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="glass-surface rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Search by task ID, title, or description..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/70 dark:bg-slate-950/60 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <select
          value={filters.projectId}
          onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          aria-label="Filter by project"
        >
          <option value="all">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {isPrivileged && mode !== 'my' && (
          <select
            value={filters.assigneeId}
            onChange={(e) => setFilters({ ...filters, assigneeId: e.target.value })}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            aria-label="Filter by freelancer"
          >
            <option value="all">All Assignees</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          aria-label="Filter by status"
        >
          <option value="all">All Statuses</option>
          {TASK_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          value={filters.priority}
          onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          aria-label="Filter by priority"
        >
          <option value="all">All Priorities</option>
          {TASK_PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        <select
          value={filters.sortBy}
          onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          aria-label="Sort tasks"
        >
          <option value="updated_at">Sort: Last Updated</option>
          <option value="due_date">Sort: Due Date</option>
          <option value="priority">Sort: Priority</option>
          <option value="created_at">Sort: Newest</option>
        </select>

        <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer px-1">
          <input
            type="checkbox"
            checked={filters.includeArchived}
            onChange={(e) => setFilters({ ...filters, includeArchived: e.target.checked })}
            className="rounded border-slate-300 text-blue-600"
          />
          Show Archived
        </label>
      </div>

      {/* Loading skeleton */}
      {loading && tasks.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="nx3-skeleton h-14 rounded-xl" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="glass-surface rounded-2xl p-12 text-center">
          <p className="text-base font-medium text-slate-900 dark:text-white">
            No matching tasks found
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Adjust your active filters or create a new task to start collaborating.
          </p>
          {isPrivileged && (
            <button
              type="button"
              onClick={() => {
                setEditingTask(null);
                setModalOpen(true);
              }}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="w-4 h-4" />
              Create First Task
            </button>
          )}
        </div>
      ) : viewLayout === 'list' ? (
        /* List View */
        <div className="glass-surface rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/70 dark:bg-slate-800/40 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200/70 dark:border-slate-800/70">
                <tr>
                  <th className="text-left font-medium px-5 py-3">Task</th>
                  <th className="text-left font-medium px-4 py-3">Project</th>
                  <th className="text-left font-medium px-4 py-3">Assignee</th>
                  <th className="text-left font-medium px-4 py-3">Priority</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-left font-medium px-4 py-3">Due Date</th>
                  <th className="text-left font-medium px-4 py-3">Updated</th>
                  {isPrivileged && <th className="text-right font-medium px-5 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {tasks.map((task) => {
                  const statusMeta = getStatusMeta(task.status);
                  const priorityMeta = getPriorityMeta(task.priority);
                  const overdue = isTaskOverdue(task);
                  return (
                    <tr
                      key={task.id}
                      onClick={() => onOpenTask(task.id)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3.5 max-w-md">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {task.title}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono">{task.task_code}</span>
                          {task.tags?.length > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{task.tags.map((t) => `#${t.name}`).join(' ')}</span>
                            </>
                          )}
                          {task.comment_count > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <MessageSquare className="w-3 h-3" /> {task.comment_count}
                              </span>
                            </>
                          )}
                          {task.attachment_count > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <Paperclip className="w-3 h-3" /> {task.attachment_count}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
                        <span className="font-mono text-slate-400 mr-1.5">{task.project_code}</span>
                        {task.project_name}
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {task.assignees?.length > 0 ? (
                          <div className="flex items-center gap-2">
                            <Avatar user={task.assignees[0]} size="xs" />
                            <span className="text-xs text-slate-700 dark:text-slate-300">
                              {task.assignees[0].name}
                              {task.assignees.length > 1 ? ` +${task.assignees.length - 1}` : ''}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Unassigned</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`text-xs font-semibold ${priorityMeta.textColor}`}>
                          {priorityMeta.label}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={task.status}
                          onChange={(e) => handleStatusChange(task.id, e.target.value)}
                          className={`text-xs font-medium bg-transparent border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 ${statusMeta.textColor}`}
                        >
                          {TASK_STATUSES.map((s) => (
                            <option key={s.value} value={s.value} className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900">
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap text-xs tabular-nums">
                        {overdue ? (
                          <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {formatDate(task.due_date)}
                          </span>
                        ) : (
                          <span className="text-slate-600 dark:text-slate-300">{formatDate(task.due_date)}</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-400 tabular-nums">
                        {formatDate(task.updated_at)}
                      </td>

                      {isPrivileged && (
                        <td className="px-5 py-3.5 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              title="Edit task"
                              onClick={() => {
                                setEditingTask(task);
                                setModalOpen(true);
                              }}
                              className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Duplicate task"
                              onClick={(e) => handleDuplicate(e, task)}
                              className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title={task.is_archived ? 'Restore task' : 'Archive task'}
                              onClick={(e) => handleArchiveToggle(e, task)}
                              className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Delete task"
                              onClick={(e) => handleDelete(e, task)}
                              className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Kanban Board */
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {KANBAN_COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => col.altStatuses.includes(t.status));
            return (
              <div
                key={col.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDropOnColumn(col.key)}
                className="glass-surface rounded-2xl p-3 min-h-[380px]"
              >
                <div className="flex items-center justify-between px-1 pb-3">
                  <h3 className="font-display text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {col.label}
                  </h3>
                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {colTasks.map((task) => {
                    const priorityMeta = getPriorityMeta(task.priority);
                    const statusMeta = getStatusMeta(task.status);
                    const overdue = isTaskOverdue(task);
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => setDraggingTaskId(task.id)}
                        onClick={() => onOpenTask(task.id)}
                        className="bg-white/85 dark:bg-slate-900/85 border border-slate-200/80 dark:border-slate-700/70 rounded-xl p-3.5 cursor-pointer hover:border-blue-500 dark:hover:border-blue-500 transition-colors shadow-sm space-y-2.5"
                      >
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono">{task.task_code}</span>
                          <span className={`font-semibold ${priorityMeta.textColor}`}>
                            {priorityMeta.label}
                          </span>
                        </div>

                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug">
                          {task.title}
                        </div>

                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {task.project_name}
                          {task.status === 'revision_required' && (
                            <span className={`ml-2 font-medium ${statusMeta.textColor}`}>
                              · Revision Required
                            </span>
                          )}
                        </div>

                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {task.assignees?.length > 0 ? (
                              <>
                                <Avatar user={task.assignees[0]} size="xs" />
                                <span className="text-xs text-slate-600 dark:text-slate-300 truncate">
                                  {task.assignees[0].name.split(' ')[0]}
                                </span>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400">Unassigned</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-400 tabular-nums shrink-0">
                            {task.comment_count > 0 && (
                              <span className="inline-flex items-center gap-0.5">
                                <MessageSquare className="w-3 h-3" /> {task.comment_count}
                              </span>
                            )}
                            <span className={overdue ? 'text-rose-600 dark:text-rose-400 font-medium' : ''}>
                              {formatDate(task.due_date)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editTask={editingTask}
        projects={projects}
        users={users}
        onSaved={() => {
          loadTasks();
          onTriggerRefresh?.();
        }}
      />
    </div>
  );
}
