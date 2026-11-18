const TOKEN_KEY = 'taskupcard_jwt';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiRequest(path, options = {}) {
  const token = getToken();
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof data === 'object' && data?.error ? data.error : `Request failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  return data;
}

export async function downloadProtectedFile(fileId, fileName) {
  const token = getToken();
  const response = await fetch(`/api/files/${fileId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error('Failed to download file.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'attachment';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const TASK_STATUSES = [
  { value: 'open', label: 'Open', textColor: 'text-slate-600 dark:text-slate-300', dotColor: 'bg-slate-400' },
  { value: 'todo', label: 'To Do', textColor: 'text-sky-700 dark:text-sky-400', dotColor: 'bg-sky-500' },
  { value: 'in_progress', label: 'In Progress', textColor: 'text-blue-700 dark:text-blue-400', dotColor: 'bg-blue-600' },
  { value: 'under_review', label: 'Under Review', textColor: 'text-amber-700 dark:text-amber-400', dotColor: 'bg-amber-500' },
  { value: 'revision_required', label: 'Revision Required', textColor: 'text-rose-700 dark:text-rose-400', dotColor: 'bg-rose-600' },
  { value: 'completed', label: 'Completed', textColor: 'text-emerald-700 dark:text-emerald-400', dotColor: 'bg-emerald-600' },
  { value: 'cancelled', label: 'Cancelled', textColor: 'text-slate-500 dark:text-slate-500', dotColor: 'bg-slate-400' },
];

export const TASK_PRIORITIES = [
  { value: 'urgent', label: 'Urgent', textColor: 'text-rose-700 dark:text-rose-400', marker: 'P1' },
  { value: 'high', label: 'High', textColor: 'text-amber-700 dark:text-amber-400', marker: 'P2' },
  { value: 'normal', label: 'Normal', textColor: 'text-blue-700 dark:text-blue-400', marker: 'P3' },
  { value: 'low', label: 'Low', textColor: 'text-slate-500 dark:text-slate-400', marker: 'P4' },
];

export const PROJECT_STATUSES = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

export function getStatusMeta(status) {
  return TASK_STATUSES.find((s) => s.value === status) || TASK_STATUSES[0];
}

export function getPriorityMeta(priority) {
  return TASK_PRIORITIES.find((p) => p.value === priority) || TASK_PRIORITIES[2];
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatBytes(bytes) {
  const num = Number(bytes || 0);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

export function isTaskOverdue(task) {
  if (!task?.due_date) return false;
  if (task.status === 'completed' || task.status === 'cancelled') return false;
  return new Date(task.due_date).getTime() < Date.now();
}
