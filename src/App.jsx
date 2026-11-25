import { useEffect, useState, useCallback, useRef } from 'react';
import { Bell, BellOff, BellRing, Menu, Sun, Moon, Plus, RefreshCw, Search } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ToastProvider, useToast } from './context/ToastContext.jsx';
import { apiRequest } from './utils/api.js';
import { getSocket } from './utils/socket.js';

import AuthPortal from './components/AuthPortal.jsx';
import Sidebar from './components/Sidebar.jsx';
import DashboardView from './components/DashboardView.jsx';
import TasksView from './components/TasksView.jsx';
import TaskDetailDrawer from './components/TaskDetailDrawer.jsx';
import TaskModal from './components/TaskModal.jsx';
import ProjectsView from './components/ProjectsView.jsx';
import CalendarView from './components/CalendarView.jsx';
import FreelancersView from './components/FreelancersView.jsx';
import NotificationsView from './components/NotificationsView.jsx';
import ReportsView from './components/ReportsView.jsx';
import SettingsView from './components/SettingsView.jsx';

function WorkspaceShell() {
  const { user, loading, theme, toggleTheme, isPrivileged } = useAuth();
  const { notify } = useToast();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(['dashboard']));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const seenNotificationIdsRef = useRef(new Set());

  const [openTaskId, setOpenTaskId] = useState(null);
  const [quickTaskModalOpen, setQuickTaskModalOpen] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshSignal((n) => n + 1);
  }, []);

  const navigateToTab = useCallback((tab) => {
    setActiveTab(tab);
    setVisitedTabs((visited) => visited.has(tab) ? visited : new Set([...visited, tab]));
  }, []);

  useEffect(() => {
    if (!user) return;
    const enabled = localStorage.getItem(`taskupcard_browser_notifications_${user.id}`) === 'true';
    setBrowserNotificationsEnabled(enabled && 'Notification' in window && Notification.permission === 'granted');
  }, [user?.id]);

  const toggleBrowserNotifications = useCallback(async () => {
    if (!user) return;
    const storageKey = `taskupcard_browser_notifications_${user.id}`;
    if (browserNotificationsEnabled) {
      localStorage.setItem(storageKey, 'false');
      setBrowserNotificationsEnabled(false);
      notify('Desktop notifications are off.', 'info');
      return;
    }
    if (!('Notification' in window)) {
      notify('Desktop notifications are not supported by this browser.', 'error');
      return;
    }
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
    if (permission !== 'granted') {
      notify(permission === 'denied'
        ? 'Allow notifications for this site in your browser settings to turn them on.'
        : 'Notification permission was not granted.', 'info');
      return;
    }
    localStorage.setItem(storageKey, 'true');
    setBrowserNotificationsEnabled(true);
    notify('Desktop notifications are on for mentions.', 'success');
  }, [browserNotificationsEnabled, notify, user]);

  const loadWorkspaceMeta = useCallback(async () => {
    if (!user) return;
    try {
      const [projRes, usersRes, notifRes] = await Promise.all([
        apiRequest('/api/projects'),
        apiRequest('/api/users'),
        apiRequest('/api/notifications?limit=40'),
      ]);
      setProjects(projRes.projects || []);
      setUsers(usersRes.users || []);
      const loadedNotifications = notifRes.notifications || [];
      loadedNotifications.forEach((notification) => seenNotificationIdsRef.current.add(notification.id));
      setNotifications((previous) => {
        const byId = new Map([...loadedNotifications, ...previous].map((notification) => [notification.id, notification]));
        return [...byId.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      });
      setUnreadCount(notifRes.unreadCount || 0);
    } catch {
      // Handled gracefully
    } finally {
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadWorkspaceMeta();
  }, [loadWorkspaceMeta, refreshSignal]);

  // Listen to real-time Socket.IO notifications & workspace task updates
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    if (!socket) return;

    const handleNewNotification = (notif) => {
      if (seenNotificationIdsRef.current.has(notif.id)) return;
      seenNotificationIdsRef.current.add(notif.id);
      setNotifications((prev) => {
        if (prev.some((n) => n.id === notif.id)) return prev;
        return [notif, ...prev];
      });
      if (!notif.is_read) setUnreadCount((count) => count + 1);
      notify(notif.title, 'info');
      if (notif.type === 'mention' && browserNotificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
        const popup = new Notification(notif.title, {
          body: notif.message,
          tag: `taskupcard-${notif.id}`,
        });
        popup.onclick = () => {
          window.focus();
          navigateToTab('notifications');
          if (notif.task_id) setOpenTaskId(notif.task_id);
          popup.close();
        };
      }
    };

    const handleWorkspaceTaskChange = () => {
      setRefreshSignal((n) => n + 1);
    };

    socket.on('notification:new', handleNewNotification);
    socket.on('task:created', handleWorkspaceTaskChange);
    socket.on('task:updated', handleWorkspaceTaskChange);
    socket.on('task:deleted', handleWorkspaceTaskChange);

    return () => {
      socket.off('notification:new', handleNewNotification);
      socket.off('task:created', handleWorkspaceTaskChange);
      socket.off('task:updated', handleWorkspaceTaskChange);
      socket.off('task:deleted', handleWorkspaceTaskChange);
    };
  }, [user, notify, browserNotificationsEnabled, navigateToTab]);

  if (loading) {
    return (
      <div className="nx3 min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-sm font-medium text-slate-500">Loading TaskUpCard workspace...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="nx3 min-h-screen">
        <AuthPortal />
      </div>
    );
  }

  const tabTitles = {
    dashboard: 'Dashboard',
    'my-tasks': 'My Tasks',
    'all-tasks': 'All Tasks',
    projects: 'Projects',
    calendar: 'Calendar',
    freelancers: 'Freelancers',
    notifications: 'Notifications',
    reports: 'Reports',
    settings: 'Settings',
  };

  return (
    <div className="nx3 min-h-screen flex text-slate-900 dark:text-slate-100">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={navigateToTab}
        unreadCount={unreadCount}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 glass-chrome border-b border-slate-200/80 dark:border-slate-800/80 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
              <span className="hidden sm:inline">TaskUpCard / </span>
              <span className="font-medium text-slate-900 dark:text-white">
                {tabTitles[activeTab] || 'Workspace'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={triggerRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
              aria-label="Refresh workspace"
              title="Refresh workspace"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => navigateToTab(isPrivileged ? 'all-tasks' : 'my-tasks')}
              className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Search className="w-3.5 h-3.5" /> Search tasks
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => navigateToTab('notifications')}
              className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-mono font-bold flex items-center justify-center tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={toggleBrowserNotifications}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label={browserNotificationsEnabled ? 'Turn desktop notifications off' : 'Turn desktop notifications on'}
              aria-pressed={browserNotificationsEnabled}
              title={browserNotificationsEnabled ? 'Desktop mention alerts on' : 'Enable desktop mention alerts'}
            >
              {browserNotificationsEnabled ? <BellRing className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </button>

            {isPrivileged && (
              <button
                type="button"
                onClick={() => setQuickTaskModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New Task</span>
              </button>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {visitedTabs.has('dashboard') && (
            <div hidden={activeTab !== 'dashboard'}>
            <DashboardView
              onOpenTask={setOpenTaskId}
              onNavigate={navigateToTab}
              onNewTask={() => setQuickTaskModalOpen(true)}
              refreshSignal={refreshSignal}
            />
            </div>
          )}

          {visitedTabs.has('my-tasks') && (
            <div hidden={activeTab !== 'my-tasks'}>
            <TasksView
              mode="my"
              projects={projects}
              users={users}
              onOpenTask={setOpenTaskId}
              refreshSignal={refreshSignal}
              onTriggerRefresh={triggerRefresh}
            />
            </div>
          )}

          {visitedTabs.has('all-tasks') && isPrivileged && (
            <div hidden={activeTab !== 'all-tasks'}>
            <TasksView
              mode="all"
              projects={projects}
              users={users}
              onOpenTask={setOpenTaskId}
              refreshSignal={refreshSignal}
              onTriggerRefresh={triggerRefresh}
            />
            </div>
          )}

          {visitedTabs.has('projects') && (
            <div hidden={activeTab !== 'projects'}>
            <ProjectsView
              users={users}
              onOpenTask={setOpenTaskId}
              refreshSignal={refreshSignal}
              onTriggerRefresh={triggerRefresh}
            />
            </div>
          )}

          {visitedTabs.has('calendar') && (
            <div hidden={activeTab !== 'calendar'}>
            <CalendarView
              projects={projects}
              users={users}
              onOpenTask={setOpenTaskId}
              refreshSignal={refreshSignal}
              onTriggerRefresh={triggerRefresh}
            />
            </div>
          )}

          {visitedTabs.has('freelancers') && (
            <div hidden={activeTab !== 'freelancers'}>
            <FreelancersView
              projects={projects}
              refreshSignal={refreshSignal}
              onTriggerRefresh={triggerRefresh}
            />
            </div>
          )}

          {visitedTabs.has('notifications') && (
            <div hidden={activeTab !== 'notifications'}>
            <NotificationsView
              notifications={notifications}
              onRefreshNotifications={loadWorkspaceMeta}
              onOpenTask={setOpenTaskId}
            />
            </div>
          )}

          {visitedTabs.has('reports') && (
            <div hidden={activeTab !== 'reports'}>
            <ReportsView
              projects={projects}
              users={users}
              refreshSignal={refreshSignal}
            />
            </div>
          )}

          {visitedTabs.has('settings') && (
            <div hidden={activeTab !== 'settings'}>
              <SettingsView
                browserNotificationsEnabled={browserNotificationsEnabled}
                onToggleBrowserNotifications={toggleBrowserNotifications}
              />
            </div>
          )}
        </main>
      </div>

      {/* Task Detail Workspace Drawer */}
      {openTaskId && (
        <TaskDetailDrawer
          taskId={openTaskId}
          users={users}
          onClose={() => setOpenTaskId(null)}
          onTaskMutated={triggerRefresh}
        />
      )}

      {/* Global Quick Create Task Modal */}
      <TaskModal
        open={quickTaskModalOpen}
        onClose={() => setQuickTaskModalOpen(false)}
        projects={projects}
        users={users}
        onSaved={(newTask) => {
          triggerRefresh();
          if (newTask?.id) setOpenTaskId(newTask.id);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <WorkspaceShell />
      </AuthProvider>
    </ToastProvider>
  );
}
