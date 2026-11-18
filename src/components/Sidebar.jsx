import {
  LayoutDashboard,
  CheckSquare,
  ListTodo,
  FolderKanban,
  CalendarDays,
  Users,
  Bell,
  BarChart3,
  Settings,
  LogOut,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';

export default function Sidebar({
  activeTab,
  onSelectTab,
  unreadCount,
  mobileOpen,
  onCloseMobile,
}) {
  const { user, logout, isPrivileged } = useAuth();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
    { id: 'my-tasks', label: 'My Tasks', icon: CheckSquare, show: true },
    { id: 'all-tasks', label: 'All Tasks', icon: ListTodo, show: isPrivileged },
    { id: 'projects', label: 'Projects', icon: FolderKanban, show: true },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays, show: true },
    { id: 'freelancers', label: 'Freelancers', icon: Users, show: true },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: Bell,
      show: true,
      badge: unreadCount > 0 ? unreadCount : null,
    },
    { id: 'reports', label: 'Reports', icon: BarChart3, show: true },
    { id: 'settings', label: 'Settings', icon: Settings, show: true },
  ].filter((item) => item.show);

  const handleNav = (id) => {
    onSelectTab(id);
    onCloseMobile?.();
  };

  const content = (
    <div className="h-full flex flex-col glass-chrome border-r border-slate-200/80 dark:border-slate-800/80 w-64">
      <div className="px-5 py-4 flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800/70">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-display font-bold text-sm shadow-sm shadow-blue-600/30">
            TC
          </div>
          <span className="font-display font-bold text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            TaskUpCard
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Primary navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNav(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </span>
              {item.badge && (
                <span className="px-1.5 py-0.5 text-[11px] font-mono tabular-nums font-semibold rounded bg-blue-600 text-white">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
        <button
          type="button"
          onClick={() => handleNav('settings')}
          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors text-left"
        >
          <Avatar user={user} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {user?.name}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {user?.role_label}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0 h-screen sticky top-0">
        {content}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-50 h-full">{content}</div>
        </div>
      )}
    </>
  );
}
