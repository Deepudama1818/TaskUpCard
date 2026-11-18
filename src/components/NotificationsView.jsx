import { useState } from 'react';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { apiRequest, formatDateTime } from '../utils/api.js';
import { useToast } from '../context/ToastContext.jsx';
import Avatar from './Avatar.jsx';

export default function NotificationsView({
  notifications = [],
  onRefreshNotifications,
  onOpenTask,
}) {
  const { notify } = useToast();
  const [filter, setFilter] = useState('all'); // all | unread

  const filtered = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;

  const markRead = async (n) => {
    try {
      if (!n.is_read) {
        await apiRequest(`/api/notifications/${n.id}/read`, { method: 'PATCH' });
        onRefreshNotifications?.();
      }
      if (n.task_id) {
        onOpenTask(n.task_id);
      }
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const markAllRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'PATCH' });
      notify('All notifications marked as read.', 'success');
      onRefreshNotifications?.();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Real-time alerts for task assignments, @mentions, comments, revisions, and deadlines.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                filter === 'all' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                filter === 'unread' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Unread ({notifications.filter((n) => !n.is_read).length})
            </button>
          </div>

          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <CheckCheck className="w-3.5 h-3.5" /> Mark All Read
          </button>
        </div>
      </div>

      <div className="glass-surface rounded-2xl overflow-hidden divide-y divide-slate-100/80 dark:divide-slate-800/80">
        {filtered.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Bell className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              You are all caught up
            </p>
            <p className="text-xs text-slate-400">
              New task assignments, mentions, and deadline reminders will appear here.
            </p>
          </div>
        ) : (
          filtered.map((n) => (
            <div
              key={n.id}
              onClick={() => markRead(n)}
              className={`px-5 py-4 flex items-start justify-between gap-4 cursor-pointer transition-colors ${
                n.is_read
                  ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  : 'bg-blue-50/40 dark:bg-blue-950/20 hover:bg-blue-50/70 dark:hover:bg-blue-950/30'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <Avatar
                  user={{ name: n.actor_name || 'TaskUpCard', avatar_url: n.actor_avatar }}
                  size="sm"
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${n.is_read ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>
                      {n.title}
                    </span>
                    {!n.is_read && (
                      <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                        New
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {n.message}
                  </p>
                  <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                    {formatDateTime(n.created_at)}
                  </div>
                </div>
              </div>

              {!n.is_read && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    apiRequest(`/api/notifications/${n.id}/read`, { method: 'PATCH' }).then(onRefreshNotifications);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-white dark:hover:bg-slate-800 shrink-0"
                  title="Mark as read"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
