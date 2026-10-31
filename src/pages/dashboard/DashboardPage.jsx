import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { BRAND_NAME, TAGLINE } from '../../constants/config';
import {
  FileText, Plus, LayoutTemplate, ListTodo, Star,
  Clock, ArrowRight, Trash2, Sparkles, Folder
} from 'lucide-react';
import { getNotes, createNote, toggleFavoriteNote, deleteNoteToTrash, getTasks } from '../../services/apiClient';
import { toast } from 'react-hot-toast';

export default function DashboardPage() {
  const { user, userId } = useAuth();
  const navigate = useNavigate();

  const [notes, setNotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    setLoading(true);
    const [notesRes, tasksRes] = await Promise.all([
      getNotes(userId, { is_trashed: false, is_archived: false }),
      getTasks(userId),
    ]);
    if (notesRes.data) setNotes(notesRes.data);
    if (tasksRes.data) setTasks(tasksRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchDashboardData();
  }, [userId]);

  const handleCreateNewNote = async () => {
    try {
      const { data, error } = await createNote({
        title: 'Untitled Page',
        owner_id: userId,
      });
      if (!error && data?.id) {
        toast.success('New note created!');
        navigate(`/note/${data.id}`);
      }
    } catch (e) {
      toast.error('Failed to create note');
    }
  };

  const handleToggleFavorite = async (e, noteId, currentFav) => {
    e.stopPropagation();
    const next = !currentFav;
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, is_favorite: next } : n)));
    await toggleFavoriteNote(noteId, next, userId);
    toast.success(next ? 'Added to favorites' : 'Removed from favorites');
  };

  const handleDeleteNote = async (e, noteId) => {
    e.stopPropagation();
    if (window.confirm('Move this note to trash?')) {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      await deleteNoteToTrash(noteId, userId);
      toast.success('Moved to trash');
    }
  };

  const getTimeGreeting = () => {
    const hours = new Date().getHours();
    if (hours < 12) return 'Good morning';
    if (hours < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const favoriteCount = notes.filter((n) => n.is_favorite).length;
  const pendingTasksCount = tasks.filter((t) => !t.is_completed).length;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200/60 ">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900  tracking-tight">
              {getTimeGreeting()}, {user?.user_metadata?.username || user?.email?.split('@')[0] || 'User'}
            </h1>
          </div>
          <p className="text-sm text-slate-500 ">
            {TAGLINE} • Focus on ideas, capture thoughts effortlessly.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCreateNewNote}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-indigo-500/20 self-start md:self-auto"
        >
          <Plus size={18} />
          <span>Create Note</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white  p-5 rounded-2xl border border-slate-200/70  shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 ">Total Notes</span>
            <FileText size={18} className="text-indigo-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 ">{notes.length}</p>
        </div>

        <div className="bg-white  p-5 rounded-2xl border border-slate-200/70  shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 ">Favorites</span>
            <Star size={18} className="text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 ">{favoriteCount}</p>
        </div>

        <div className="bg-white  p-5 rounded-2xl border border-slate-200/70  shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 ">Pending Tasks</span>
            <ListTodo size={18} className="text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 ">{pendingTasksCount}</p>
        </div>

        <div className="bg-white  p-5 rounded-2xl border border-slate-200/70  shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 ">Templates</span>
            <LayoutTemplate size={18} className="text-violet-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 ">6 Ready</p>
        </div>
      </div>

      {/* Quick Launch Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={handleCreateNewNote}
          className="group bg-white  p-6 rounded-2xl border border-slate-200/70  shadow-xs hover:border-indigo-500/50 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-50  text-indigo-600  flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Plus size={22} />
          </div>
          <h3 className="font-bold text-slate-900  mb-1 flex items-center justify-between">
            Blank Canvas
            <ArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
          </h3>
          <p className="text-xs text-slate-500  leading-relaxed">
            Start writing with a clean, distraction-free markdown canvas.
          </p>
        </div>

        <Link
          to="/templates"
          className="group bg-white  p-6 rounded-2xl border border-slate-200/70  shadow-xs hover:border-violet-500/50 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-violet-50  text-violet-600  flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <LayoutTemplate size={22} />
          </div>
          <h3 className="font-bold text-slate-900  mb-1 flex items-center justify-between">
            Use Templates
            <ArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
          </h3>
          <p className="text-xs text-slate-500  leading-relaxed">
            Pick from meeting notes, project roadmaps, and weekly planners.
          </p>
        </Link>

        <Link
          to="/tasks"
          className="group bg-white  p-6 rounded-2xl border border-slate-200/70  shadow-xs hover:border-emerald-500/50 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50  text-emerald-600  flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <ListTodo size={22} />
          </div>
          <h3 className="font-bold text-slate-900  mb-1 flex items-center justify-between">
            Task Planner
            <ArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
          </h3>
          <p className="text-xs text-slate-500  leading-relaxed">
            Track action items with due dates and priority indicators.
          </p>
        </Link>
      </div>

      {/* Recent Notes Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900  flex items-center gap-2">
            <Clock size={18} className="text-indigo-600" />
            Recent Notes
          </h2>
          <Link to="/notes" className="text-xs font-semibold text-indigo-600 hover:underline">
            View All Notes ({notes.length})
          </Link>
        </div>

        {loading ? (
          <div className="bg-white  rounded-2xl p-8 border border-slate-200  text-center text-slate-400 text-sm">
            Loading recent notes...
          </div>
        ) : notes.length === 0 ? (
          <div className="bg-white  rounded-2xl p-12 border border-slate-200/70  text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-indigo-50  text-indigo-600 mx-auto flex items-center justify-center">
              <FileText size={24} />
            </div>
            <h3 className="font-semibold text-slate-800 ">No notes created yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Get started by creating your first note or selecting a ready-to-use template.
            </p>
            <button
              type="button"
              onClick={handleCreateNewNote}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-medium"
            >
              <Plus size={16} /> Create First Note
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {notes.slice(0, 6).map((item) => (
              <div
                key={item.id}
                onClick={() => navigate(`/note/${item.id}`)}
                className="group bg-white  p-5 rounded-2xl border border-slate-200/70  hover:border-indigo-500/40 hover:shadow-sm transition-all cursor-pointer flex items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-900  truncate group-hover:text-indigo-600 transition-colors">
                      {item.title || 'Untitled Page'}
                    </span>
                    {item.is_favorite && (
                      <Star size={13} className="text-amber-500 shrink-0 fill-amber-500" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    Modified {new Date(item.updated_at || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => handleToggleFavorite(e, item.id, item.is_favorite)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-slate-100  transition-colors"
                    title="Toggle favorite"
                  >
                    <Star size={16} fill={item.is_favorite ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteNote(e, item.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50  transition-colors"
                    title="Move to trash"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
