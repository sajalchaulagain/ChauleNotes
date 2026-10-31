import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  FileText, Star, Archive, Trash2, Plus,
  RotateCcw, Search, Filter, AlertTriangle
} from 'lucide-react';
import {
  getNotes, createNote, toggleFavoriteNote,
  deleteNoteToTrash, restoreNoteFromTrash, permanentDeleteNote
} from '../../services/apiClient';
import { toast } from 'react-hot-toast';

export default function NotesListPage() {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState(searchParams.get('search') || '');

  // Determine view mode based on pathname
  const isTrashView = location.pathname.includes('/trash');
  const isArchiveView = location.pathname.includes('/archive');
  const isFavoriteView = location.pathname.includes('/favorites');

  const fetchNotes = async () => {
    setLoading(true);
    const filters = {};
    if (isTrashView) {
      filters.is_trashed = true;
    } else {
      filters.is_trashed = false;
      if (isArchiveView) {
        filters.is_archived = true;
      } else {
        filters.is_archived = false;
      }
      if (isFavoriteView) {
        filters.is_favorite = true;
      }
    }

    const { data } = await getNotes(userId, filters);
    if (data) setNotes(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchNotes();
  }, [location.pathname, userId]);

  const handleCreateNote = async () => {
    try {
      const { data, error } = await createNote({
        title: 'Untitled Page',
        owner_id: userId,
      });
      if (!error && data?.id) {
        toast.success('Note created');
        navigate(`/note/${data.id}`);
      }
    } catch {
      toast.error('Failed to create note');
    }
  };

  const handleToggleFavorite = async (e, id, currentFav) => {
    e.stopPropagation();
    const next = !currentFav;
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, is_favorite: next } : n)));
    await toggleFavoriteNote(id, next, userId);
  };

  const handleMoveToTrash = async (e, id) => {
    e.stopPropagation();
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await deleteNoteToTrash(id, userId);
    toast.success('Moved to trash');
  };

  const handleRestore = async (e, id) => {
    e.stopPropagation();
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await restoreNoteFromTrash(id, userId);
    toast.success('Note restored');
  };

  const handlePermanentDelete = async (e, id) => {
    e.stopPropagation();
    if (window.confirm('Delete note permanently? This action cannot be undone.')) {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      await permanentDeleteNote(id, userId);
      toast.success('Note permanently deleted');
    }
  };

  const pageTitle = isTrashView
    ? 'Trash'
    : isArchiveView
    ? 'Archived Notes'
    : isFavoriteView
    ? 'Favorite Notes'
    : 'All Notes';

  const filteredNotes = notes.filter((n) => {
    if (!filterText.trim()) return true;
    return n.title?.toLowerCase().includes(filterText.toLowerCase().trim());
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900  flex items-center gap-2.5">
            {isTrashView ? <Trash2 className="text-red-500" /> : isFavoriteView ? <Star className="text-amber-500" /> : isArchiveView ? <Archive className="text-indigo-500" /> : <FileText className="text-indigo-600" />}
            {pageTitle}
          </h1>
          <p className="text-xs text-slate-500  mt-1">
            {isTrashView
              ? 'Items in trash can be restored or deleted permanently.'
              : `${notes.length} note${notes.length === 1 ? '' : 's'} available`}
          </p>
        </div>

        {!isTrashView && (
          <button
            type="button"
            onClick={handleCreateNote}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
          >
            <Plus size={18} /> New Note
          </button>
        )}
      </div>

      {/* Filter / Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter current view..."
          className="w-full pl-9 pr-4 py-2 rounded-xl text-sm bg-white  border border-slate-200  text-slate-900  focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      {/* Notes Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Loading notes...</div>
      ) : filteredNotes.length === 0 ? (
        <div className="bg-white  rounded-2xl p-12 border border-slate-200/80  text-center space-y-3">
          <p className="text-sm text-slate-500">No notes found in this view.</p>
          {!isTrashView && (
            <button
              type="button"
              onClick={handleCreateNote}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold"
            >
              <Plus size={16} /> Create Note
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((item) => (
            <div
              key={item.id}
              onClick={() => !isTrashView && navigate(`/note/${item.id}`)}
              className={`bg-white  p-5 rounded-2xl border border-slate-200/70  ${
                !isTrashView ? 'hover:border-indigo-500/40 hover:shadow-md cursor-pointer' : ''
              } transition-all flex flex-col justify-between h-[150px]`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-slate-900  truncate">
                    {item.title || 'Untitled Page'}
                  </h3>
                  {!isTrashView && (
                    <button
                      type="button"
                      onClick={(e) => handleToggleFavorite(e, item.id, item.is_favorite)}
                      className="text-slate-400 hover:text-amber-500 transition-colors"
                      title="Toggle favorite"
                    >
                      <Star size={16} fill={item.is_favorite ? '#f59e0b' : 'none'} className={item.is_favorite ? 'text-amber-500' : ''} />
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Updated {new Date(item.updated_at || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100  text-xs">
                {isTrashView ? (
                  <div className="flex items-center gap-2 w-full justify-end">
                    <button
                      type="button"
                      onClick={(e) => handleRestore(e, item.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-indigo-600 hover:bg-indigo-50  rounded-lg transition-colors font-medium"
                    >
                      <RotateCcw size={14} /> Restore
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handlePermanentDelete(e, item.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-red-600 hover:bg-red-50  rounded-lg transition-colors font-medium"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[11px] text-indigo-600 hover:underline">Open Note →</span>
                    <button
                      type="button"
                      onClick={(e) => handleMoveToTrash(e, item.id)}
                      className="p-1 text-slate-400 hover:text-red-500 transition-colors rounded"
                      title="Move to trash"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
