import { useEffect, useState, useCallback } from 'react';
import { Plus, ArrowLeft, Edit3, Trash2, CalendarDays, ListTodo, History } from 'lucide-react';
import {
  apiRequest,
  formatDate,
  formatDateTime,
  getStatusMeta,
  PROJECT_STATUSES,
} from '../utils/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Avatar from './Avatar.jsx';
import TaskModal from './TaskModal.jsx';

export default function ProjectsView({ users = [], onOpenTask, refreshSignal, onTriggerRefresh }) {
  const { isPrivileged } = useAuth();
  const { notify, confirm } = useToast();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projectDetail, setProjectDetail] = useState(null);
  const [projectTasks, setProjectTasks] = useState([]);
  const [detailTab, setDetailTab] = useState('tasks'); // tasks | overview | activity

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    manager_id: '',
    status: 'active',
    start_date: '',
    end_date: '',
    color: '#2563EB',
    memberIds: [],
  });

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/api/projects?status=${statusFilter}`);
      setProjects(res.projects || []);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, notify]);

  const loadProjectDetail = useCallback(async (pid) => {
    if (!pid) return;
    try {
      const [detailRes, tasksRes] = await Promise.all([
        apiRequest(`/api/projects/${pid}`),
        apiRequest(`/api/tasks?projectId=${pid}`),
      ]);
      setProjectDetail(detailRes);
      setProjectTasks(tasksRes.tasks || []);
    } catch (err) {
      notify(err.message, 'error');
      setSelectedProjectId(null);
    }
  }, [notify]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects, refreshSignal]);

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectDetail(selectedProjectId);
    }
  }, [selectedProjectId, loadProjectDetail, refreshSignal]);

  const openCreateModal = () => {
    setEditingProject(null);
    setForm({
      name: '',
      description: '',
      manager_id: users.find((u) => u.role !== 'freelancer')?.id || '',
      status: 'active',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: '',
      color: '#2563EB',
      memberIds: [],
    });
    setProjectModalOpen(true);
  };

  const openEditModal = (e, proj) => {
    e.stopPropagation();
    setEditingProject(proj);
    setForm({
      name: proj.name,
      description: proj.description || '',
      manager_id: proj.manager_id || '',
      status: proj.status || 'active',
      start_date: proj.start_date ? String(proj.start_date).slice(0, 10) : '',
      end_date: proj.end_date ? String(proj.end_date).slice(0, 10) : '',
      color: proj.color || '#2563EB',
      memberIds: (proj.members || []).map((m) => m.id),
    });
    setProjectModalOpen(true);
  };

  const handleSaveProject = async (e) => {
    e.preventDefault();
    try {
      if (editingProject) {
        await apiRequest(`/api/projects/${editingProject.id}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        });
        notify('Project updated.', 'success');
      } else {
        await apiRequest('/api/projects', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        notify('Project created.', 'success');
      }
      setProjectModalOpen(false);
      loadProjects();
      if (selectedProjectId) loadProjectDetail(selectedProjectId);
      onTriggerRefresh?.();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleDeleteProject = async (e, proj) => {
    e.stopPropagation();
    const ok = await confirm({
      title: `Delete ${proj.name}?`,
      message: 'This will remove the project and all tasks inside it.',
      confirmLabel: 'Delete Project',
      danger: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/api/projects/${proj.id}`, { method: 'DELETE' });
      notify('Project deleted.', 'success');
      if (selectedProjectId === proj.id) setSelectedProjectId(null);
      loadProjects();
      onTriggerRefresh?.();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  if (selectedProjectId && projectDetail) {
    const p = projectDetail.project;
    const completed = projectTasks.filter((t) => t.status === 'completed').length;
    const pct = projectTasks.length ? Math.round((completed / projectTasks.length) * 100) : 0;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedProjectId(null);
                setProjectDetail(null);
              }}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Back to projects"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {p.code} · {p.status.replace('_', ' ')}
              </div>
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                {p.name}
              </h1>
            </div>
          </div>

          {isPrivileged && (
            <button
              type="button"
              onClick={() => setTaskModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="w-4 h-4" /> Add Project Task
            </button>
          )}
        </div>

        {/* Sub-nav tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setDetailTab('tasks')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md ${
              detailTab === 'tasks' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <ListTodo className="w-3.5 h-3.5" /> Tasks ({projectTasks.length})
          </button>
          <button
            type="button"
            onClick={() => setDetailTab('overview')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md ${
              detailTab === 'overview' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" /> Overview & Members
          </button>
          <button
            type="button"
            onClick={() => setDetailTab('activity')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md ${
              detailTab === 'activity' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <History className="w-3.5 h-3.5" /> Activity History
          </button>
        </div>

        {detailTab === 'tasks' && (
          <div className="glass-surface rounded-2xl overflow-hidden divide-y divide-slate-100/80 dark:divide-slate-800/80">
            {projectTasks.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-400">No tasks in this project yet.</p>
            ) : (
              projectTasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onOpenTask(t.id)}
                  className="w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {t.title}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono">{t.task_code}</div>
                  </div>
                  <div className="text-right text-xs shrink-0">
                    <div className={`font-medium ${getStatusMeta(t.status).textColor}`}>
                      {getStatusMeta(t.status).label}
                    </div>
                    <div className="text-slate-400 tabular-nums mt-0.5">{formatDate(t.due_date)}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {detailTab === 'overview' && (
          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 glass-surface rounded-2xl p-6 space-y-4">
              <h2 className="font-display text-base font-semibold">Project Brief</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {p.description || 'No description provided.'}
              </p>
              <div className="grid grid-cols-3 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400 block">Manager</span>
                  <span className="font-medium text-slate-900 dark:text-white mt-0.5 block">
                    {p.manager_name || 'Unassigned'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Timeline</span>
                  <span className="font-medium tabular-nums mt-0.5 block">
                    {formatDate(p.start_date)} – {formatDate(p.end_date)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Progress</span>
                  <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 tabular-nums mt-0.5 block">
                    {pct}% ({completed}/{projectTasks.length})
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 glass-surface rounded-2xl p-6 space-y-3">
              <h2 className="font-display text-base font-semibold">
                Project Members ({projectDetail.members.length})
              </h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {projectDetail.members.map((m) => (
                  <div key={m.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar user={m} size="sm" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{m.name}</div>
                        <div className="text-xs text-slate-400 truncate">{m.specialty || m.role_label}</div>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 capitalize">{m.member_role}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {detailTab === 'activity' && (
          <div className="glass-surface rounded-2xl p-6 space-y-3">
            {projectDetail.activities.length === 0 ? (
              <p className="text-sm text-slate-400">No activity recorded for this project.</p>
            ) : (
              projectDetail.activities.map((a) => (
                <div key={a.id} className="flex items-start gap-3 text-sm py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <Avatar user={{ name: a.actor_name, avatar_url: a.actor_avatar }} size="xs" className="mt-0.5" />
                  <div>
                    <span className="font-medium">{a.actor_name || 'System'}</span>{' '}
                    <span className="text-slate-600 dark:text-slate-400">{a.action.replace(/_/g, ' ')}</span>
                    <div className="text-xs text-slate-400 tabular-nums mt-0.5">{formatDateTime(a.created_at)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <TaskModal
          open={taskModalOpen}
          onClose={() => setTaskModalOpen(false)}
          initialProjectId={p.id}
          projects={projects}
          users={users}
          onSaved={() => {
            loadProjectDetail(p.id);
            onTriggerRefresh?.();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Projects
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Organize external contractor deliverables, timelines, and project progress.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg glass-surface"
          >
            <option value="all">All Statuses</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {isPrivileged && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> New Project
            </button>
          )}
        </div>
      </div>

      {loading && projects.length === 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-slate-200/60 dark:bg-slate-800/60" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="glass-surface rounded-2xl p-12 text-center">
          <p className="text-base font-medium">No projects found</p>
          <p className="text-sm text-slate-500 mt-1">Create a project to start assigning tasks to freelancers.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((proj) => (
            <div
              key={proj.id}
              onClick={() => setSelectedProjectId(proj.id)}
              className="glass-surface rounded-2xl p-5 hover:border-blue-500 transition-all hover:-translate-y-0.5 cursor-pointer flex flex-col justify-between gap-4"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono">{proj.code} · {proj.status.replace('_', ' ')}</span>
                  {isPrivileged && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => openEditModal(e, proj)}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-600"
                        title="Edit project"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteProject(e, proj)}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-600"
                        title="Delete project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white leading-snug">
                  {proj.name}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                  {proj.description || 'No project brief added.'}
                </p>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Completion</span>
                    <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-white">
                      {proj.progress}% ({proj.completed_tasks}/{proj.total_tasks})
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all"
                      style={{ width: `${proj.progress}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500">
                  <div className="flex -space-x-1.5">
                    {(proj.members || []).slice(0, 4).map((m) => (
                      <Avatar key={m.id} user={m} size="xs" />
                    ))}
                  </div>
                  <span className="tabular-nums">Due {formatDate(proj.end_date)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Project Modal */}
      {projectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg glass-surface rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-lg font-semibold">
              {editingProject ? `Edit ${editingProject.code}` : 'Create New Project'}
            </h2>
            <form onSubmit={handleSaveProject} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Project Manager</label>
                  <select
                    value={form.manager_id}
                    onChange={(e) => setForm({ ...form, manager_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    {users
                      .filter((u) => u.role !== 'freelancer')
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    {PROJECT_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Start Date</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Target End Date</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Project Members</label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                  {users
                    .filter((u) => u.status === 'active')
                    .map((u) => (
                      <label key={u.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.memberIds.includes(u.id)}
                          onChange={() =>
                            setForm((prev) => ({
                              ...prev,
                              memberIds: prev.memberIds.includes(u.id)
                                ? prev.memberIds.filter((id) => id !== u.id)
                                : [...prev.memberIds, u.id],
                            }))
                          }
                        />
                        <span className="truncate">{u.name}</span>
                      </label>
                    ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setProjectModalOpen(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Save Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
