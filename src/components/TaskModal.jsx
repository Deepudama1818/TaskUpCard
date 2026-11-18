import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { apiRequest, TASK_PRIORITIES, TASK_STATUSES } from '../utils/api.js';
import { useToast } from '../context/ToastContext.jsx';

export default function TaskModal({ open, onClose, onSaved, initialProjectId = '', projects = [], users = [], editTask = null }) {
  const { notify } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    project_id: '',
    title: '',
    description: '',
    status: 'open',
    priority: 'normal',
    start_date: '',
    due_date: '',
    estimated_hours: 4,
    assigneeIds: [],
    tagsText: '',
  });

  useEffect(() => {
    if (!open) return;
    if (editTask) {
      setForm({
        project_id: editTask.project_id || '',
        title: editTask.title || '',
        description: editTask.description || '',
        status: editTask.status || 'open',
        priority: editTask.priority || 'normal',
        start_date: editTask.start_date ? String(editTask.start_date).slice(0, 10) : '',
        due_date: editTask.due_date ? String(editTask.due_date).slice(0, 10) : '',
        estimated_hours: editTask.estimated_hours ?? 0,
        assigneeIds: (editTask.assignees || []).map((a) => a.id),
        tagsText: (editTask.tags || []).map((t) => t.name).join(', '),
      });
    } else {
      setForm({
        project_id: initialProjectId || projects[0]?.id || '',
        title: '',
        description: '',
        status: 'open',
        priority: 'normal',
        start_date: new Date().toISOString().slice(0, 10),
        due_date: '',
        estimated_hours: 4,
        assigneeIds: [],
        tagsText: '',
      });
    }
  }, [open, editTask, initialProjectId, projects]);

  if (!open) return null;

  const toggleAssignee = (uid) => {
    setForm((prev) => ({
      ...prev,
      assigneeIds: prev.assigneeIds.includes(uid)
        ? prev.assigneeIds.filter((id) => id !== uid)
        : [...prev.assigneeIds, uid],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        project_id: form.project_id,
        title: form.title,
        description: form.description,
        status: form.status,
        priority: form.priority,
        start_date: form.start_date || null,
        due_date: form.due_date ? `${form.due_date}T17:00:00.000Z` : null,
        estimated_hours: Number(form.estimated_hours || 0),
        assigneeIds: form.assigneeIds,
        tags: form.tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };

      let res;
      if (editTask) {
        res = await apiRequest(`/api/tasks/${editTask.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        notify('Task updated.', 'success');
      } else {
        res = await apiRequest('/api/tasks', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify(`Created ${res.task.task_code}.`, 'success');
      }
      onSaved?.(res.task);
      onClose();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-xl glass-surface rounded-2xl overflow-hidden my-8">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            {editTask ? `Edit ${editTask.task_code}` : 'Create New Task'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Task Title
            </label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Deliver revised onboarding prototype"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Project
              </label>
              <select
                required
                disabled={Boolean(editTask)}
                value={form.project_id}
                onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                <option value="">Select project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Priority
                </label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                >
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Description & Requirements
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Outline deliverable format, acceptance criteria, and links..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Start Date
              </label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Due Date
              </label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Estimated Hours
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={form.estimated_hours}
                onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Assign Freelancers / Contributors
            </label>
            <div className="grid sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
              {users
                .filter((u) => u.status === 'active')
                .map((u) => {
                  const selected = form.assigneeIds.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md cursor-pointer text-xs ${
                        selected
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleAssignee(u.id)}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      <span className="truncate font-medium">{u.name}</span>
                      <span className="text-slate-400 text-[11px] ml-auto shrink-0">
                        {u.role === 'freelancer' ? 'Freelancer' : u.role_label?.split(' ')[0]}
                      </span>
                    </label>
                  );
                })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Tags (comma separated)
            </label>
            <input
              type="text"
              value={form.tagsText}
              onChange={(e) => setForm({ ...form, tagsText: e.target.value })}
              placeholder="design-system, deliverable, qa-review"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white"
            >
              {submitting ? 'Saving...' : editTask ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
