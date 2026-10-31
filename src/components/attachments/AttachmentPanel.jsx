import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronRight,
  Download,
  Folder,
  FolderPlus,
  FileText,
  Loader2,
  Lock,
  Paperclip,
  Trash2,
  Upload,
  Search,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  deleteAttachment,
  deleteAttachmentFolder,
  createAttachmentFolder,
  getAttachmentFolders,
  getAttachmentFolderTree,
  getAttachmentConfig,
  getAttachments,
  hasApiSession,
  uploadAttachment,
  updateAttachmentFolder,
  moveAttachmentFolder,
  renameAttachment,
  moveAttachment,
} from '../../services/apiClient';
import { STORAGE_DISABLED_MESSAGE } from '../../constants/config';

/**
 * OPTIONAL FILE ATTACHMENTS
 * -------------------------
 * Supabase Storage is optional and configured only on the Python server:
 *
 *   - The panel asks Python /attachments/config whether a backend provider is
 *     configured. No storage setting or secret is exposed to the browser.
 *   - Nothing here is imported at app startup in a way that could initialise
 *     Supabase Storage. Auth and Firestore do not depend on this component.
 *
 * Configure the optional provider in backend/.env and restart the API.
 */
const formatSize = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export default function AttachmentPanel({ noteId }) {
  const [config, setConfig] = useState(null);
  const [items, setItems] = useState([]);
  const [folders, setFolders] = useState([]);
  const [allFolders, setAllFolders] = useState([]);
  const [folderPath, setFolderPath] = useState([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef(null);

  const signedIn = hasApiSession();
  const enabled =
    Boolean(config?.configured) &&
    signedIn;

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!signedIn) {
        if (active) setChecking(false);
        return;
      }

      setChecking(true);

      const [configResult, listResult] = await Promise.all([
        getAttachmentConfig(),
        getAttachments(noteId),
      ]);
      const folderResult = await getAttachmentFolders(folderPath.at(-1)?.id || null);
      const folderTreeResult = await getAttachmentFolderTree();

      if (!active) return;

      if (configResult.data) setConfig(configResult.data);
      if (listResult.data) setItems(listResult.data);
      if (folderResult.data) setFolders(folderResult.data);
      if (folderTreeResult.data) setAllFolders(folderTreeResult.data);
      if (configResult.error) setErrorMessage(configResult.error.message);
      else if (listResult.error) setErrorMessage(listResult.error.message);
      else if (folderResult.error) setErrorMessage(folderResult.error.message);
      else if (folderTreeResult.error) setErrorMessage(folderTreeResult.error.message);
      else setErrorMessage('');
      setChecking(false);
    };

    load();
    return () => {
      active = false;
    };
  }, [noteId, signedIn, folderPath]);

  const disabledReason = !signedIn
    ? 'Sign in to manage attachments for your notes.'
    : config && !config.configured
      ? config.message || STORAGE_DISABLED_MESSAGE
      : !config
        ? STORAGE_DISABLED_MESSAGE
        : '';

  const handleUploadClick = () => {
    if (!enabled) {
      toast.error(
        disabledReason || 'File attachments are not configured on this server.'
      );
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    setUploading(true);
    const added = [];
    for (const [index, file] of files.entries()) {
      setUploadProgress(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
      const { data, error } = await uploadAttachment(noteId, file, folderPath.at(-1)?.id || null);
      if (error) {
        toast.error(`${file.name}: ${error.message || 'Could not upload.'}`);
        setErrorMessage(error.message || 'Could not upload the attachment.');
      } else if (data) {
        added.push(data);
      }
    }
    if (added.length) {
      setItems((previous) => [...added, ...previous]);
      setErrorMessage('');
      toast.success(`${added.length} file${added.length === 1 ? '' : 's'} attached`);
    }
    setUploading(false);
    setUploadProgress('');
  };

  const handleCreateFolder = async () => {
    const name = window.prompt('Folder name');
    if (!name?.trim()) return;
    const { data, error } = await createAttachmentFolder(name.trim(), folderPath.at(-1)?.id || null);
    if (error) return toast.error(error.message || 'Could not create folder.');
    setFolders((previous) => [...previous, data].sort((a, b) => a.name.localeCompare(b.name)));
    toast.success('Folder created');
  };

  const handleRenameFolder = async (folder) => {
    const name = window.prompt('New folder name', folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;
    const { data, error } = await updateAttachmentFolder(folder.id, name.trim());
    if (error) return toast.error(error.message || 'Could not rename folder.');
    setFolders((previous) => previous.map((item) => item.id === folder.id ? data : item));
  };

  const handleDeleteFolder = async (folder) => {
    if (!window.confirm(`Delete empty folder “${folder.name}”?`)) return;
    const { error } = await deleteAttachmentFolder(folder.id);
    if (error) return toast.error(error.message || 'Folder must be empty before deleting.');
    setFolders((previous) => previous.filter((item) => item.id !== folder.id));
  };

  const handleMoveFolder = async (folder) => {
    const choices = [{ id: null, path: 'Root' }, ...allFolders.filter((item) => item.id !== folder.id)];
    const labels = choices.map((item, index) => `${index + 1}) ${item.path}`).join('\n');
    const selected = Number(window.prompt(`Move folder under (the API prevents cycles):\n${labels}`));
    if (!selected || !choices[selected - 1]) return;
    const parentId = choices[selected - 1].id;
    const { error } = await moveAttachmentFolder(folder.id, parentId);
    if (error) return toast.error(error.message || 'Could not move folder.');
    const refreshed = await getAttachmentFolders(folderPath.at(-1)?.id || null);
    if (refreshed.data) setFolders(refreshed.data);
    toast.success('Folder moved');
  };

  const handleRenameAttachment = async (attachment) => {
    const name = window.prompt('New file name', attachment.file_name);
    if (!name?.trim() || name.trim() === attachment.file_name) return;
    const { data, error } = await renameAttachment(attachment.id, name.trim());
    if (error) return toast.error(error.message || 'Could not rename file.');
    setItems((previous) => previous.map((item) => item.id === attachment.id ? data : item));
    toast.success('Attachment renamed');
  };

  const handleMoveAttachment = async (attachment) => {
    const choices = [{ id: null, path: 'Root' }, ...allFolders];
    const choiceText = choices.map((folder, index) => `${index + 1}. ${folder.path}`).join('\n');
    const selected = Number(window.prompt(`Move to folder (enter number):\n${choiceText}`));
    if (!selected || !choices[selected - 1]) return;
    const { data, error } = await moveAttachment(attachment.id, choices[selected - 1].id);
    if (error) return toast.error(error.message || 'Could not move attachment.');
    setItems((previous) => previous.map((item) => item.id === attachment.id ? data : item));
    toast.success('Attachment moved');
  };

  const visibleItems = items.filter((item) =>
    (item.folder_id || null) === (folderPath.at(-1)?.id || null) &&
    item.file_name.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => {
    if (sortBy === 'date') return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    if (sortBy === 'size') return (b.size || 0) - (a.size || 0);
    return a.file_name.localeCompare(b.file_name);
  });

  const handleDelete = async (attachment) => {
    if (!window.confirm(`Remove ${attachment.file_name}?`)) return;

    const { error } = await deleteAttachment(attachment.id);
    if (error) {
      toast.error(error.message || 'Could not delete the attachment.');
      return;
    }

    setItems((previous) =>
      previous.filter((item) => item.id !== attachment.id)
    );
    toast.success('Attachment removed');
  };

  return (
    <section className="bg-white  rounded-2xl border border-slate-200  shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100 ">
        <div className="flex items-center gap-2">
          <Paperclip size={16} className="text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-900 ">
            Attachments
          </h2>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
              enabled
                ? 'bg-emerald-100 text-emerald-700  '
                : 'bg-slate-100 text-slate-500  '
            }`}
          >
            {enabled ? 'Enabled' : 'Not configured'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleUploadClick}
          disabled={!enabled || uploading}
          title={enabled ? 'Attach a file to this note' : disabledReason}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Upload size={14} />
          )}
          {uploading ? 'Uploading...' : 'Attach file'}
        </button>

        <button type="button" onClick={handleCreateFolder} disabled={!enabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100  text-slate-700  text-xs font-semibold rounded-lg disabled:opacity-40">
          <FolderPlus size={14} /> New folder
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.webp,.gif,.zip"
          className="hidden"
          onChange={handleFileSelected}
          disabled={!enabled || uploading}
        />
      </div>

      <div className="p-4 space-y-3"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (enabled && !uploading) handleFileSelected({ target: { files: event.dataTransfer.files, value: '' } });
        }}>
        {enabled && <p className="text-[11px] text-slate-400 border border-dashed border-slate-300  rounded-lg px-3 py-2">
          Drop files here to upload. Maximum {config?.max_file_size_mb || 20} MB each; PDF, Office, text, image, and ZIP files are supported.
        </p>}
        {uploadProgress && <p className="text-xs text-indigo-600">{uploadProgress}</p>}
        <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
          <button type="button" onClick={() => setFolderPath([])} className="hover:text-indigo-600">All files</button>
          {folderPath.map((folder, index) => (
            <React.Fragment key={folder.id}>
              <ChevronRight size={12} />
              <button type="button" onClick={() => setFolderPath((path) => path.slice(0, index + 1))} className="hover:text-indigo-600">{folder.name}</button>
            </React.Fragment>
          ))}
          <div className="ml-auto relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search files"
              className="w-40 pl-7 pr-2 py-1 rounded-md bg-slate-100  outline-none" />
          </div>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="text-xs bg-slate-100  rounded-md px-2 py-1">
            <option value="name">Name</option><option value="date">Newest</option><option value="size">Size</option>
          </select>
        </div>
        {folderPath.length > 0 && (
          <button type="button" onClick={() => setFolderPath((path) => path.slice(0, -1))} className="text-xs text-indigo-600 hover:underline">← Back to parent</button>
        )}
        {folders.map((folder) => (
          <div key={folder.id} className="flex items-center gap-2 py-2 border-b border-slate-100 ">
            <button type="button" onClick={() => setFolderPath((path) => [...path, folder])} className="flex items-center gap-2 flex-1 text-left text-xs font-semibold text-slate-700 ">
              <Folder size={15} className="text-indigo-500" /> {folder.name}
            </button>
            <button type="button" disabled={!enabled} onClick={() => handleRenameFolder(folder)} className="text-[10px] text-slate-500 hover:text-indigo-600 disabled:opacity-40">Rename</button>
            <button type="button" disabled={!enabled} onClick={() => handleMoveFolder(folder)} className="text-[10px] text-slate-500 hover:text-indigo-600 disabled:opacity-40">Move</button>
            <button type="button" disabled={!enabled} onClick={() => handleDeleteFolder(folder)} className="text-[10px] text-slate-500 hover:text-red-600 disabled:opacity-40">Delete</button>
          </div>
        ))}
        {!enabled && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/80  bg-amber-50/80  p-3 text-xs text-amber-800 ">
            {signedIn ? (
              <Lock size={15} className="mt-0.5 shrink-0" />
            ) : (
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
            )}
            <div>
              <p className="font-semibold">File uploads are not configured</p>
              <p className="mt-0.5 leading-relaxed">{disabledReason}</p>
            </div>
          </div>
        )}

        {checking && (
          <p className="text-xs text-slate-400 flex items-center gap-2">
            <Loader2 size={13} className="animate-spin" />
            Checking attachment support...
          </p>
        )}

        {errorMessage && !checking && (
          <p className="text-xs text-red-500 flex items-center gap-1.5">
            <AlertCircle size={13} />
            {errorMessage}
          </p>
        )}

        {visibleItems.length > 0 ? (
          <ul className="divide-y divide-slate-100 ">
            {visibleItems.map((attachment) => (
              <li
                key={attachment.id}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <FileText size={16} className="text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  {attachment.download_url ? (
                    <a
                      href={attachment.download_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-slate-800  hover:text-indigo-600 truncate block"
                    >
                      {attachment.file_name}
                    </a>
                  ) : (
                    <span className="text-xs font-semibold text-slate-800  truncate block">
                      {attachment.file_name}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400">
                    {formatSize(attachment.size)} · {attachment.file_type} · {attachment.created_at ? new Date(attachment.created_at).toLocaleDateString() : 'Date unavailable'}
                  </span>
                </div>

                {attachment.download_url && (
                  <a
                    href={attachment.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100  transition-colors"
                    title="Download attachment"
                  >
                    <Download size={14} />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(attachment)}
                  disabled={!enabled}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50  transition-colors"
                  title="Delete attachment"
                >
                  <Trash2 size={14} />
                </button>
                <button type="button" disabled={!enabled} onClick={() => handleRenameAttachment(attachment)} className="text-[10px] text-slate-400 hover:text-indigo-600 disabled:opacity-40" title="Rename file">Rename</button>
                <button type="button" disabled={!enabled} onClick={() => handleMoveAttachment(attachment)} className="text-[10px] text-slate-400 hover:text-indigo-600 disabled:opacity-40" title="Move file">Move</button>
              </li>
            ))}
          </ul>
        ) : (
          !checking && (
            <p className="text-xs text-slate-400">
              {enabled
                ? 'No attachments yet. Notes, tasks, and editing work without files.'
                : 'Notes, tasks, and editing continue to work normally without attachments.'}
            </p>
          )
        )}
      </div>
    </section>
  );
}
