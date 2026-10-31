import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getNotes } from '../../services/apiClient';
import { STORAGE_DISABLED_MESSAGE } from '../../constants/config';
import { toast } from 'react-hot-toast';

export default function SettingsPage() {
  const { user, userId } = useAuth();
  const [exporting, setExporting] = useState(false);

  const exportNotes = async () => {
    setExporting(true);
    const { data, error } = await getNotes(userId);
    setExporting(false);
    if (error) { toast.error(`Could not export notes: ${error.message}`); return; }
    const blob = new Blob([JSON.stringify({ app: 'ChauleNotes', exported_at: new Date().toISOString(), notes: data || [] }, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href; link.download = `chaulenotes-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click(); URL.revokeObjectURL(href);
    toast.success('Notes export downloaded.');
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-8 text-2xl font-bold text-slate-900">Settings</h1>
      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-lg font-semibold text-slate-900">Account</h2>
        <dl className="grid gap-5 sm:grid-cols-2">
          <div><dt className="text-sm font-medium text-slate-500">Name</dt><dd className="mt-1 text-slate-900">{user?.username || 'User'}</dd></div>
          <div><dt className="text-sm font-medium text-slate-500">Email address</dt><dd className="mt-1 break-all text-slate-900">{user?.email || '—'}</dd></div>
          <div><dt className="text-sm font-medium text-slate-500">Account type</dt><dd className="mt-1 capitalize text-slate-900">{user?.role || 'user'}</dd></div>
        </dl>
        <p className="mt-5 text-xs text-slate-500">Password and email sign-in are managed by Firebase Authentication.</p>
      </section>
      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Appearance</h2>
        <p className="mt-2 text-sm text-slate-600">ChauleNotes uses a consistent light interface.</p>
      </section>
      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">File attachments</h2>
        <p className="mt-2 text-sm text-slate-600">{STORAGE_DISABLED_MESSAGE}</p>
        <span className="mt-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Optional</span>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Data management</h2>
        <p className="mt-2 text-sm text-slate-600">Download a JSON copy of the notes available to your account.</p>
        <button onClick={exportNotes} disabled={exporting} className="mt-5 rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60">{exporting ? 'Preparing export…' : 'Export notes (JSON)'}</button>
      </section>
    </div>
  );
}
