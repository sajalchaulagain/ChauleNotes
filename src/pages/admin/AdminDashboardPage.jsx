import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { BRAND_NAME, FIREBASE_CONFIG, PYTHON_API_URL } from '../../constants/config';
import { toast } from 'react-hot-toast';
import {
  getAllUsers,
  toggleUserRole,
  getAdminStats,
  getAdminNotes,
} from '../../services/apiClient';
import {
  ShieldCheck, Users, FileText, Server, Database,
  CheckCircle2, ArrowUpDown, RefreshCw,
  ListTodo, KeyRound, ExternalLink, Search, Lock,
} from 'lucide-react';

/**
 * Admin Control Center.
 *
 * Every button here calls the Python API:
 *   GET /admin/users              -> list profiles (no passwords, ever)
 *   PUT /admin/users/{id}/role    -> toggle user <-> admin
 *   GET /admin/stats              -> Firestore counts + recent admin logs
 *   GET /admin/notes              -> view every note in the workspace
 *
 * Python re-checks the admin role on the server for each request, so hiding a
 * button in React is only a convenience - it is never the security boundary.
 */
export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [notes, setNotes] = useState([]);
  const [stats, setStats] = useState(null);
  const [noteSearch, setNoteSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchAdminData = async () => {
    setLoading(true);
    const [usersRes, notesRes, statsRes] = await Promise.all([
      getAllUsers(),
      getAdminNotes(),
      getAdminStats(),
    ]);

    if (usersRes.data) setUsers(usersRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (statsRes.data) setStats(statsRes.data);

    if (usersRes.error || notesRes.error) {
      toast.error('Some admin data could not be loaded from the Python API.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleRoleChange = async (uid, currentRole) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    const { error } = await toggleUserRole(uid, newRole);
    if (!error) {
      toast.success(`Role updated to ${newRole}`);
      setUsers((prev) => prev.map((u) => (u.id === uid ? { ...u, role: newRole } : u)));
      setStats((prev) =>
        prev
          ? {
              ...prev,
              admins: Math.max(
                0,
                (prev.admins || 0) + (newRole === 'admin' ? 1 : -1)
              ),
            }
          : prev
      );
    } else {
      toast.error(error.message || 'Failed to update role');
    }
  };

  const filteredNotes = notes.filter((note) => {
    if (!noteSearch.trim()) return true;
    const query = noteSearch.toLowerCase();
    return (
      (note.title || '').toLowerCase().includes(query) ||
      (note.owner_name || '').toLowerCase().includes(query) ||
      (note.owner_email || '').toLowerCase().includes(query)
    );
  });

  const apiLabel = (PYTHON_API_URL || '').replace(/^https?:\/\//, '');

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Admin Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 ">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900  flex items-center gap-2.5">
            <ShieldCheck className="text-indigo-600" />
            {BRAND_NAME} Admin Control Center
          </h1>
          <p className="text-xs text-slate-500  mt-1">
            Manage roles, oversee every workspace note, and monitor the Firebase-backed Python API.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchAdminData}
          className="inline-flex items-center gap-2 px-3 py-2 bg-slate-100  hover:bg-slate-200  text-slate-700  rounded-xl text-xs font-semibold transition-colors self-start sm:self-auto"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* System Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white  p-5 rounded-2xl border border-slate-200/80  shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Registered Users</span>
            <Users size={18} className="text-indigo-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 ">{users.length}</p>
          <p className="text-[11px] text-slate-400 mt-1">{stats?.admins ?? 0} admin(s)</p>
        </div>

        <div className="bg-white  p-5 rounded-2xl border border-slate-200/80  shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Workspace Pages</span>
            <FileText size={18} className="text-violet-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 ">
            {stats?.pages ?? notes.length}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">{stats?.trashed_pages ?? 0} in trash</p>
        </div>

        <div className="bg-white  p-5 rounded-2xl border border-slate-200/80  shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Tasks</span>
            <ListTodo size={18} className="text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 ">{stats?.tasks ?? 0}</p>
          <p className="text-[11px] text-slate-400 mt-1">Across all members</p>
        </div>

        <div className="bg-white  p-5 rounded-2xl border border-slate-200/80  shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">JWT Guard</span>
            <Lock size={18} className="text-indigo-600" />
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 ">
            <CheckCircle2 size={14} /> Active & Enforced
          </span>
          <p className="text-[11px] text-slate-400 mt-1">Python checks every request</p>
        </div>
      </div>

      {/* Connection info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white  p-4 rounded-2xl border border-slate-200/80  flex items-center gap-3">
          <Server size={18} className="text-emerald-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Python API</p>
            <p className="text-xs font-mono font-medium text-emerald-600  truncate">
              {apiLabel || 'not configured'}
            </p>
          </div>
        </div>
        <div className="bg-white  p-4 rounded-2xl border border-slate-200/80  flex items-center gap-3">
          <Database size={18} className="text-amber-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Firebase Project</p>
            <p className="text-xs font-mono font-medium text-amber-600  truncate">
              {stats?.project_id || FIREBASE_CONFIG.projectId}
            </p>
          </div>
        </div>
      </div>

      {/* User Management Section */}
      <section className="bg-white  rounded-2xl border border-slate-200/80  overflow-hidden shadow-xs">
        <div className="p-5 border-b border-slate-200/80  flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 ">Workspace Members & Roles</h2>
            <p className="text-xs text-slate-500 ">
              Profiles from Firestore. Passwords stay inside Firebase Auth and are never returned.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100  text-slate-600 ">
            {users.length} Total
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/80  text-slate-500  text-xs font-semibold uppercase tracking-wider">
                <th className="p-4">Username</th>
                <th className="p-4">Email</th>
                <th className="p-4">Current Role</th>
                <th className="p-4">Created Date</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 ">
              {users.map((u) => {
                const isSelf = u.id === user?.id;
                return (
                  <tr key={u.id} className="hover:bg-slate-50/60  transition-colors">
                    <td className="p-4 font-semibold text-slate-900 ">
                      <span className="inline-flex items-center gap-2">
                        {u.username || 'Anonymous'}
                        {isSelf && (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">
                            You
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="p-4 text-slate-500 ">
                      {u.email || 'user@chaule.com'}
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          u.role === 'admin'
                            ? 'bg-indigo-100 text-indigo-700  '
                            : 'bg-slate-100 text-slate-700  '
                        }`}
                      >
                        {u.role === 'admin' && <ShieldCheck size={12} />}
                        {u.role}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-slate-400">
                      {new Date(u.created_at || Date.now()).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleRoleChange(u.id, u.role)}
                        disabled={isSelf}
                        title={isSelf ? 'You cannot change your own role' : 'Toggle admin access'}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100   text-indigo-600  text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ArrowUpDown size={13} />
                        Toggle to {u.role === 'admin' ? 'User' : 'Admin'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Admin note flexibility */}
      <section className="bg-white  rounded-2xl border border-slate-200/80  overflow-hidden shadow-xs">
        <div className="p-5 border-b border-slate-200/80  flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 ">All Workspace Notes</h2>
            <p className="text-xs text-slate-500 ">
              Admin flexibility: open and edit any note through the same editor.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              value={noteSearch}
              onChange={(e) => setNoteSearch(e.target.value)}
              placeholder="Filter by title or owner..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-slate-100  border border-transparent focus:border-indigo-500 focus:bg-white  outline-none text-slate-900 "
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/80  text-slate-500  text-xs font-semibold uppercase tracking-wider">
                <th className="p-4">Note</th>
                <th className="p-4">Owner</th>
                <th className="p-4">Updated</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 ">
              {filteredNotes.slice(0, 50).map((note) => (
                <tr key={note.id} className="hover:bg-slate-50/60  transition-colors">
                  <td className="p-4 font-semibold text-slate-900  max-w-[240px] truncate">
                    {note.title || 'Untitled Page'}
                  </td>
                  <td className="p-4 text-xs text-slate-500 ">
                    {note.owner_name || 'Unknown'}
                    {note.owner_email ? (
                      <span className="block text-[10px] text-slate-400">{note.owner_email}</span>
                    ) : null}
                  </td>
                  <td className="p-4 text-xs text-slate-400">
                    {new Date(note.updated_at || Date.now()).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1">
                      {note.is_trashed && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700  ">
                          Trash
                        </span>
                      )}
                      {note.is_archived && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700  ">
                          Archived
                        </span>
                      )}
                      {note.is_favorite && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700  ">
                          Favorite
                        </span>
                      )}
                      {!note.is_trashed && !note.is_archived && !note.is_favorite && (
                        <span className="text-[11px] text-slate-400">Active</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <Link
                      to={`/note/${note.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-indigo-600 text-slate-700 hover:text-white   text-xs font-semibold rounded-lg transition-colors"
                    >
                      <ExternalLink size={13} /> Open
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredNotes.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-xs text-slate-400">
                    {loading ? 'Loading notes from the Python API...' : 'No notes match this filter yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent Admin Activity */}
      {Array.isArray(stats?.recent_logs) && stats.recent_logs.length > 0 && (
        <section className="bg-white  rounded-2xl border border-slate-200/80  p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900  flex items-center gap-2 mb-3">
            <KeyRound size={15} className="text-indigo-600" /> Recent Admin Activity
          </h2>
          <ul className="space-y-2">
            {stats.recent_logs.slice(0, 6).map((log) => (
              <li key={log.id} className="text-xs text-slate-500  flex flex-wrap gap-2">
                <span className="font-mono text-indigo-600 ">{log.action}</span>
                <span className="text-slate-400">target: {log.target_id || 'n/a'}</span>
                <span className="text-slate-400">
                  {new Date(log.created_at || Date.now()).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Firebase + Python setup helper */}
      <section className="bg-indigo-50/70  border border-indigo-200/80  p-6 rounded-2xl space-y-2">
        <h3 className="font-bold text-sm text-indigo-900  flex items-center gap-2">
          <Database size={16} /> Firebase + Python Synchronization
        </h3>
        <p className="text-xs text-indigo-800/80  leading-relaxed">
          Firestore collections (<code className="px-1 bg-indigo-100  rounded font-mono">profiles</code>,{' '}
          <code className="px-1 bg-indigo-100  rounded font-mono">workspaces</code>,{' '}
          <code className="px-1 bg-indigo-100  rounded font-mono">pages</code>,{' '}
          <code className="px-1 bg-indigo-100  rounded font-mono">tasks</code>,{' '}
          <code className="px-1 bg-indigo-100  rounded font-mono">attachments</code>,{' '}
          <code className="px-1 bg-indigo-100  rounded font-mono">admin_logs</code>) are created
          automatically on first use. The <code className="px-1 bg-indigo-100  rounded font-mono">attachments</code> collection
          stays optional and is only used when Firebase Storage (Blaze plan) is configured. Run the backend with{' '}
          <code className="px-1 bg-indigo-100  rounded font-mono">uvicorn main:app --reload</code> and
          open <code className="px-1 bg-indigo-100  rounded font-mono">/docs</code> to test endpoints.
          Python is the security guard; React never holds the Firebase service-account key.
        </p>
      </section>
    </div>
  );
}
