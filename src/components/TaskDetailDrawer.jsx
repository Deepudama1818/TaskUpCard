import { useEffect, useState, useCallback, useRef } from 'react';
import {
  X,
  Paperclip,
  Download,
  Trash2,
  Send,
  Plus,
  CheckSquare,
  Square,
  Clock,
  Eye,
  Reply,
  Edit3,
  Tag,
  History,
  MessageSquare,
} from 'lucide-react';
import {
  apiRequest,
  downloadProtectedFile,
  formatBytes,
  formatDate,
  formatDateTime,
  getPriorityMeta,
  getStatusMeta,
  isTaskOverdue,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '../utils/api.js';
import { getSocket } from '../utils/socket.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Avatar from './Avatar.jsx';

export default function TaskDetailDrawer({ taskId, users = [], onClose, onTaskMutated }) {
  const { user, isPrivileged } = useAuth();
  const { notify, confirm } = useToast();

  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(false);

  // Editable fields
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');

  // Subtasks, Checklists, Tags, Time
  const [newSubtask, setNewSubtask] = useState('');
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [checklistItemDrafts, setChecklistItemDrafts] = useState({});
  const [newTag, setNewTag] = useState('');
  const [timeHours, setTimeHours] = useState('');
  const [timeDesc, setTimeDesc] = useState('');

  // Comments + @mentions + Attachments
  const [commentBody, setCommentBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [commentFiles, setCommentFiles] = useState([]);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentBody, setEditingCommentBody] = useState('');
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [rightTab, setRightTab] = useState('comments'); // comments | activity

  const fileInputRef = useRef(null);
  const commentFileRef = useRef(null);

  const loadDetail = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const res = await apiRequest(`/api/tasks/${taskId}`);
      setTask(res.task);
      setTitleDraft(res.task.title);
      setDescDraft(res.task.description || '');
    } catch (err) {
      notify(err.message, 'error');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [taskId, notify, onClose]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // Real-time Socket.IO room subscription for this task
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !taskId) return;

    socket.emit('task:join', taskId);

    const onTaskUpdated = (updatedTask) => {
      if (updatedTask?.id === taskId) {
        setTask(updatedTask);
      }
    };
    const onCommentCreated = (comment) => {
      if (comment?.task_id !== taskId) return;
      setTask((prev) => {
        if (!prev) return prev;
        if (prev.comments.some((c) => c.id === comment.id)) return prev; // Idempotency guard
        return { ...prev, comments: [...prev.comments, comment] };
      });
    };
    const onCommentUpdated = (comment) => {
      setTask((prev) =>
        prev
          ? {
              ...prev,
              comments: prev.comments.map((c) =>
                c.id === comment.id ? { ...c, body: comment.body, is_edited: true } : c
              ),
            }
          : prev
      );
    };
    const onCommentDeleted = ({ id }) => {
      setTask((prev) =>
        prev ? { ...prev, comments: prev.comments.filter((c) => c.id !== id) } : prev
      );
    };
    const onAttachmentUploaded = ({ attachments }) => {
      setTask((prev) => {
        if (!prev) return prev;
        const existingIds = new Set(prev.attachments.map((a) => a.id));
        const fresh = (attachments || []).filter((a) => !existingIds.has(a.id));
        return { ...prev, attachments: [...fresh, ...prev.attachments] };
      });
    };
    const onAttachmentDeleted = ({ id }) => {
      setTask((prev) =>
        prev ? { ...prev, attachments: prev.attachments.filter((a) => a.id !== id) } : prev
      );
    };

    socket.on('task:updated', onTaskUpdated);
    socket.on('comment:created', onCommentCreated);
    socket.on('comment:updated', onCommentUpdated);
    socket.on('comment:deleted', onCommentDeleted);
    socket.on('attachment:uploaded', onAttachmentUploaded);
    socket.on('attachment:deleted', onAttachmentDeleted);

    return () => {
      socket.emit('task:leave', taskId);
      socket.off('task:updated', onTaskUpdated);
      socket.off('comment:created', onCommentCreated);
      socket.off('comment:updated', onCommentUpdated);
      socket.off('comment:deleted', onCommentDeleted);
      socket.off('attachment:uploaded', onAttachmentUploaded);
      socket.off('attachment:deleted', onAttachmentDeleted);
    };
  }, [taskId]);

  if (!taskId) return null;

  const patchTask = async (payload, toastMsg = null) => {
    try {
      const res = await apiRequest(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setTask(res.task);
      onTaskMutated?.();
      if (toastMsg) notify(toastMsg, 'success');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleToggleAssignee = (uid) => {
    if (!isPrivileged || !task) return;
    const current = task.assignees.map((a) => a.id);
    const next = current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid];
    patchTask({ assigneeIds: next }, 'Assignees updated.');
  };

  const handleAddTag = (e) => {
    e.preventDefault();
    const cleaned = newTag.trim().toLowerCase();
    if (!cleaned || !isPrivileged) return;
    const existing = task.tags.map((t) => t.name);
    if (!existing.includes(cleaned)) {
      patchTask({ tags: [...existing, cleaned] });
    }
    setNewTag('');
  };

  const handleRemoveTag = (tagName) => {
    if (!isPrivileged) return;
    patchTask({ tags: task.tags.map((t) => t.name).filter((n) => n !== tagName) });
  };

  const handleAddSubtask = async (e) => {
    e.preventDefault();
    if (!newSubtask.trim()) return;
    try {
      const res = await apiRequest(`/api/tasks/${taskId}/subtasks`, {
        method: 'POST',
        body: JSON.stringify({ title: newSubtask.trim() }),
      });
      setTask(res.task);
      setNewSubtask('');
      onTaskMutated?.();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleToggleSubtask = async (st) => {
    try {
      const res = await apiRequest(`/api/tasks/${taskId}/subtasks/${st.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_completed: !st.is_completed }),
      });
      setTask(res.task);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleDeleteSubtask = async (stId) => {
    try {
      const res = await apiRequest(`/api/tasks/${taskId}/subtasks/${stId}`, { method: 'DELETE' });
      setTask(res.task);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleAddChecklist = async (e) => {
    e.preventDefault();
    if (!newChecklistTitle.trim()) return;
    try {
      const res = await apiRequest(`/api/tasks/${taskId}/checklists`, {
        method: 'POST',
        body: JSON.stringify({ title: newChecklistTitle.trim() }),
      });
      setTask(res.task);
      setNewChecklistTitle('');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleAddChecklistItem = async (e, checklistId) => {
    e.preventDefault();
    const label = (checklistItemDrafts[checklistId] || '').trim();
    if (!label) return;
    try {
      const res = await apiRequest(`/api/tasks/${taskId}/checklists/${checklistId}/items`, {
        method: 'POST',
        body: JSON.stringify({ label }),
      });
      setTask(res.task);
      setChecklistItemDrafts((prev) => ({ ...prev, [checklistId]: '' }));
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleToggleChecklistItem = async (item) => {
    try {
      const res = await apiRequest(`/api/tasks/${taskId}/checklist-items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_checked: !item.is_checked }),
      });
      setTask(res.task);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleLogTime = async (e) => {
    e.preventDefault();
    if (!timeHours || Number(timeHours) <= 0) return;
    try {
      const res = await apiRequest(`/api/tasks/${taskId}/time-entries`, {
        method: 'POST',
        body: JSON.stringify({ hours: Number(timeHours), description: timeDesc }),
      });
      setTask(res.task);
      setTimeHours('');
      setTimeDesc('');
      notify('Time logged.', 'success');
      onTaskMutated?.();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleToggleWatch = async () => {
    const watching = task.watchers.some((w) => w.id === user.id);
    try {
      const res = watching
        ? await apiRequest(`/api/tasks/${taskId}/watchers/${user.id}`, { method: 'DELETE' })
        : await apiRequest(`/api/tasks/${taskId}/watchers`, { method: 'POST', body: JSON.stringify({}) });
      setTask(res.task);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleUploadAttachments = async (filesList) => {
    if (!filesList || filesList.length === 0) return;
    setUploadingFiles(true);
    try {
      const formData = new FormData();
      Array.from(filesList).forEach((f) => formData.append('files', f));
      await apiRequest(`/api/files/task/${taskId}`, { method: 'POST', body: formData });
      notify('File(s) uploaded.', 'success');
      loadDetail();
      onTaskMutated?.();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleDeleteAttachment = async (attId) => {
    const ok = await confirm({
      title: 'Delete attachment?',
      message: 'This file will be permanently removed from task storage.',
      confirmLabel: 'Delete File',
      danger: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/api/files/${attId}`, { method: 'DELETE' });
      notify('Attachment removed.', 'success');
      loadDetail();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleCommentInputChange = (val) => {
    setCommentBody(val);
    const match = val.match(/@([a-zA-Z0-9._-]*)$/);
    if (match) {
      setMentionQuery(match[1].toLowerCase());
      setShowMentionMenu(true);
    } else {
      setShowMentionMenu(false);
    }
  };

  const insertMention = (username) => {
    setCommentBody((prev) => prev.replace(/@([a-zA-Z0-9._-]*)$/, `@${username} `));
    setShowMentionMenu(false);
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!commentBody.trim() && commentFiles.length === 0) return;
    try {
      const formData = new FormData();
      formData.append('body', commentBody.trim());
      if (replyTo) formData.append('parent_id', replyTo.id);
      commentFiles.forEach((f) => formData.append('files', f));

      const res = await apiRequest(`/api/comments/${taskId}`, {
        method: 'POST',
        body: formData,
      });
      setTask((prev) => {
        if (!prev) return prev;
        if (prev.comments.some((c) => c.id === res.comment.id)) return prev;
        return { ...prev, comments: [...prev.comments, res.comment] };
      });
      setCommentBody('');
      setReplyTo(null);
      setCommentFiles([]);
      onTaskMutated?.();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleSaveCommentEdit = async (commentId) => {
    if (!editingCommentBody.trim()) return;
    try {
      await apiRequest(`/api/comments/${taskId}/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: editingCommentBody.trim() }),
      });
      setEditingCommentId(null);
      setEditingCommentBody('');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await apiRequest(`/api/comments/${taskId}/${commentId}`, { method: 'DELETE' });
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const isWatching = task?.watchers?.some((w) => w.id === user.id);
  const mentionCandidates = users
    .filter((u) => u.status === 'active')
    .filter(
      (u) =>
        !mentionQuery ||
        u.username.toLowerCase().includes(mentionQuery) ||
        u.name.toLowerCase().includes(mentionQuery)
    )
    .slice(0, 5);

  const rootComments = (task?.comments || []).filter((c) => !c.parent_id);
  const repliesByParent = (task?.comments || []).reduce((acc, c) => {
    if (c.parent_id) {
      if (!acc[c.parent_id]) acc[c.parent_id] = [];
      acc[c.parent_id].push(c);
    }
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-sm">
      <div className="w-full max-w-5xl glass-chrome h-full shadow-2xl border-l border-slate-200/80 dark:border-slate-800/80 flex flex-col">
        {/* Top bar */}
        <header className="px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
              {task?.task_code || 'Loading...'}
            </span>
            {task && (
              <>
                <span className="text-slate-300 dark:text-slate-700">/</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {task.project_code} · {task.project_name}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {task && (
              <button
                type="button"
                onClick={handleToggleWatch}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  isWatching
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                {isWatching ? 'Watching' : 'Watch'} ({task.watchers.length})
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close task detail"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {loading || !task ? (
          <div className="flex-1 p-8 space-y-4">
            <div className="nx3-skeleton h-8 w-2/3 rounded" />
            <div className="nx3-skeleton h-24 w-full rounded" />
          </div>
        ) : (
          <div className="flex-1 grid lg:grid-cols-12 overflow-hidden">
            {/* Left Main Workspace */}
            <div className="lg:col-span-7 overflow-y-auto p-6 space-y-7 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800">
              {/* 1. Title & Status/Priority Bar */}
              <div className="space-y-4">
                {editingTitle && isPrivileged ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setEditingTitle(false);
                      if (titleDraft.trim() && titleDraft !== task.title) {
                        patchTask({ title: titleDraft.trim() }, 'Title updated.');
                      }
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      autoFocus
                      className="flex-1 px-3 py-1.5 text-lg font-display font-bold rounded-lg border border-blue-500 bg-slate-50 dark:bg-slate-950"
                    />
                    <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg">
                      Save
                    </button>
                  </form>
                ) : (
                  <h2
                    onClick={() => isPrivileged && setEditingTitle(true)}
                    className={`font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-snug ${
                      isPrivileged ? 'cursor-pointer hover:text-blue-600 dark:hover:text-blue-400' : ''
                    }`}
                  >
                    {task.title}
                  </h2>
                )}

                {/* Quick Properties Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Status</label>
                    <select
                      value={task.status}
                      onChange={(e) => patchTask({ status: e.target.value }, 'Status updated.')}
                      className={`w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 ${getStatusMeta(task.status).textColor}`}
                    >
                      {TASK_STATUSES.map((s) => (
                        <option key={s.value} value={s.value} className="text-slate-900 dark:text-slate-100">
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Priority</label>
                    <select
                      disabled={!isPrivileged}
                      value={task.priority}
                      onChange={(e) => patchTask({ priority: e.target.value }, 'Priority updated.')}
                      className={`w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 disabled:opacity-75 ${getPriorityMeta(task.priority).textColor}`}
                    >
                      {TASK_PRIORITIES.map((p) => (
                        <option key={p.value} value={p.value} className="text-slate-900 dark:text-slate-100">
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Start Date</label>
                    <input
                      type="date"
                      disabled={!isPrivileged}
                      value={task.start_date ? String(task.start_date).slice(0, 10) : ''}
                      onChange={(e) => patchTask({ start_date: e.target.value || null }, 'Start date updated.')}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 tabular-nums disabled:opacity-75"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Deadline {isTaskOverdue(task) && <span className="text-rose-600">(Overdue)</span>}
                    </label>
                    <input
                      type="date"
                      disabled={!isPrivileged}
                      value={task.due_date ? String(task.due_date).slice(0, 10) : ''}
                      onChange={(e) =>
                        patchTask(
                          { due_date: e.target.value ? `${e.target.value}T17:00:00.000Z` : null },
                          'Deadline updated.'
                        )
                      }
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 tabular-nums disabled:opacity-75"
                    />
                  </div>
                </div>
              </div>

              {/* Meta: Creator, Assignees, Tags */}
              <div className="grid sm:grid-cols-2 gap-4 py-4 border-y border-slate-100 dark:border-slate-800 text-xs">
                <div className="space-y-2">
                  <div className="text-slate-400 font-medium">Assigned Freelancers</div>
                  <div className="flex flex-wrap gap-2 items-center">
                    {task.assignees.map((a) => (
                      <span
                        key={a.id}
                        className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200"
                      >
                        <Avatar user={a} size="xs" />
                        <span>{a.name}</span>
                      </span>
                    ))}
                    {task.assignees.length === 0 && <span className="text-slate-400">Unassigned</span>}
                  </div>
                  {isPrivileged && (
                    <select
                      value=""
                      onChange={(e) => e.target.value && handleToggleAssignee(e.target.value)}
                      className="mt-1 px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                    >
                      <option value="">+ Toggle assignee...</option>
                      {users
                        .filter((u) => u.status === 'active')
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {task.assignees.some((a) => a.id === u.id) ? '✓ ' : ''}
                            {u.name} ({u.role_label})
                          </option>
                        ))}
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-slate-400 font-medium">Created By & Tags</div>
                  <div className="text-slate-700 dark:text-slate-300">
                    Creator: <span className="font-medium">{task.creator_name || 'System'}</span>
                    <span className="text-slate-400"> · {formatDate(task.assigned_date || task.created_at)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag className="w-3.5 h-3.5 text-slate-400" />
                    {task.tags.map((tg) => (
                      <span key={tg.id} className="text-xs text-slate-600 dark:text-slate-300 font-mono">
                        #{tg.name}
                        {isPrivileged && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tg.name)}
                            className="ml-1 text-slate-400 hover:text-rose-500"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                    {isPrivileged && (
                      <form onSubmit={handleAddTag} className="inline-flex">
                        <input
                          type="text"
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          placeholder="+ tag"
                          className="w-20 px-1.5 py-0.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-transparent"
                        />
                      </form>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Description */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Description
                  </h3>
                  {isPrivileged && !editingDesc && (
                    <button
                      type="button"
                      onClick={() => setEditingDesc(true)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {editingDesc ? (
                  <div className="space-y-2">
                    <textarea
                      rows={4}
                      value={descDraft}
                      onChange={(e) => setDescDraft(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDesc(false);
                          patchTask({ description: descDraft }, 'Description updated.');
                        }}
                        className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg"
                      >
                        Save Description
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDesc(false);
                          setDescDraft(task.description || '');
                        }}
                        className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {task.description || 'No description provided.'}
                  </p>
                )}
              </section>

              {/* 3. Subtasks */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Subtasks ({task.subtasks.filter((s) => s.is_completed).length}/{task.subtasks.length})
                </h3>
                <div className="space-y-1.5">
                  {task.subtasks.map((st) => (
                    <div
                      key={st.id}
                      className="flex items-center justify-between gap-3 py-1.5 px-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 group"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSubtask(st)}
                        className="flex items-center gap-2.5 text-sm text-left flex-1 min-w-0"
                      >
                        {st.is_completed ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className={st.is_completed ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}>
                          {st.title}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSubtask(st.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 p-1"
                        aria-label="Delete subtask"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleAddSubtask} className="flex gap-2">
                  <input
                    type="text"
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    placeholder="Add a subtask..."
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Add
                  </button>
                </form>
              </section>

              {/* 4. Checklists */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Checklists
                  </h3>
                </div>
                {task.checklists.map((cl) => (
                  <div
                    key={cl.id}
                    className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <span>{cl.title}</span>
                      <span className="font-mono text-slate-400 tabular-nums">
                        {cl.items.filter((i) => i.is_checked).length}/{cl.items.length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {cl.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleToggleChecklistItem(item)}
                          className="w-full flex items-center gap-2 text-left text-sm py-1"
                        >
                          {item.is_checked ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <span className={item.is_checked ? 'line-through text-slate-400' : ''}>
                            {item.label}
                          </span>
                        </button>
                      ))}
                    </div>
                    <form onSubmit={(e) => handleAddChecklistItem(e, cl.id)} className="flex gap-2">
                      <input
                        type="text"
                        value={checklistItemDrafts[cl.id] || ''}
                        onChange={(e) =>
                          setChecklistItemDrafts((prev) => ({ ...prev, [cl.id]: e.target.value }))
                        }
                        placeholder="Add checklist item..."
                        className="flex-1 px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                      />
                      <button type="submit" className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded">
                        Add
                      </button>
                    </form>
                  </div>
                ))}
                <form onSubmit={handleAddChecklist} className="flex gap-2">
                  <input
                    type="text"
                    value={newChecklistTitle}
                    onChange={(e) => setNewChecklistTitle(e.target.value)}
                    placeholder="New checklist title..."
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Plus className="w-3.5 h-3.5" /> Checklist
                  </button>
                </form>
              </section>

              {/* 5. Time Tracking */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Time Tracking
                  </h3>
                  <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    {task.actual_hours}h logged / {task.estimated_hours}h est.
                  </span>
                </div>
                <form onSubmit={handleLogTime} className="flex flex-wrap gap-2">
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    value={timeHours}
                    onChange={(e) => setTimeHours(e.target.value)}
                    placeholder="Hours (e.g. 2.5)"
                    className="w-32 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 tabular-nums"
                  />
                  <input
                    type="text"
                    value={timeDesc}
                    onChange={(e) => setTimeDesc(e.target.value)}
                    placeholder="Work summary..."
                    className="flex-1 min-w-[160px] px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                  >
                    <Clock className="w-3.5 h-3.5" /> Log Time
                  </button>
                </form>
                {task.time_entries.length > 0 && (
                  <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                    {task.time_entries.map((te) => (
                      <div key={te.id} className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                        <span>
                          <strong className="text-slate-700 dark:text-slate-200">{te.user_name}</strong> ·{' '}
                          {te.description || 'Logged session'}
                        </span>
                        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                          {te.hours}h · {formatDate(te.logged_date)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 6. Deliverable Attachments */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Attachments & Deliverables ({task.attachments.length})
                  </h3>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.zip"
                      onChange={(e) => handleUploadAttachments(e.target.files)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={uploadingFiles}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      {uploadingFiles ? 'Uploading...' : 'Upload Deliverable'}
                    </button>
                  </div>
                </div>

                {task.attachments.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Supports PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, PNG, JPG, and ZIP up to 15 MB.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                    {task.attachments.map((att) => (
                      <div key={att.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                            {att.original_name}
                          </div>
                          <div className="text-slate-400 mt-0.5 tabular-nums">
                            {formatBytes(att.file_size)} · Uploaded by {att.uploaded_by_name || 'User'} · {formatDateTime(att.created_at)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => downloadProtectedFile(att.id, att.original_name)}
                            className="p-1.5 rounded text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Download file"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {(att.uploaded_by === user.id || isPrivileged) && (
                            <button
                              type="button"
                              onClick={() => handleDeleteAttachment(att.id)}
                              className="p-1.5 rounded text-slate-500 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Delete file"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Right Collaboration Sidebar: Comments & Activity History */}
            <div className="lg:col-span-5 flex flex-col h-full overflow-hidden bg-slate-50/70 dark:bg-slate-950/40">
              <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setRightTab('comments')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg ${
                    rightTab === 'comments'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Discussion ({task.comments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('activity')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg ${
                    rightTab === 'activity'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  Activity ({task.activities.length})
                </button>
              </div>

              {rightTab === 'comments' ? (
                <>
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {rootComments.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-8">
                        No comments yet. Mention teammates with <span className="font-mono">@username</span> to notify them in real time.
                      </p>
                    ) : (
                      rootComments.map((comment) => {
                        const replies = repliesByParent[comment.id] || [];
                        return (
                          <div key={comment.id} className="space-y-2.5">
                            <div className="glass-surface rounded-xl p-3.5 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Avatar
                                    user={{ name: comment.author_name, avatar_url: comment.author_avatar }}
                                    size="xs"
                                  />
                                  <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                    {comment.author_name}
                                  </span>
                                  <span className="text-[11px] text-slate-400 truncate">
                                    {comment.author_role}
                                  </span>
                                </div>
                                <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                                  {formatDateTime(comment.created_at)}
                                  {comment.is_edited ? ' (edited)' : ''}
                                </span>
                              </div>

                              {editingCommentId === comment.id ? (
                                <div className="space-y-2">
                                  <textarea
                                    rows={2}
                                    value={editingCommentBody}
                                    onChange={(e) => setEditingCommentBody(e.target.value)}
                                    className="w-full px-2.5 py-1.5 text-sm rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveCommentEdit(comment.id)}
                                      className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingCommentId(null)}
                                      className="px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                                  {comment.body}
                                </p>
                              )}

                              {comment.attachments?.length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {comment.attachments.map((ca) => (
                                    <button
                                      key={ca.id}
                                      type="button"
                                      onClick={() => downloadProtectedFile(ca.id, ca.original_name)}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                                    >
                                      <Download className="w-3 h-3 text-blue-600" />
                                      {ca.original_name}
                                    </button>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-400">
                                <button
                                  type="button"
                                  onClick={() => setReplyTo(comment)}
                                  className="inline-flex items-center gap-1 hover:text-blue-600"
                                >
                                  <Reply className="w-3 h-3" /> Reply
                                </button>
                                {comment.user_id === user.id && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCommentId(comment.id);
                                      setEditingCommentBody(comment.body);
                                    }}
                                    className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
                                  >
                                    <Edit3 className="w-3 h-3" /> Edit
                                  </button>
                                )}
                                {(comment.user_id === user.id || isPrivileged) && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteComment(comment.id)}
                                    className="inline-flex items-center gap-1 hover:text-rose-600"
                                  >
                                    <Trash2 className="w-3 h-3" /> Delete
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Threaded replies */}
                            {replies.length > 0 && (
                              <div className="pl-6 space-y-2 border-l border-slate-200 dark:border-slate-800">
                                {replies.map((rep) => (
                                  <div
                                    key={rep.id}
                                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-1.5"
                                  >
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="font-semibold text-slate-900 dark:text-white">
                                        {rep.author_name}
                                      </span>
                                      <span className="text-[11px] text-slate-400 tabular-nums">
                                        {formatDateTime(rep.created_at)}
                                      </span>
                                    </div>
                                    <p className="text-sm text-slate-700 dark:text-slate-300">{rep.body}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Comment Composer */}
                  <form
                    onSubmit={handlePostComment}
                    className="p-4 border-t border-slate-200/70 dark:border-slate-800/70 glass-chrome space-y-2.5 relative shrink-0"
                  >
                    {showMentionMenu && mentionCandidates.length > 0 && (
                      <div className="absolute bottom-full left-4 right-4 mb-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden z-20">
                        {mentionCandidates.map((mc) => (
                          <button
                            key={mc.id}
                            type="button"
                            onClick={() => insertMention(mc.username)}
                            className="w-full px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between"
                          >
                            <span className="font-medium text-slate-900 dark:text-white">{mc.name}</span>
                            <span className="font-mono text-slate-400">@{mc.username}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {replyTo && (
                      <div className="flex items-center justify-between text-xs bg-blue-50 dark:bg-blue-950/40 px-3 py-1.5 rounded-md text-blue-700 dark:text-blue-300">
                        <span>Replying to {replyTo.author_name}</span>
                        <button type="button" onClick={() => setReplyTo(null)} className="underline">
                          Cancel
                        </button>
                      </div>
                    )}

                    <textarea
                      rows={2}
                      value={commentBody}
                      onChange={(e) => handleCommentInputChange(e.target.value)}
                      placeholder="Write a comment or @mention a teammate..."
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />

                    {commentFiles.length > 0 && (
                      <div className="text-xs text-slate-500">
                        Attached: {commentFiles.map((f) => f.name).join(', ')}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div>
                        <input
                          ref={commentFileRef}
                          type="file"
                          multiple
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.zip"
                          onChange={(e) => setCommentFiles(Array.from(e.target.files || []))}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => commentFileRef.current?.click()}
                          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                        >
                          <Paperclip className="w-3.5 h-3.5" /> Attach file
                        </button>
                      </div>

                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Send className="w-3.5 h-3.5" /> Send
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {task.activities.map((act) => (
                    <div key={act.id} className="flex items-start gap-2.5 text-xs">
                      <Avatar
                        user={{ name: act.actor_name, avatar_url: act.actor_avatar }}
                        size="xs"
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {act.actor_name || 'System'}
                        </span>{' '}
                        <span className="text-slate-600 dark:text-slate-400">
                          {act.action.replace(/_/g, ' ')}
                        </span>
                        {act.details?.from && act.details?.to && (
                          <span className="text-slate-500">
                            {' '}
                            ({act.details.from} → {act.details.to})
                          </span>
                        )}
                        <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                          {formatDateTime(act.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
