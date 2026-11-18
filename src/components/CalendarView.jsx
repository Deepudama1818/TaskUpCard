import { useEffect, useState, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import listPlugin from '@fullcalendar/react/list';
import interactionPlugin from '@fullcalendar/react/interaction';
import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/classic/theme.css';
import '@fullcalendar/react/themes/classic/palette.css';
import { AlertTriangle, Clock } from 'lucide-react';
import { apiRequest, formatDate, TASK_STATUSES } from '../utils/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

const PRIORITY_COLORS = {
  urgent: '#e11d48',
  high: '#d97706',
  normal: '#2563eb',
  low: '#475569',
};

export default function CalendarView({ projects = [], users = [], onOpenTask, refreshSignal, onTriggerRefresh }) {
  const { isPrivileged } = useAuth();
  const { notify } = useToast();

  const [events, setEvents] = useState([]);
  const [filters, setFilters] = useState({
    projectId: 'all',
    freelancerId: 'all',
    status: 'all',
  });

  const loadEvents = useCallback(async () => {
    try {
      const params = new URLSearchParams(filters);
      const res = await apiRequest(`/api/calendar?${params.toString()}`);
      const mapped = (res.events || []).map((ev) => {
        const bg = ev.extendedProps.isOverdue
          ? '#be123c'
          : PRIORITY_COLORS[ev.extendedProps.priority] || '#2563eb';
        return {
          ...ev,
          backgroundColor: bg,
          borderColor: bg,
          textColor: '#ffffff',
        };
      });
      setEvents(mapped);
    } catch (err) {
      notify(err.message, 'error');
    }
  }, [filters, notify]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents, refreshSignal]);

  const handleEventDrop = async (info) => {
    if (!isPrivileged) {
      info.revert();
      notify('Only managers and admins can reschedule task deadlines.', 'error');
      return;
    }
    const newDate = info.event.startStr;
    try {
      await apiRequest(`/api/calendar/${info.event.id}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({ due_date: `${newDate.slice(0, 10)}T17:00:00.000Z` }),
      });
      notify(`Rescheduled deadline to ${formatDate(newDate)}.`, 'success');
      loadEvents();
      onTriggerRefresh?.();
    } catch (err) {
      info.revert();
      notify(err.message, 'error');
    }
  };

  const upcoming = events
    .filter((ev) => ev.extendedProps.status !== 'completed' && ev.extendedProps.status !== 'cancelled')
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Deadline Calendar
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Track task due dates across monthly, weekly, daily, and agenda views.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-600" /> Urgent / Overdue
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-600" /> High
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-600" /> Normal
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-600" /> Low
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-surface rounded-2xl p-4 flex flex-wrap gap-3">
        <select
          value={filters.projectId}
          onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
        >
          <option value="all">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {isPrivileged && (
          <select
            value={filters.freelancerId}
            onChange={(e) => setFilters({ ...filters, freelancerId: e.target.value })}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          >
            <option value="all">All Freelancers</option>
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
        >
          <option value="all">All Statuses</option>
          {TASK_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-9 glass-surface rounded-2xl p-5">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
            }}
            events={events}
            editable={isPrivileged}
            eventDrop={handleEventDrop}
            eventClick={(info) => onOpenTask(info.event.id)}
            height="auto"
          />
        </div>

        <aside className="xl:col-span-3 glass-surface rounded-2xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200/70 dark:border-slate-800/70">
            <h2 className="font-display text-sm font-semibold">Upcoming & Overdue</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {upcoming.length === 0 ? (
              <p className="p-4 text-xs text-slate-400">No active deadlines scheduled.</p>
            ) : (
              upcoming.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onOpenTask(ev.id)}
                  className="w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 space-y-1"
                >
                  <div className="text-xs font-medium text-slate-900 dark:text-slate-100 line-clamp-2">
                    {ev.extendedProps.title}
                  </div>
                  <div className="flex items-center justify-between text-[11px] tabular-nums">
                    <span className="font-mono text-slate-400">{ev.extendedProps.task_code}</span>
                    {ev.extendedProps.isOverdue ? (
                      <span className="inline-flex items-center gap-1 text-rose-600 font-medium">
                        <AlertTriangle className="w-3 h-3" /> {formatDate(ev.start)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <Clock className="w-3 h-3" /> {formatDate(ev.start)}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
