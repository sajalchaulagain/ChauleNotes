import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Color from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { useAuth } from '../../context/AuthContext';
import { updateNote } from '../../services/apiClient';
import { toast } from 'react-hot-toast';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Highlighter, Heading1, Heading2, Heading3, List, ListOrdered,
  Quote, Code, Table as TableIcon, Undo, Redo, CheckCircle2,
  Clock, AlertCircle
} from 'lucide-react';

export default function ChauleEditor({ initialContent, noteId, noteTitle, onTitleChange }) {
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('Saved'); // 'Saved', 'Saving...', 'Unsaved', 'Error'
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const { userId } = useAuth();
  const autosaveTimerRef = useRef(null);
  // Remember the newest editor JSON so navigating away cannot lose the last edit.
  const pendingContentRef = useRef(null);
  const latestRef = useRef({ noteId, noteTitle, userId });

  useEffect(() => {
    latestRef.current = { noteId, noteTitle, userId };
  }, [noteId, noteTitle, userId]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      Link.configure({ openOnClick: false }),
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: initialContent || '<p>Start typing your thoughts here...</p>',
    onUpdate: ({ editor: ed }) => {
      setStatus('Unsaved');
      const text = ed.getText();
      setCharCount(text.length);
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      setWordCount(words);

      const json = ed.getJSON();
      pendingContentRef.current = json;

      // Debounced Autosave (1.5 seconds) -> Python PUT /notes/{id}
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        saveContent(json, false);
      }, 1500);
    },
  });

  // Keep editor content in sync if note changes
  useEffect(() => {
    if (editor && initialContent) {
      const currentJSON = JSON.stringify(editor.getJSON());
      const incomingJSON = typeof initialContent === 'string' ? initialContent : JSON.stringify(initialContent);
      if (currentJSON !== incomingJSON) {
        editor.commands.setContent(initialContent);
      }
    }
  }, [initialContent, editor]);

  // Clean up the timer and flush one last save when leaving the note.
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      const pending = pendingContentRef.current;
      if (pending && latestRef.current.noteId) {
        // Fire-and-forget: the SPA is still alive, so the PUT can finish.
        updateNote(
          latestRef.current.noteId,
          pending,
          latestRef.current.noteTitle,
          latestRef.current.userId
        );
      }
    };
  }, []);

  const saveContent = async (jsonContent, showToast = true) => {
    if (!noteId) return;
    setIsSaving(true);
    setStatus('Saving...');

    try {
      const contentToSave = jsonContent || editor?.getJSON();
      const { error } = await updateNote(noteId, contentToSave, noteTitle, userId);
      if (error) throw error;
      pendingContentRef.current = null;
      setStatus('Saved');
      if (showToast) {
        toast.success('Note saved!');
      }
    } catch (err) {
      console.error('Failed to save note:', err);
      setStatus('Error');
      if (showToast) {
        toast.error('Failed to save note. Check that the Python API is running.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!editor) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400">
        <div className="animate-pulse">Loading ChauleEditor...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col border border-slate-200  rounded-2xl overflow-hidden bg-white  shadow-sm transition-all">
      {/* Editor Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2.5 border-b border-slate-200  bg-slate-50/70  backdrop-blur sticky top-0 z-10">
        {/* History */}
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="p-1.5 rounded hover:bg-slate-200  disabled:opacity-30 text-slate-600  transition-colors"
          title="Undo (Ctrl+Z)"
        >
          <Undo size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="p-1.5 rounded hover:bg-slate-200  disabled:opacity-30 text-slate-600  transition-colors"
          title="Redo (Ctrl+Y)"
        >
          <Redo size={16} />
        </button>

        <div className="w-px h-5 bg-slate-300  mx-1" />

        {/* Headings */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`p-1.5 rounded transition-colors ${editor.isActive('heading', { level: 1 }) ? 'bg-indigo-100  text-indigo-600 ' : 'text-slate-600  hover:bg-slate-200 '}`}
          title="Heading 1"
        >
          <Heading1 size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-1.5 rounded transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-indigo-100  text-indigo-600 ' : 'text-slate-600  hover:bg-slate-200 '}`}
          title="Heading 2"
        >
          <Heading2 size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`p-1.5 rounded transition-colors ${editor.isActive('heading', { level: 3 }) ? 'bg-indigo-100  text-indigo-600 ' : 'text-slate-600  hover:bg-slate-200 '}`}
          title="Heading 3"
        >
          <Heading3 size={16} />
        </button>

        <div className="w-px h-5 bg-slate-300  mx-1" />

        {/* Text Formats */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded transition-colors ${editor.isActive('bold') ? 'bg-indigo-100  text-indigo-600  font-bold' : 'text-slate-600  hover:bg-slate-200 '}`}
          title="Bold (Ctrl+B)"
        >
          <Bold size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded transition-colors ${editor.isActive('italic') ? 'bg-indigo-100  text-indigo-600 ' : 'text-slate-600  hover:bg-slate-200 '}`}
          title="Italic (Ctrl+I)"
        >
          <Italic size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`p-1.5 rounded transition-colors ${editor.isActive('underline') ? 'bg-indigo-100  text-indigo-600 ' : 'text-slate-600  hover:bg-slate-200 '}`}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`p-1.5 rounded transition-colors ${editor.isActive('strike') ? 'bg-indigo-100  text-indigo-600 ' : 'text-slate-600  hover:bg-slate-200 '}`}
          title="Strikethrough"
        >
          <Strikethrough size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          className={`p-1.5 rounded transition-colors ${editor.isActive('highlight') ? 'bg-yellow-200  text-yellow-800 ' : 'text-slate-600  hover:bg-slate-200 '}`}
          title="Highlight"
        >
          <Highlighter size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={`p-1.5 rounded transition-colors ${editor.isActive('code') ? 'bg-indigo-100  text-indigo-600 ' : 'text-slate-600  hover:bg-slate-200 '}`}
          title="Inline Code"
        >
          <Code size={16} />
        </button>

        <div className="w-px h-5 bg-slate-300  mx-1" />

        {/* Lists & Quotes */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-1.5 rounded transition-colors ${editor.isActive('bulletList') ? 'bg-indigo-100  text-indigo-600 ' : 'text-slate-600  hover:bg-slate-200 '}`}
          title="Bullet List"
        >
          <List size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-1.5 rounded transition-colors ${editor.isActive('orderedList') ? 'bg-indigo-100  text-indigo-600 ' : 'text-slate-600  hover:bg-slate-200 '}`}
          title="Numbered List"
        >
          <ListOrdered size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`p-1.5 rounded transition-colors ${editor.isActive('blockquote') ? 'bg-indigo-100  text-indigo-600 ' : 'text-slate-600  hover:bg-slate-200 '}`}
          title="Blockquote"
        >
          <Quote size={16} />
        </button>

        {/* Table Action */}
        <button
          type="button"
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          className="p-1.5 rounded hover:bg-slate-200  text-slate-600  transition-colors"
          title="Insert Table (3x3)"
        >
          <TableIcon size={16} />
        </button>

        {/* Status Indicator & Save */}
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 ">
            {status === 'Saved' && <CheckCircle2 size={14} className="text-emerald-500" />}
            {status === 'Saving...' && <Clock size={14} className="text-amber-500 animate-spin" />}
            {status === 'Unsaved' && <Clock size={14} className="text-amber-500" />}
            {status === 'Error' && <AlertCircle size={14} className="text-red-500" />}
            <span>{status}</span>
          </div>

          <button
            type="button"
            onClick={() => saveContent(null, true)}
            disabled={isSaving || status === 'Saved'}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 shadow-sm"
          >
            Save Note
          </button>
        </div>
      </div>

      {/* Editor Content Area */}
      <div className="p-6 md:p-8 min-h-[420px] focus-within:ring-0 cursor-text" onClick={() => editor.commands.focus()}>
        <EditorContent editor={editor} />
      </div>

      {/* Footer Word & Character Counter */}
      <div className="flex items-center justify-between px-6 py-2 border-t border-slate-100  bg-slate-50/50  text-[11px] text-slate-400">
        <div>
          <span>{wordCount} words</span>
          <span className="mx-2">•</span>
          <span>{charCount} characters</span>
        </div>
        <div className="text-slate-400 text-[11px]">
          Markdown & rich-text enabled
        </div>
      </div>
    </div>
  );
}
