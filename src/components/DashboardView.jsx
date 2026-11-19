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
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCheck,
  CircleAlert,
  CircleDashed,
  Clock,
  FolderKanban,
  ListTodo,
  Play,
  Plus,
  UsersRound,
} from 'lucide-react';
import { apiRequest, formatDate, formatDateTime, getPriorityMeta, getStatusMeta, isTaskOverdue } from '../utils/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export default function DashboardView({ onOpenTask, onNavigate, onNewTask, refreshSignal }) {
  const { user, isPrivileged, theme } = useAuth();
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
      <div className="nx3 nx3-dashboard space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="nx3-skeleton h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="nx3-skeleton h-72 rounded-xl" />
          <div className="nx3-skeleton h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  const kpis = data?.kpis || {};

  const taskDestination = isPrivileged ? 'all-tasks' : 'my-tasks';
  const kpiCards = [
    { label: 'Total tasks', value: kpis.total_tasks ?? '—', note: 'Across your workspace', icon: ListTodo, tone: 'mint', target: taskDestination },
    { label: 'To do', value: kpis.todo_tasks ?? '—', note: 'Waiting to be picked up', icon: CircleDashed, tone: 'cyan', target: taskDestination },
    { label: 'In progress', value: kpis.in_progress_tasks ?? '—', note: 'Currently being worked on', icon: Play, tone: 'blue', target: taskDestination },
    { label: 'Completed', value: kpis.completed_tasks ?? '—', note: 'Finished deliverables', icon: CheckCheck, tone: 'mint', target: taskDestination },
    { label: 'Overdue', value: kpis.overdue_tasks ?? '—', note: 'Past their due date', icon: CircleAlert, tone: 'red', target: taskDestination },
    { label: 'Due in 7 days', value: kpis.upcoming_deadlines ?? '—', note: 'Upcoming deadlines', icon: CalendarClock, tone: 'amber', target: 'calendar' },
    { label: 'Active projects', value: kpis.active_projects ?? '—', note: 'Currently in delivery', icon: FolderKanban, tone: 'violet', target: 'projects' },
    { label: 'Freelancers', value: kpis.total_freelancers ?? '—', note: 'In your workspace', icon: UsersRound, tone: 'cyan', target: 'freelancers' },
  ];

  const chartText = theme === 'dark' ? '#7A8398' : '#64748B';
  const chartGrid = theme === 'dark' ? '#252836' : '#E2E8F0';

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
        backgroundColor: ['#06b6d4', '#60a5fa', '#eab308', '#ef4444', '#22D3A5'],
        hoverOffset: 4,
        spacing: 3,
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
        backgroundColor: '#22D3A5',
        borderRadius: 5,
        barThickness: 24,
      },
    ],
  };

  return (
    <div className="nx3 nx3-dashboard space-y-7">
      {/* Header row */}
      <div className="nx3-dashboard-header flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="nx3-kicker"><Activity size={14} /> WORKSPACE / OPERATIONS</div>
          <h1 className="nx3-page-title">
            Welcome back, <span>{user?.name?.split(' ')[0] || 'there'}</span>
          </h1>
          <p className="nx3-page-subtitle">
            {isPrivileged
              ? 'A live read on delivery, team workload, and what needs attention.'
              : 'Your assigned work, approaching deadlines, and recent updates.'}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('my-tasks')}
            className="nx3-button nx3-button-secondary"
          >
            <ListTodo size={15} /> My tasks
          </button>
          {isPrivileged && (
            <button
              type="button"
              onClick={onNewTask}
              className="nx3-button nx3-button-primary"
            >
              <Plus size={16} /> Create task
            </button>
          )}
        </div>
      </div>

      {/* 8 KPI Widgets */}
      <section className="nx3-stat-grid grid grid-cols-2 sm:grid-cols-4 gap-3.5" aria-label="Task metrics">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => onNavigate(card.target)}
              className={`nx3-stat-card tone-${card.tone}`}
              aria-label={`${card.label}: ${card.value}. Open related view.`}
            >
              <span className="nx3-stat-top">
                <span className="nx3-stat-label">{card.label}</span>
                <span className="nx3-stat-icon"><Icon size={16} strokeWidth={1.8} /></span>
              </span>
              <span className="nx3-stat-value">{card.value}</span>
              <span className="nx3-stat-bottom">
                <span>{card.note}</span><ArrowUpRight size={14} />
              </span>
            </button>
          );
        })}
      </section>

      {/* Analytics Charts */}
      <section className="grid lg:grid-cols-12 gap-4">
        <div className="nx3-panel lg:col-span-5 glass-surface rounded-2xl p-5">
          <div className="nx3-panel-heading">
            <div>
              <h2>Task status</h2>
              <p>Distribution across workflow stages</p>
            </div>
            <span className="nx3-panel-mark">LIVE</span>
          </div>
          <div className="mt-5 h-56 flex items-center justify-center">
            {kpis.total_tasks > 0 ? (
              <Doughnut
                data={statusChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: '66%',
                  plugins: {
                    legend: {
                      position: 'right',
                      labels: { color: chartText, boxWidth: 8, boxHeight: 8, padding: 14, usePointStyle: true, font: { family: 'Nunito', size: 11, weight: 700 } },
                    },
                    tooltip: { backgroundColor: theme === 'dark' ? '#1E2230' : '#0F172A', padding: 10, titleFont: { family: 'Nunito' }, bodyFont: { family: 'JetBrains Mono' } },
                  },
                }}
              />
            ) : (
              <p className="nx3-empty-note">{data ? 'No tasks recorded yet.' : 'Task analytics are unavailable.'}</p>
            )}
          </div>
        </div>

        <div className="nx3-panel lg:col-span-7 glass-surface rounded-2xl p-5">
          <div className="nx3-panel-heading">
            <div>
              <h2>Project progress</h2>
              <p>Completion across active projects</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('projects')}
              className="nx3-inline-link"
            >
              All projects <ArrowUpRight size={14} />
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
                    y: { beginAtZero: true, max: 100, grid: { color: chartGrid }, border: { display: false }, ticks: { color: chartText, callback: (v) => `${v}%`, font: { family: 'JetBrains Mono', size: 10 } } },
                    x: { grid: { display: false }, border: { display: false }, ticks: { color: chartText, font: { family: 'JetBrains Mono', size: 10 } } },
                  },
                  plugins: { legend: { display: false }, tooltip: { backgroundColor: theme === 'dark' ? '#1E2230' : '#0F172A', padding: 10, titleFont: { family: 'Nunito' }, bodyFont: { family: 'JetBrains Mono' } } },
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                {data ? 'No project data available.' : 'Project analytics are unavailable.'}
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
