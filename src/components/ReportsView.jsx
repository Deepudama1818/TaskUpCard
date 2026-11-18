import { useEffect, useState, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { apiRequest, TASK_STATUSES } from '../utils/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Avatar from './Avatar.jsx';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

export default function ReportsView({ projects = [], users = [], refreshSignal }) {
  const { isPrivileged } = useAuth();
  const { notify } = useToast();

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    projectId: 'all',
    freelancerId: 'all',
    status: 'all',
  });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v && v !== 'all') params.set(k, v);
      });
      const res = await apiRequest(`/api/analytics/reports?${params.toString()}`);
      setReport(res);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, notify]);

  useEffect(() => {
    loadReports();
  }, [loadReports, refreshSignal]);

  const summary = report?.summary || {};
  const trends = report?.monthlyTrends || [];
  const projectCompletion = report?.projectCompletion || [];
  const freelancerProductivity = report?.freelancerProductivity || [];

  const trendChartData = {
    labels: trends.map((m) => m.month_label),
    datasets: [
      {
        label: 'Tasks Created',
        data: trends.map((m) => m.created_count),
        backgroundColor: '#94a3b8',
        borderRadius: 5,
      },
      {
        label: 'Tasks Completed',
        data: trends.map((m) => m.completed_count),
        backgroundColor: '#2563eb',
        borderRadius: 5,
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Analytics & Reports
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Completion velocity, project delivery rates, and freelancer productivity metrics.
        </p>
      </div>

      {/* Filters */}
      <div className="glass-surface rounded-2xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1">From Date</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1">To Date</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1">Project</label>
          <select
            value={filters.projectId}
            onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {isPrivileged && (
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Freelancer</label>
            <select
              value={filters.freelancerId}
              onChange={(e) => setFilters({ ...filters, freelancerId: e.target.value })}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              <option value="all">All Freelancers</option>
              {users
                .filter((u) => u.role === 'freelancer')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1">Task Status</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          >
            <option value="all">All Statuses</option>
            {TASK_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() =>
            setFilters({ startDate: '', endDate: '', projectId: 'all', freelancerId: 'all', status: 'all' })
          }
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Reset
        </button>
      </div>

      {/* Summary KPIs */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="glass-surface rounded-2xl p-4">
          <div className="text-xs text-slate-500">Total Assigned</div>
          <div className="mt-1 text-2xl font-display font-bold tabular-nums">{summary.total_assigned ?? 0}</div>
        </div>
        <div className="glass-surface rounded-2xl p-4">
          <div className="text-xs text-slate-500">Completed</div>
          <div className="mt-1 text-2xl font-display font-bold tabular-nums text-emerald-600">
            {summary.total_completed ?? 0}
          </div>
        </div>
        <div className="glass-surface rounded-2xl p-4">
          <div className="text-xs text-slate-500">Pending</div>
          <div className="mt-1 text-2xl font-display font-bold tabular-nums text-blue-600">
            {summary.pending_tasks ?? 0}
          </div>
        </div>
        <div className="glass-surface rounded-2xl p-4">
          <div className="text-xs text-slate-500">Overdue</div>
          <div className="mt-1 text-2xl font-display font-bold tabular-nums text-rose-600">
            {summary.overdue_tasks ?? 0}
          </div>
        </div>
        <div className="glass-surface rounded-2xl p-4">
          <div className="text-xs text-slate-500">Avg Completion Time</div>
          <div className="mt-1 text-2xl font-display font-bold tabular-nums">
            {summary.avg_completion_days ?? 0}d
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 glass-surface rounded-2xl p-5">
          <h2 className="font-display text-base font-semibold">Monthly Task Completion Trends</h2>
          <div className="mt-4 h-64">
            {loading && !report ? (
              <div className="h-full bg-slate-100 dark:bg-slate-800 animate-pulse rounded-lg" />
            ) : trends.length > 0 ? (
              <Bar
                data={trendChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                No monthly data for selected filters.
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 glass-surface rounded-2xl p-5 space-y-4">
          <h2 className="font-display text-base font-semibold">Project-Wise Completion</h2>
          <div className="space-y-3.5">
            {projectCompletion.length === 0 ? (
              <p className="text-sm text-slate-400">No project metrics match filters.</p>
            ) : (
              projectCompletion.map((p) => (
                <div key={p.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{p.name}</span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {p.percentage}% ({p.completed_tasks}/{p.total_tasks})
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${p.percentage}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Freelancer Productivity Table */}
      <div className="glass-surface rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200/70 dark:border-slate-800/70">
          <h2 className="font-display text-base font-semibold">Freelancer Productivity</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/70 dark:bg-slate-800/40 text-xs text-slate-500">
              <tr>
                <th className="text-left font-medium px-5 py-3">Freelancer</th>
                <th className="text-right font-medium px-4 py-3">Assigned</th>
                <th className="text-right font-medium px-4 py-3">Completed</th>
                <th className="text-right font-medium px-4 py-3">Overdue</th>
                <th className="text-right font-medium px-4 py-3">Hours Logged</th>
                <th className="text-right font-medium px-5 py-3">Completion Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {freelancerProductivity.map((f) => (
                <tr key={f.id}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar user={f} size="xs" />
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">{f.name}</div>
                        <div className="text-xs text-slate-400">{f.specialty || 'Freelancer'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{f.assigned_count}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-600">{f.completed_count}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-rose-600">{f.overdue_count}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{f.hours_logged}h</td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums font-semibold">{f.completion_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
