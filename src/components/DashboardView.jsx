import { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { ArrowUpRight, Clock, AlertTriangle, Plus } from 'lucide-react';
import { apiRequest, formatDate, formatDateTime, getPriorityMeta, getStatusMeta, isTaskOverdue } from '../utils/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export default function DashboardView({ onOpenTask, onNavigate, onNewTask, refreshSignal }) {
  const { user, isPrivileged } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiRequest('/api/analytics/dashboard')
      .then((res) => {
        if (mounted) setData(res);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [refreshSignal]);

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-200/60 dark:bg-slate-800/60" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="h-72 rounded-xl bg-slate-200/60 dark:bg-slate-800/60" />
          <div className="h-72 rounded-xl bg-slate-200/60 dark:bg-slate-800/60" />
        </div>
      </div>
    );
  }

  const kpis = data?.kpis || {};

  const kpiCards = [
    { label: 'Total Tasks', value: kpis.total_tasks ?? 0, tone: 'text-slate-900 dark:text-white' },
    { label: 'Tasks To Do', value: kpis.todo_tasks ?? 0, tone: 'text-sky-600 dark:text-sky-400' },
    { label: 'In Progress', value: kpis.in_progress_tasks ?? 0, tone: 'text-blue-600 dark:text-blue-400' },
    { label: 'Completed', value: kpis.completed_tasks ?? 0, tone: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Overdue Tasks', value: kpis.overdue_tasks ?? 0, tone: 'text-rose-600 dark:text-rose-400' },
    { label: 'Upcoming (7d)', value: kpis.upcoming_deadlines ?? 0, tone: 'text-amber-600 dark:text-amber-400' },
    { label: 'Active Projects', value: kpis.active_projects ?? 0, tone: 'text-slate-900 dark:text-white' },
    { label: 'Total Freelancers', value: kpis.total_freelancers ?? 0, tone: 'text-slate-900 dark:text-white' },
  ];

  const statusChartData = {
    labels: ['To Do / Open', 'In Progress', 'Under Review', 'Revision Req.', 'Completed'],
    datasets: [
      {
        data: [
          kpis.todo_tasks || 0,
          kpis.in_progress_tasks || 0,
          kpis.under_review_tasks || 0,
          kpis.revision_tasks || 0,
          kpis.completed_tasks || 0,
        ],
        backgroundColor: ['#0ea5e9', '#2563eb', '#f59e0b', '#e11d48', '#16a34a'],
        borderWidth: 0,
      },
    ],
  };

  const projectProgress = data?.projectProgress || [];
  const projectBarData = {
    labels: projectProgress.map((p) => p.code),
    datasets: [
      {
        label: 'Completion %',
        data: projectProgress.map((p) => p.percentage),
        backgroundColor: '#2563eb',
        borderRadius: 6,
        barThickness: 28,
      },
    ],
  };

  return (
    <div className="space-y-8">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome back, {user?.name?.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isPrivileged
              ? 'Workspace delivery overview across projects, freelancers, and upcoming milestones.'
              : 'Your assigned deliverables, deadlines, and recent review updates.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('my-tasks')}
            className="px-4 py-2 text-sm font-medium rounded-lg glass-surface text-slate-700 dark:text-slate-200 hover:border-blue-500 transition-colors whitespace-nowrap"
          >
            View My Tasks
          </button>
          {isPrivileged && (
            <button
              type="button"
              onClick={onNewTask}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              New Task
            </button>
          )}
        </div>
      </div>

      {/* 8 KPI Widgets */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4" aria-label="Task metrics">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className="glass-surface rounded-2xl p-4 transition-transform duration-150 hover:-translate-y-0.5"
          >
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {card.label}
            </div>
            <div className={`mt-2 text-2xl font-display font-bold tabular-nums ${card.tone}`}>
              {card.value}
            </div>
          </div>
        ))}
      </section>

      {/* Analytics Charts */}
      <section className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 glass-surface rounded-2xl p-5">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Task Completion Breakdown
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Live distribution across active workflow stages
          </p>
          <div className="mt-5 h-56 flex items-center justify-center">
            {kpis.total_tasks > 0 ? (
              <Doughnut
                data={statusChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: '66%',
                  plugins: {
                    legend: { position: 'right', labels: { boxWidth: 10, padding: 14 } },
                  },
                }}
              />
            ) : (
              <p className="text-sm text-slate-400">No tasks recorded yet.</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 glass-surface rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Project Progress
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Completion percentage by active project
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('projects')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              All projects <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="mt-5 h-56">
            {projectProgress.length > 0 ? (
              <Bar
                data={projectBarData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } },
                  },
                  plugins: { legend: { display: false } },
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                No project data available.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Recently Assigned & Upcoming Deadlines */}
      <section className="grid lg:grid-cols-2 gap-6">
        {/* Recently Assigned */}
        <div className="glass-surface rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/70 dark:border-slate-800/70 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Recently Assigned Tasks</h2>
            <button
              type="button"
              onClick={() => onNavigate(isPrivileged ? 'all-tasks' : 'my-tasks')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Open board
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data?.recentTasks || []).length === 0 ? (
              <p className="p-5 text-sm text-slate-400">No tasks assigned yet.</p>
            ) : (
              data.recentTasks.map((task) => {
                const statusMeta = getStatusMeta(task.status);
                const priorityMeta = getPriorityMeta(task.priority);
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    className="w-full px-5 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {task.title}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono">{task.task_code}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{task.project_name}</span>
                        <span aria-hidden="true">·</span>
                        <span className={priorityMeta.textColor}>{priorityMeta.label}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-xs font-medium ${statusMeta.textColor}`}>
                        {statusMeta.label}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400 tabular-nums">
                        {formatDate(task.due_date)}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div className="glass-surface rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/70 dark:border-slate-800/70 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Upcoming Deadlines</h2>
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              View calendar
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data?.upcomingDeadlines || []).length === 0 ? (
              <p className="p-5 text-sm text-slate-400">No upcoming deadlines.</p>
            ) : (
              data.upcomingDeadlines.map((task) => {
                const overdue = isTaskOverdue(task);
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    className="w-full px-5 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {task.title}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono">{task.task_code}</span>
                        <span aria-hidden="true">·</span>
                        <span>{task.project_name}</span>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5 text-xs font-medium tabular-nums">
                      {overdue ? (
                        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Overdue · {formatDate(task.due_date)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {formatDate(task.due_date)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* Freelancer Workload (Admin / PM) + Recent Activity */}
      <section className="grid lg:grid-cols-12 gap-6">
        {isPrivileged && (
          <div className="lg:col-span-6 glass-surface rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200/70 dark:border-slate-800/70 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Freelancer Workload</h2>
              <button
                type="button"
                onClick={() => onNavigate('freelancers')}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Directory
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="text-left font-medium px-5 py-2.5">Contributor</th>
                    <th className="text-right font-medium px-4 py-2.5">Active</th>
                    <th className="text-right font-medium px-5 py-2.5">Completed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(data?.freelancerWorkload || []).map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar user={f} size="sm" />
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                              {f.name}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {f.specialty || 'Freelancer'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-blue-600 dark:text-blue-400 font-medium">
                        {f.active_count}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                        {f.completed_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className={`${isPrivileged ? 'lg:col-span-6' : 'lg:col-span-12'} glass-surface rounded-2xl overflow-hidden`}>
          <div className="px-5 py-4 border-b border-slate-200/70 dark:border-slate-800/70">
            <h2 className="font-display text-base font-semibold">Recent Activity</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data?.recentActivity || []).length === 0 ? (
              <p className="p-5 text-sm text-slate-400">No recent activity logged.</p>
            ) : (
              data.recentActivity.map((act) => (
                <div key={act.id} className="px-5 py-3 flex items-start gap-3">
                  <Avatar user={{ name: act.actor_name, avatar_url: act.actor_avatar }} size="xs" className="mt-0.5" />
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {act.actor_name || 'System'}
                    </span>{' '}
                    <span className="text-slate-600 dark:text-slate-400">
                      {act.action.replace(/_/g, ' ')}
                    </span>
                    {act.task_code && (
                      <>
                        {' · '}
                        <button
                          type="button"
                          onClick={() => act.task_id && onOpenTask(act.task_id)}
                          className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {act.task_code}
                        </button>
                      </>
                    )}
                    <div className="text-xs text-slate-400 mt-0.5 tabular-nums">
                      {formatDateTime(act.created_at)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
