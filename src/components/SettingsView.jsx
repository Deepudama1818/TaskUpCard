import { useEffect, useState } from 'react';
import { Sun, Moon, ShieldCheck, CheckCircle2, BellRing } from 'lucide-react';
import { apiRequest } from '../utils/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function SettingsView({ browserNotificationsEnabled = false, onToggleBrowserNotifications }) {
  const { user, setUser, isSuperAdmin, theme, toggleTheme } = useAuth();
  const { notify } = useToast();

  const [profile, setProfile] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    location: user?.location || '',
    specialty: user?.specialty || '',
    skillsText: Array.isArray(user?.skills) ? user.skills.join(', ') : '',
    bio: user?.bio || '',
    currentPassword: '',
    newPassword: '',
  });

  const [workspaceSettings, setWorkspaceSettings] = useState({
    organizationName: 'TaskUpCard Workspace',
    allowFreelancerSelfLogTime: true,
    requireReviewBeforeComplete: true,
    maxUploadMb: 15,
  });

  const [notifSettings, setNotifSettings] = useState({
    emailOnTaskAssign: true,
    emailOnMention: true,
    emailOnDeadlineApproaching: true,
    deadlineReminderHours: 48,
  });

  useEffect(() => {
    apiRequest('/api/settings')
      .then((res) => {
        if (res.settings?.workspace) setWorkspaceSettings(res.settings.workspace);
        if (res.settings?.notifications) setNotifSettings(res.settings.notifications);
      })
      .catch(() => {});
  }, []);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: profile.name,
          phone: profile.phone,
          location: profile.location,
          specialty: profile.specialty,
          bio: profile.bio,
          skills: profile.skillsText.split(',').map((s) => s.trim()).filter(Boolean),
          ...(profile.newPassword
            ? { currentPassword: profile.currentPassword, newPassword: profile.newPassword }
            : {}),
        }),
      });
      setUser(res.user);
      setProfile((p) => ({ ...p, currentPassword: '', newPassword: '' }));
      notify('Profile updated.', 'success');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleVerifyEmail = async () => {
    try {
      const res = await apiRequest('/api/auth/send-verification', { method: 'POST' });
      if (res.previewVerifyToken) {
        await apiRequest(`/api/auth/verify-email/${res.previewVerifyToken}`);
        setUser((prev) => ({ ...prev, email_verified: true }));
        notify('Email address verified.', 'success');
      } else {
        notify(res.message, 'success');
      }
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleSaveWorkspaceSettings = async (e) => {
    e.preventDefault();
    try {
      await Promise.all([
        apiRequest('/api/settings/workspace', {
          method: 'PUT',
          body: JSON.stringify({ value: workspaceSettings }),
        }),
        apiRequest('/api/settings/notifications', {
          method: 'PUT',
          body: JSON.stringify({ value: notifSettings }),
        }),
      ]);
      notify('Workspace configuration saved.', 'success');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Settings & Profile
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage your contributor profile, password, appearance, and workspace rules.
          </p>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg glass-surface hover:border-blue-500 transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        </button>
      </div>

      {/* Profile Form */}
      <form
        onSubmit={handleSaveProfile}
        className="glass-surface rounded-2xl p-6 space-y-5"
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="font-display text-base font-semibold">Account Profile</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {user?.email} · {user?.role_label}
            </p>
          </div>
          {user?.email_verified ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" /> Email Verified
            </span>
          ) : (
            <button
              type="button"
              onClick={handleVerifyEmail}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Verify Email Now
            </button>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Full Name</label>
            <input
              type="text"
              required
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Specialty</label>
            <input
              type="text"
              value={profile.specialty}
              onChange={(e) => setProfile({ ...profile, specialty: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Phone</label>
            <input
              type="text"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Location</label>
            <input
              type="text"
              value={profile.location}
              onChange={(e) => setProfile({ ...profile, location: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Skills (comma separated)</label>
          <input
            type="text"
            value={profile.skillsText}
            onChange={(e) => setProfile({ ...profile, skillsText: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Bio</label>
          <textarea
            rows={2}
            value={profile.bio}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          />
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Current Password (optional)</label>
            <input
              type="password"
              value={profile.currentPassword}
              onChange={(e) => setProfile({ ...profile, currentPassword: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">New Password (min 8 chars)</label>
            <input
              type="password"
              minLength={8}
              value={profile.newPassword}
              onChange={(e) => setProfile({ ...profile, newPassword: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
          >
            Save Profile
          </button>
        </div>
      </form>

      <section className="glass-surface rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <BellRing className="w-5 h-5 text-blue-600" />
          <div>
            <h2 className="font-display text-base font-semibold">Notifications</h2>
            <p className="text-xs text-slate-500 mt-0.5">Show a desktop alert when a teammate mentions you.</p>
          </div>
        </div>
        <label className="nx3-switch-row flex items-center gap-3 cursor-pointer text-sm">
          <input
            type="checkbox"
            role="switch"
            className="nx3-switch"
            checked={browserNotificationsEnabled}
            onChange={onToggleBrowserNotifications}
          />
          <span>Desktop alerts for @mentions</span>
        </label>
      </section>

      {/* Super Admin Application Configuration */}
      {isSuperAdmin && (
        <form
          onSubmit={handleSaveWorkspaceSettings}
          className="glass-surface rounded-2xl p-6 space-y-5"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="font-display text-base font-semibold">Application Settings (Super Admin)</h2>
              <p className="text-xs text-slate-500">
                Global organization preferences persisted in Neon PostgreSQL.
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Organization Name</label>
              <input
                type="text"
                value={workspaceSettings.organizationName}
                onChange={(e) =>
                  setWorkspaceSettings({ ...workspaceSettings, organizationName: e.target.value })
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Deadline Reminder Window (hours)</label>
              <input
                type="number"
                min="6"
                max="168"
                value={notifSettings.deadlineReminderHours}
                onChange={(e) =>
                  setNotifSettings({
                    ...notifSettings,
                    deadlineReminderHours: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-2.5 text-sm">
            <label className="nx3-switch-row flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                role="switch"
                className="nx3-switch"
                checked={workspaceSettings.allowFreelancerSelfLogTime}
                onChange={(e) =>
                  setWorkspaceSettings({
                    ...workspaceSettings,
                    allowFreelancerSelfLogTime: e.target.checked,
                  })
                }
              />
              <span>Allow freelancers to log time entries on assigned tasks</span>
            </label>
            <label className="nx3-switch-row flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                role="switch"
                className="nx3-switch"
                checked={notifSettings.emailOnTaskAssign}
                onChange={(e) =>
                  setNotifSettings({ ...notifSettings, emailOnTaskAssign: e.target.checked })
                }
              />
              <span>Send email notifications on new task assignments</span>
            </label>
            <label className="nx3-switch-row flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                role="switch"
                className="nx3-switch"
                checked={notifSettings.emailOnMention}
                onChange={(e) =>
                  setNotifSettings({ ...notifSettings, emailOnMention: e.target.checked })
                }
              />
              <span>Send email notifications on @username mentions</span>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
            >
              Save Workspace Settings
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
