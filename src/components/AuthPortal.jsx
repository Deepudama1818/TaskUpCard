import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Mail, CheckCircle2, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiRequest } from '../utils/api.js';

export default function AuthPortal() {
  const { login, acceptInvite, theme, toggleTheme } = useAuth();
  const { notify } = useToast();

  const [mode, setMode] = useState('login'); // login | forgot | reset | invite | verified
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [previewResetToken, setPreviewResetToken] = useState('');

  const [inviteToken, setInviteToken] = useState('');
  const [inviteInfo, setInviteInfo] = useState(null);
  const [inviteForm, setInviteForm] = useState({
    name: '',
    username: '',
    password: '',
    phone: '',
    location: '',
    bio: '',
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inv = params.get('inviteToken');
    const rst = params.get('resetToken');
    const vrf = params.get('verifyToken');

    if (inv) {
      setInviteToken(inv);
      setMode('invite');
      apiRequest(`/api/auth/invite/${inv}`)
        .then((res) => {
          setInviteInfo(res.invitation);
          setInviteForm((prev) => ({ ...prev, name: res.invitation.name || '' }));
        })
        .catch((err) => notify(err.message, 'error'));
    } else if (rst) {
      setResetToken(rst);
      setMode('reset');
    } else if (vrf) {
      apiRequest(`/api/auth/verify-email/${vrf}`)
        .then(() => {
          setMode('verified');
          notify('Email verified! You can sign in now.', 'success');
        })
        .catch((err) => notify(err.message, 'error'));
    }
  }, [notify]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      notify('Welcome back to TaskUpCard.', 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      notify(res.message, 'success');
      if (res.previewResetToken) {
        setPreviewResetToken(res.previewResetToken);
      }
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      });
      notify(res.message, 'success');
      window.history.replaceState({}, '', '/');
      setMode('login');
      setNewPassword('');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptInvite = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await acceptInvite({ token: inviteToken, ...inviteForm });
      window.history.replaceState({}, '', '/');
      notify('Account activated! Welcome to TaskUpCard.', 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="glass-chrome flex items-center justify-between px-6 py-4 border-b border-slate-200/70 dark:border-slate-800/70">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-display font-bold text-sm shadow-sm shadow-blue-600/30">
            TC
          </div>
          <span className="font-display font-bold text-lg tracking-tight whitespace-nowrap">
            TaskUpCard
          </span>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-lg glass-surface text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
          aria-label="Toggle color theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md glass-surface rounded-2xl p-7 sm:p-9">
          <div className="text-center mb-7">
            <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-display font-bold text-base mx-auto shadow-md shadow-blue-600/25">
              TC
            </div>
            <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              TaskUpCard
            </h1>
          </div>

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-200/90 dark:border-slate-700/80 bg-white/70 dark:bg-slate-950/60 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-9 pr-10 py-2.5 text-sm rounded-lg border border-slate-200/90 dark:border-slate-700/80 bg-white/70 dark:bg-slate-950/60 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium text-sm shadow-sm shadow-blue-600/25 transition-colors"
              >
                {submitting ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-5">
              <div className="text-center">
                <h2 className="font-display text-lg font-semibold">Reset Password</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Enter your account email to receive a reset link.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium">Account Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200/90 dark:border-slate-700/80 bg-white/70 dark:bg-slate-950/60 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {previewResetToken && (
                <div className="p-3 rounded-lg bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs space-y-2">
                  <p className="font-medium text-blue-900 dark:text-blue-200">
                    Reset token generated:
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setResetToken(previewResetToken);
                      setMode('reset');
                    }}
                    className="font-semibold text-blue-600 dark:text-blue-400 underline"
                  >
                    Proceed to Reset Password
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm"
                >
                  {submitting ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={handleReset} className="space-y-5">
              <div className="text-center">
                <h2 className="font-display text-lg font-semibold">Set New Password</h2>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium">New Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200/90 dark:border-slate-700/80 bg-white/70 dark:bg-slate-950/60 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm"
              >
                {submitting ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}

          {mode === 'invite' && (
            <form onSubmit={handleAcceptInvite} className="space-y-4">
              <div className="text-center">
                <h2 className="font-display text-lg font-semibold">Activate Account</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {inviteInfo
                    ? `${inviteInfo.role_label} · ${inviteInfo.email}`
                    : 'Complete your profile to continue.'}
                </p>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium">Full Name</label>
                <input
                  type="text"
                  required
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Phone</label>
                  <input
                    type="text"
                    value={inviteForm.phone}
                    onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Location</label>
                  <input
                    type="text"
                    value={inviteForm.location}
                    onChange={(e) => setInviteForm({ ...inviteForm, location: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium">Create Password (min 8 chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={inviteForm.password}
                  onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm"
              >
                {submitting ? 'Activating...' : 'Activate & Sign In'}
              </button>
            </form>
          )}

          {mode === 'verified' && (
            <div className="text-center space-y-4 py-4">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <h2 className="font-display text-lg font-semibold">Email Verified</h2>
              <button
                type="button"
                onClick={() => {
                  window.history.replaceState({}, '', '/');
                  setMode('login');
                }}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm"
              >
                Continue to Sign In
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
