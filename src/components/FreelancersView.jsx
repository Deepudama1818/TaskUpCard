import { useEffect, useState, useCallback } from 'react';
import {
  UserPlus,
  Plus,
  Search,
  Mail,
  Phone,
  MapPin,
  Edit3,
  UserX,
  UserCheck,
  Trash2,
  Copy,
} from 'lucide-react';
import { apiRequest } from '../utils/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Avatar from './Avatar.jsx';

export default function FreelancersView({ projects = [], refreshSignal, onTriggerRefresh }) {
  const { user: currentUser, isPrivileged, isSuperAdmin } = useAuth();
  const { notify, confirm } = useToast();

  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'freelancer',
    specialty: '',
    hourly_rate: 0,
    phone: '',
    location: '',
    skillsText: '',
    projectIds: [],
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState('');
  const [inviteForm, setInviteForm] = useState({
    name: '',
    email: '',
    role: 'freelancer',
    specialty: '',
    skillsText: '',
    projectIds: [],
  });

  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    role: 'freelancer',
    specialty: '',
    hourly_rate: 0,
    phone: '',
    location: '',
    skillsText: '',
    projectIds: [],
  });

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (roleFilter !== 'all') params.set('role', roleFilter);
      if (search.trim()) params.set('search', search.trim());
      const res = await apiRequest(`/api/users?${params.toString()}`);
      setUsers(res.users || []);

      if (isPrivileged) {
        const invRes = await apiRequest('/api/users/invitations');
        setInvitations((invRes.invitations || []).filter((i) => i.status === 'pending'));
      }
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [roleFilter, search, isPrivileged, notify]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory, refreshSignal]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: createForm.name,
          email: createForm.email,
          password: createForm.password,
          role: createForm.role,
          specialty: createForm.specialty,
          hourly_rate: Number(createForm.hourly_rate || 0),
          phone: createForm.phone,
          location: createForm.location,
          skills: createForm.skillsText.split(',').map((s) => s.trim()).filter(Boolean),
          projectIds: createForm.projectIds,
        }),
      });
      notify(`Created ${createForm.role.replace('_', ' ')} account for ${createForm.name}.`, 'success');
      setCreateOpen(false);
      setCreateForm({
        name: '',
        email: '',
        password: '',
        role: 'freelancer',
        specialty: '',
        hourly_rate: 0,
        phone: '',
        location: '',
        skillsText: '',
        projectIds: [],
      });
      loadDirectory();
      onTriggerRefresh?.();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleSendInvite = async (e) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/api/users/invite', {
        method: 'POST',
        body: JSON.stringify({
          name: inviteForm.name,
          email: inviteForm.email,
          role: inviteForm.role,
          specialty: inviteForm.specialty,
          skills: inviteForm.skillsText.split(',').map((s) => s.trim()).filter(Boolean),
          projectIds: inviteForm.projectIds,
        }),
      });
      setLastInviteUrl(res.inviteUrl);
      notify(`Invitation created for ${inviteForm.email}.`, 'success');
      setInviteForm({ name: '', email: '', role: 'freelancer', specialty: '', skillsText: '', projectIds: [] });
      loadDirectory();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const openEditModal = (u) => {
    setEditUser(u);
    setEditForm({
      name: u.name,
      role: u.role,
      specialty: u.specialty || '',
      hourly_rate: u.hourly_rate || 0,
      phone: u.phone || '',
      location: u.location || '',
      skillsText: Array.isArray(u.skills) ? u.skills.join(', ') : '',
      projectIds: (u.projects || []).map((p) => p.id),
    });
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    try {
      await apiRequest(`/api/users/${editUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          ...(isSuperAdmin ? { role: editForm.role } : {}),
          specialty: editForm.specialty,
          hourly_rate: Number(editForm.hourly_rate || 0),
          phone: editForm.phone,
          location: editForm.location,
          skills: editForm.skillsText.split(',').map((s) => s.trim()).filter(Boolean),
          projectIds: editForm.projectIds,
        }),
      });
      notify('User updated.', 'success');
      setEditUser(null);
      loadDirectory();
      onTriggerRefresh?.();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleToggleAccountStatus = async (u) => {
    const nextStatus = u.status === 'deactivated' ? 'active' : 'deactivated';
    const ok = await confirm({
      title: `${nextStatus === 'deactivated' ? 'Deactivate' : 'Reactivate'} ${u.name}?`,
      message:
        nextStatus === 'deactivated'
          ? 'They will immediately lose access to TaskUpCard until reactivated.'
          : 'They will regain access to assigned tasks and projects.',
      confirmLabel: nextStatus === 'deactivated' ? 'Deactivate' : 'Reactivate',
      danger: nextStatus === 'deactivated',
    });
    if (!ok) return;
    try {
      await apiRequest(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      notify(`Account ${nextStatus}.`, 'success');
      loadDirectory();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleDeleteUser = async (u) => {
    const ok = await confirm({
      title: `Delete ${u.name}?`,
      message: `This will permanently remove ${u.email} (${u.role_label}) from TaskUpCard.`,
      confirmLabel: 'Delete User',
      danger: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/api/users/${u.id}`, { method: 'DELETE' });
      notify(`${u.name} deleted.`, 'success');
      loadDirectory();
      onTriggerRefresh?.();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleRevokeInvite = async (invId) => {
    try {
      await apiRequest(`/api/users/invitations/${invId}`, { method: 'DELETE' });
      notify('Invitation revoked.', 'success');
      loadDirectory();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Team & Freelancers
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage super admins, project managers, external freelancers, skills, and task capacity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/25 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Create User
            </button>
          )}

          {isPrivileged && (
            <button
              type="button"
              onClick={() => {
                setLastInviteUrl('');
                setInviteOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg glass-surface text-slate-800 dark:text-slate-100 hover:border-blue-500 whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4" /> Invite via Link
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="glass-surface rounded-xl p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or specialty..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/70 dark:bg-slate-950/60"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-lg">
          {[
            { id: 'all', label: 'All Members' },
            { id: 'super_admin', label: 'Super Admins' },
            { id: 'project_manager', label: 'Managers' },
            { id: 'freelancer', label: 'Freelancers' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRoleFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                roleFilter === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pending invitations banner */}
      {isPrivileged && invitations.length > 0 && (
        <div className="glass-surface rounded-xl p-4 space-y-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Pending Invitations ({invitations.length})
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {invitations.map((inv) => (
              <div key={inv.id} className="py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-medium text-slate-900 dark:text-white">{inv.name}</span>
                  <span className="text-slate-400"> · {inv.email} · {inv.role_label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/?inviteToken=${inv.token}`;
                      navigator.clipboard?.writeText(url);
                      notify('Activation link copied.', 'success');
                    }}
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    <Copy className="w-3 h-3" /> Copy Activation Link
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRevokeInvite(inv.id)}
                    className="text-rose-600 hover:underline"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Directory Grid */}
      {loading && !hasLoaded ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="nx3-skeleton h-56 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {users.map((u) => (
            <div
              key={u.id}
              className="glass-surface rounded-xl p-5 flex flex-col justify-between gap-4 transition-colors"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar user={u} size="lg" />
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white truncate">
                        {u.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {u.role_label} {u.specialty ? `· ${u.specialty}` : ''}
                      </p>
                      <p className={`text-[11px] font-medium mt-0.5 ${
                        u.status === 'active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'
                      }`}>
                        {u.status === 'active' ? 'Active Account' : 'Deactivated'}
                      </p>
                    </div>
                  </div>

                  {isPrivileged && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(u)}
                        className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                        title="Edit user"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {isSuperAdmin && u.id !== currentUser?.id && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleToggleAccountStatus(u)}
                            className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                            title={u.status === 'active' ? 'Deactivate' : 'Reactivate'}
                          >
                            {u.status === 'active' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                            title="Delete user"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-2 truncate">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{u.email}</span>
                  </div>
                  {u.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{u.phone}</span>
                    </div>
                  )}
                  {u.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{u.location}</span>
                    </div>
                  )}
                </div>

                {Array.isArray(u.skills) && u.skills.length > 0 && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Skills: <span className="text-slate-700 dark:text-slate-300">{u.skills.join(' · ')}</span>
                  </div>
                )}

                {Array.isArray(u.projects) && u.projects.length > 0 && (
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    Projects: <span className="text-slate-700 dark:text-slate-300">{u.projects.map((p) => p.code).join(', ')}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-200/60 dark:border-slate-800/60 text-center">
                <div>
                  <div className="text-sm font-display font-bold tabular-nums text-blue-600 dark:text-blue-400">
                    {u.active_tasks}
                  </div>
                  <div className="text-[11px] text-slate-400">Active</div>
                </div>
                <div>
                  <div className="text-sm font-display font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {u.completed_tasks}
                  </div>
                  <div className="text-[11px] text-slate-400">Completed</div>
                </div>
                <div>
                  <div className="text-sm font-display font-bold tabular-nums text-rose-600 dark:text-rose-400">
                    {u.overdue_tasks}
                  </div>
                  <div className="text-[11px] text-slate-400">Overdue</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Super Admin: Direct Create User Modal (Super Admin, Project Manager, Freelancer) */}
      {createOpen && isSuperAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg glass-surface rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display text-lg font-semibold">Create Workspace User</h2>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Role</label>
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                  >
                    <option value="super_admin">Super Admin</option>
                    <option value="project_manager">Project Manager</option>
                    <option value="freelancer">Freelancer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Password (min 8 chars)</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Specialty</label>
                  <input
                    type="text"
                    value={createForm.specialty}
                    onChange={(e) => setCreateForm({ ...createForm, specialty: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Location</label>
                  <input
                    type="text"
                    value={createForm.location}
                    onChange={(e) => setCreateForm({ ...createForm, location: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Skills (comma separated)</label>
                <input
                  type="text"
                  value={createForm.skillsText}
                  onChange={(e) => setCreateForm({ ...createForm, skillsText: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Assign Projects</label>
                <div className="grid grid-cols-2 gap-2 max-h-28 overflow-y-auto p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-950/50">
                  {projects.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createForm.projectIds.includes(p.id)}
                        onChange={() =>
                          setCreateForm((prev) => ({
                            ...prev,
                            projectIds: prev.projectIds.includes(p.id)
                              ? prev.projectIds.filter((id) => id !== p.id)
                              : [...prev.projectIds, p.id],
                          }))
                        }
                      />
                      <span className="truncate">{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg glass-surface rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-lg font-semibold">Invite Contributor</h2>
            {lastInviteUrl ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Invitation email has been queued and the activation link is ready:
                </p>
                <div className="p-3 rounded-lg bg-slate-100/80 dark:bg-slate-950/80 font-mono text-xs break-all">
                  {lastInviteUrl}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(lastInviteUrl);
                      notify('Activation link copied.', 'success');
                    }}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    Copy Link
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteOpen(false)}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendInvite} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={inviteForm.name}
                      onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Specialty</label>
                    <input
                      type="text"
                      value={inviteForm.specialty}
                      onChange={(e) => setInviteForm({ ...inviteForm, specialty: e.target.value })}
                      placeholder="e.g., Technical Trainer"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                    />
                  </div>
                  {isSuperAdmin && (
                    <div>
                      <label className="block text-xs font-medium mb-1">Role</label>
                      <select
                        value={inviteForm.role}
                        onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                      >
                        <option value="freelancer">Freelancer</option>
                        <option value="project_manager">Project Manager</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Skills (comma separated)</label>
                  <input
                    type="text"
                    value={inviteForm.skillsText}
                    onChange={(e) => setInviteForm({ ...inviteForm, skillsText: e.target.value })}
                    placeholder="UI Design, Copywriting, Node.js"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Assign Initial Projects</label>
                  <div className="grid grid-cols-2 gap-2 max-h-28 overflow-y-auto p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-950/50">
                    {projects.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={inviteForm.projectIds.includes(p.id)}
                          onChange={() =>
                            setInviteForm((prev) => ({
                              ...prev,
                              projectIds: prev.projectIds.includes(p.id)
                                ? prev.projectIds.filter((id) => id !== p.id)
                                : [...prev.projectIds, p.id],
                            }))
                          }
                        />
                        <span className="truncate">{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setInviteOpen(false)}
                    className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Send Invitation
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit Collaborator Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg glass-surface rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-lg font-semibold">Edit {editUser.name}</h2>
            <form onSubmit={handleSaveUser} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                  />
                </div>
                {isSuperAdmin ? (
                  <div>
                    <label className="block text-xs font-medium mb-1">Role</label>
                    <select
                      value={editForm.role}
                      onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                    >
                      <option value="super_admin">Super Admin</option>
                      <option value="project_manager">Project Manager</option>
                      <option value="freelancer">Freelancer</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium mb-1">Specialty</label>
                    <input
                      type="text"
                      value={editForm.specialty}
                      onChange={(e) => setEditForm({ ...editForm, specialty: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Phone</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Location</label>
                  <input
                    type="text"
                    value={editForm.location}
                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                  />
                </div>
              </div>
              {isSuperAdmin && (
                <div>
                  <label className="block text-xs font-medium mb-1">Specialty</label>
                  <input
                    type="text"
                    value={editForm.specialty}
                    onChange={(e) => setEditForm({ ...editForm, specialty: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium mb-1">Skills (comma separated)</label>
                <input
                  type="text"
                  value={editForm.skillsText}
                  onChange={(e) => setEditForm({ ...editForm, skillsText: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Assigned Projects</label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-950/50">
                  {projects.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.projectIds.includes(p.id)}
                        onChange={() =>
                          setEditForm((prev) => ({
                            ...prev,
                            projectIds: prev.projectIds.includes(p.id)
                              ? prev.projectIds.filter((id) => id !== p.id)
                              : [...prev.projectIds, p.id],
                          }))
                        }
                      />
                      <span className="truncate">{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditUser(null)}
                  className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Save Details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
