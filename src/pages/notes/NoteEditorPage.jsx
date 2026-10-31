import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ChauleEditor from '../../components/editor/ChauleEditor';
import AttachmentPanel from '../../components/attachments/AttachmentPanel';
import { BRAND_NAME } from '../../constants/config';
import { Star, Archive, Trash2, ArrowLeft, Calendar, FileDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  getNoteById, updateNote, deleteNoteToTrash,
  toggleFavoriteNote, toggleArchiveNote
} from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';

export default function NoteEditorPage() {
  const { id } = useParams();
  const { userId } = useAuth();
  const navigate = useNavigate();

  const [note, setNote] = useState(null);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const titleTimerRef = useRef(null);

  // Autosave the title through Python PUT /notes/{id}. We debounce so typing
  // does not send one HTTP request per keystroke (the editor content has its
  // own 1.5s autosave inside ChauleEditor).
  const saveTitle = async (nextTitle) => {
    if (!id) return;
    const { data, error } = await updateNote(id, undefined, nextTitle, userId);
    if (error) {
      toast.error('Title could not be saved. Check your connection and try again.');
      return;
    }
    if (data) setNote((current) => current ? { ...current, ...data, title: nextTitle } : current);
  };

  useEffect(() => {
    if (!id) return;
    let isMounted = true;

    const fetchNote = async () => {
      setLoading(true);
      const { data, error } = await getNoteById(id, userId);
      if (isMounted) {
        if (data) {
          setNote(data);
          setTitle(data.title || 'Untitled Page');
          setIsFavorite(Boolean(data.is_favorite));
          setIsArchived(Boolean(data.is_archived));
        } else {
          toast.error('Note not found');
        }
        setLoading(false);
      }
    };

    fetchNote();
    return () => {
      isMounted = false;
    };
  }, [id, userId]);

  const handleTitleChange = (e) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(() => { void saveTitle(newTitle); }, 800);
  };

  const handleTitleBlur = () => {
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    void saveTitle(title);
  };

  useEffect(
    () => () => {
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    },
    []
  );

  const handleToggleFavorite = async () => {
    const next = !isFavorite;
    setIsFavorite(next);
    const { error } = await toggleFavoriteNote(id, next, userId);
    if (error) {
      setIsFavorite(!next);
      toast.error('Favorite status could not be saved.');
      return;
    }
    setNote((current) => current ? { ...current, is_favorite: next } : current);
    toast.success(next ? 'Added to favorites' : 'Removed from favorites');
  };

  const handleToggleArchive = async () => {
    const next = !isArchived;
    setIsArchived(next);
    const { error } = await toggleArchiveNote(id, next, userId);
    if (error) {
      setIsArchived(!next);
      toast.error('Archive status could not be saved.');
      return;
    }
    setNote((current) => current ? { ...current, is_archived: next } : current);
    toast.success(next ? 'Archived note' : 'Unarchived note');
  };

  const handleMoveToTrash = async () => {
    if (window.confirm('Move this note to trash?')) {
      const { error } = await deleteNoteToTrash(id, userId);
      if (!error) {
        toast.success('Moved to trash');
        navigate('/notes');
      } else {
        toast.error('Failed to move to trash');
      }
    }
  };

  const handleExport = (format = 'json') => {
    if (!note) return;
    let dataStr = '';
    let fileName = `${title.replace(/\s+/g, '_')}_${id}.${format}`;

    if (format === 'json') {
      dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(note, null, 2));
    } else {
      // Export as simple markdown
      const mdContent = `# ${title}\n\nExported from ${BRAND_NAME} on ${new Date().toLocaleDateString()}\n`;
      dataStr = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(mdContent);
      fileName = `${title.replace(/\s+/g, '_')}_${id}.md`;
    }

    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', fileName);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast.success(`Exported as ${format.toUpperCase()}`);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-12 flex flex-col items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-sm">Loading note...</p>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <h2 className="text-xl font-bold mb-2">Note Not Found</h2>
        <p className="text-slate-500 mb-6 text-sm">The requested note might have been deleted or moved.</p>
        <Link to="/" className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium">
          <ArrowLeft size={16} /> Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Navigation & Actions Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-slate-500 ">
          <Link to="/notes" className="hover:text-indigo-600 flex items-center gap-1 transition-colors">
            <ArrowLeft size={14} /> Notes
          </Link>
          <span>/</span>
          <span className="font-medium text-slate-700  truncate max-w-[200px]">
            {title || 'Untitled'}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 bg-white  border border-slate-200  rounded-xl p-1 shadow-xs">
          <button
            type="button"
            onClick={handleToggleFavorite}
            className={`p-2 rounded-lg transition-colors ${
              isFavorite
                ? 'text-amber-500 bg-amber-50 '
                : 'text-slate-500 hover:text-slate-800  hover:bg-slate-100 '
            }`}
            title={isFavorite ? 'Remove Favorite' : 'Mark as Favorite'}
          >
            <Star size={18} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>

          <button
            type="button"
            onClick={handleToggleArchive}
            className={`p-2 rounded-lg transition-colors ${
              isArchived
                ? 'text-indigo-600 bg-indigo-50 '
                : 'text-slate-500 hover:text-slate-800  hover:bg-slate-100 '
            }`}
            title={isArchived ? 'Unarchive Note' : 'Archive Note'}
          >
            <Archive size={18} />
          </button>

          <button
            type="button"
            onClick={() => handleExport('json')}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800  hover:bg-slate-100  transition-colors"
            title="Export as JSON"
          >
            <FileDown size={18} />
          </button>

          <div className="w-px h-5 bg-slate-200  mx-1" />

          <button
            type="button"
            onClick={handleMoveToTrash}
            className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50  transition-colors"
            title="Move to Trash"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Note Title Input */}
      <div>
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          onBlur={handleTitleBlur}
          placeholder="Untitled Page"
          className="w-full text-3xl md:text-4xl font-extrabold bg-transparent text-slate-900  border-none outline-none focus:ring-0 placeholder:text-slate-300  tracking-tight"
        />
        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Calendar size={13} />
            Updated {new Date(note.updated_at || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          {note.tags && note.tags.length > 0 && (
            <div className="flex items-center gap-1">
              {note.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded-full bg-slate-100  text-slate-600  text-[10px]">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tiptap Rich-Text Editor */}
      <ChauleEditor
        key={id}
        initialContent={note.content}
        noteId={id}
        noteTitle={title}
        onTitleChange={setTitle}
      />

      {/* Optional file attachments (disabled on the free Spark plan) */}
      <AttachmentPanel noteId={id} />
    </div>
  );
}
