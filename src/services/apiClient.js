/**
 * ChauleNotes API client (replaces src/services/supabaseClient.js).
 *
 * BEGINNER NOTE - THE "MIDDLEMAN" PATTERN
 * ---------------------------------------
 * React NEVER talks to Firebase directly. It talks to our Python FastAPI server:
 *
 *     React  --->  Python API (JWT security guard)  --->  Firebase/Firestore
 *
 * Why? A browser is public. If React held the Firebase Admin key, any visitor
 * could read or destroy every note. Python keeps that secret, checks the user's
 * role in the `profiles` collection, and only then touches Firestore.
 *
 * This file stores the JWT in localStorage (replacing the Supabase session) and
 * keeps the same `{ data, error }` return shape the Phase 1-8 UI expects. That is
 * why the pages only needed their imports changed.
 */

import { PYTHON_API_URL } from '../constants/config';
import {
  firebaseAuth,
  firebaseRegister,
  firebaseResetPassword,
  firebaseSignIn,
  firebaseSignOut,
} from './firebaseClient';

// ---------------------------------------------------------------------------
// Session storage (JWT replaces the Supabase session)
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'chaule_access_token';
const USER_KEY = 'chaule_user';

// Per-user cache used for rendering previously synchronized data offline.
const NOTES_PREFIX = 'chaule_notes_';
const TASKS_KEY = 'chaule_tasks';
const PROFILES_KEY = 'chaule_profiles';

const storage = {
  get(key) {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch (error) {
      console.warn('ChauleNotes local storage is unavailable', error);
    }
  },
  remove(key) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

export const getToken = () => storage.get(TOKEN_KEY);

export const getStoredUser = () => {
  const raw = storage.get(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const setSession = (token, user) => {
  if (token) storage.set(TOKEN_KEY, token);
  if (user) storage.set(USER_KEY, JSON.stringify(user));
};

export const getStoredSession = () => {
  const token = getToken();
  const user = getStoredUser();
  return token ? { token, user } : null;
};

export const clearSession = () => {
  storage.remove(TOKEN_KEY);
  storage.remove(USER_KEY);
};

export const hasApiSession = () => Boolean(getToken());

// ---------------------------------------------------------------------------
// Fetch wrapper
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

const toError = (error) =>
  error instanceof Error ? error : new Error(String(error || 'Something went wrong.'));

const request = async (
  path,
  { method = 'GET', body, auth = true, formData = false } = {}
) => {
  // FormData must set its own multipart boundary, so never force JSON headers.
  const headers = formData ? {} : { 'Content-Type': 'application/json' };
  // Firebase refreshes ID tokens for the signed-in account. FastAPI verifies
  // the Firebase signature and expiry before it reads the Firestore profile.
  const token = auth && firebaseAuth.currentUser
    ? await firebaseAuth.currentUser.getIdToken()
    : (auth ? getToken() : null);
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${PYTHON_API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : formData ? body : JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiError(
      `Cannot reach the ChauleNotes API at ${PYTHON_API_URL}. Is the Python server running?`,
      0,
      error
    );
  }

  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = { detail: raw };
  }

  if (!response.ok) {
    let message = payload?.detail || payload?.message || `Request failed (${response.status}).`;
    if (Array.isArray(message)) {
      message = message.map((item) => item?.msg || String(item)).join(', ');
    }
    if (message && typeof message === 'object') {
      message = message.message || message.error || JSON.stringify(message);
    }
    if (response.status >= 500 && !message) {
      message = 'The ChauleNotes server could not complete the request. Check the backend log for details.';
    }
    if (response.status === 401) {
      // Expired/invalid token: clear it so the user is sent back to login.
      clearSession();
    }
    // FastAPI's `detail` is shown by the auth forms, so actionable backend
    // messages (including register-time Firestore failures) reach the user.
    throw new ApiError(String(message), response.status, payload);
  }

  return payload;
};

const listFrom = (payload, key) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  return [];
};

// ---------------------------------------------------------------------------
// User normalisation (keeps `user.user_metadata.username` working in old pages)
// ---------------------------------------------------------------------------
export const normaliseUser = (rawUser) => {
  if (!rawUser) return null;
  const email = rawUser.email || '';
  const role =
    rawUser.role ||
    rawUser.user_metadata?.role ||
    rawUser.app_metadata?.role ||
    'user';
  const username =
    rawUser.username ||
    rawUser.user_metadata?.username ||
    rawUser.display_name ||
    (email ? email.split('@')[0] : 'User');

  return {
    ...rawUser,
    username,
    role,
    user_metadata: { ...(rawUser.user_metadata || {}), username, role },
    app_metadata: { ...(rawUser.app_metadata || {}), role },
  };
};

// ---------------------------------------------------------------------------
// OFFLINE CACHE
// ---------------------------------------------------------------------------
const notesKey = (userId) => `${NOTES_PREFIX}${userId || 'guest'}`;

const getLocalNotes = (userId) => {
  const raw = storage.get(notesKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalNotes = (userId, notes) => {
  storage.set(notesKey(userId), JSON.stringify(notes));
};

const getLocalTasks = () => {
  const raw = storage.get(TASKS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const legacyDemoTaskIds = new Set(['task-1', 'task-2', 'task-3']);
    return Array.isArray(parsed)
      ? parsed.filter((task) => !legacyDemoTaskIds.has(task.id))
      : [];
  } catch {
    return [];
  }
};

const saveLocalTasks = (tasks) => storage.set(TASKS_KEY, JSON.stringify(tasks));

const getLocalProfiles = () => {
  const raw = storage.get(PROFILES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const currentUserId = () => getStoredUser()?.id || 'guest';

const findLocalNote = (noteId, preferredUserId) => {
  const preferred = getLocalNotes(preferredUserId);
  const preferredMatch = preferred.find((note) => note.id === noteId);
  if (preferredMatch) return { note: preferredMatch, userId: preferredUserId || 'guest' };

  // Search user-scoped cached notes for an item opened while offline.
  try {
    if (typeof localStorage !== 'undefined') {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !key.startsWith(NOTES_PREFIX)) continue;
        const userId = key.slice(NOTES_PREFIX.length);
        const notes = getLocalNotes(userId);
        const found = notes.find((note) => note.id === noteId);
        if (found) return { note: found, userId };
      }
    }
  } catch {
    // ignore
  }
  return { note: null, userId: preferredUserId || 'guest' };
};

const mergeNoteIntoCache = (note, fallbackUserId) => {
  if (!note?.id) return;
  const userId = note.owner_id || fallbackUserId || currentUserId();
  const local = getLocalNotes(userId);
  const exists = local.some((item) => item.id === note.id);
  saveLocalNotes(
    userId,
    exists ? local.map((item) => (item.id === note.id ? { ...item, ...note } : item)) : [note, ...local]
  );
};

const removeNoteFromCache = (noteId, fallbackUserId) => {
  const { userId } = findLocalNote(noteId, fallbackUserId);
  const local = getLocalNotes(userId);
  saveLocalNotes(userId, local.filter((note) => note.id !== noteId));
};

const updateLocalNote = (noteId, fields, userId) => {
  const { note, userId: ownerId } = findLocalNote(noteId, userId);
  if (!note) return { data: null, error: new Error('Note not available offline.') };

  const updated = { ...note, ...fields, updated_at: new Date().toISOString() };
  const local = getLocalNotes(ownerId);
  saveLocalNotes(ownerId, local.map((item) => (item.id === noteId ? updated : item)));
  return { data: updated, error: null };
};

// ---------------------------------------------------------------------------
// AUTH SERVICES (Firebase Auth owns passwords and issues ID tokens)
// ---------------------------------------------------------------------------
export const signInWithEmail = async (email, password) => {
  try {
    const result = await firebaseSignIn(email, password);
    const token = await result.user.getIdToken();
    const profile = await request('/auth/me');
    const user = normaliseUser(profile.user);
    setSession(token, user);
    return {
      data: { user, session: { access_token: token }, token },
      error: null,
    };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
};

export const signUpWithEmail = async (email, password, username) => {
  try {
    const result = await firebaseRegister(email, password, username);
    const token = await result.user.getIdToken();
    // The registration endpoint creates the Firestore profile/workspace. The
    // user's role is assigned on the server and can never come from this form.
    await request('/auth/register', { method: 'POST', body: { username } });
    const profile = await request('/auth/me');
    const user = normaliseUser(profile.user);
    setSession(token, user);
    return {
      data: { user, session: { access_token: token }, token },
      error: null,
    };
  } catch (error) {
    // If profile creation failed, leave Firebase signed out so the UI does not
    // enter a half-registered app session. The account can retry registration.
    await firebaseSignOut().catch(() => {});
    return { data: null, error: toError(error) };
  }
};

export const signOut = async () => {
  try {
    await firebaseSignOut();
  } catch (error) {
    console.warn('Firebase sign-out warning:', error.message);
  } finally {
    clearSession();
  }
  return { error: null };
};

export const getAdminMe = async () => {
  try {
    const payload = await request('/admin/me');
    return {
      data: {
        user: normaliseUser(payload.user),
        is_admin: Boolean(payload.is_admin),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
};

export const getCurrentUser = async () => {
  try {
    const payload = await request('/auth/me');
    return { data: normaliseUser(payload.user), error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
};

// ---------------------------------------------------------------------------
// NOTES & PAGES CRUD (Python: GET/POST/PUT/DELETE /notes)
// ---------------------------------------------------------------------------
export const getNotes = async (userId, filters = {}) => {
  if (hasApiSession()) {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.set(key, String(value));
        }
      });
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const payload = await request(`/notes${suffix}`);
      const notes = listFrom(payload, 'notes');
      saveLocalNotes(userId || currentUserId(), notes);
      return { data: notes, error: null };
    } catch (error) {
      console.warn('Python getNotes failed, using offline cache:', error.message);
    }
  }

  let local = getLocalNotes(userId || currentUserId());
  if (filters.is_favorite !== undefined) {
    local = local.filter((note) => Boolean(note.is_favorite) === Boolean(filters.is_favorite));
  }
  if (filters.is_archived !== undefined) {
    local = local.filter((note) => Boolean(note.is_archived) === Boolean(filters.is_archived));
  }
  if (filters.is_trashed !== undefined) {
    local = local.filter((note) => Boolean(note.is_trashed) === Boolean(filters.is_trashed));
  }
  if (filters.parent_id) {
    local = local.filter((note) => note.parent_id === filters.parent_id);
  }
  if (filters.search) {
    const query = String(filters.search).toLowerCase();
    local = local.filter(
      (note) =>
        (note.title || '').toLowerCase().includes(query) ||
        JSON.stringify(note.content || '').toLowerCase().includes(query)
    );
  }
  local.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
  return { data: local, error: null };
};

export const getNoteById = async (noteId, userId) => {
  if (hasApiSession()) {
    try {
      const note = await request(`/notes/${encodeURIComponent(noteId)}`);
      mergeNoteIntoCache(note, userId);
      return { data: note, error: null };
    } catch (error) {
      console.warn('Python getNoteById failed, using offline cache:', error.message);
    }
  }

  const { note } = findLocalNote(noteId, userId || currentUserId());
  return {
    data: note || null,
    error: note ? null : new Error('Note not found'),
  };
};

export const createNote = async (noteData = {}) => {
  const ownerId = noteData.owner_id || currentUserId();
  const payload = {
    title: noteData.title || 'Untitled Page',
    content: noteData.content || { type: 'doc', content: [{ type: 'paragraph' }] },
    parent_id: noteData.parent_id || null,
    workspace_id: noteData.workspace_id || null,
    is_favorite: Boolean(noteData.is_favorite),
    is_archived: Boolean(noteData.is_archived),
    icon: noteData.icon || null,
    cover_image: noteData.cover_image || null,
    tags: noteData.tags || [],
  };

  if (hasApiSession()) {
    try {
      // Python sets owner_id from the JWT, so users cannot create notes for others.
      const created = await request('/notes', { method: 'POST', body: payload });
      mergeNoteIntoCache(created, ownerId);
      return { data: created, error: null };
    } catch (error) {
      console.warn('Python createNote failed, using offline cache:', error.message);
    }
  }

  const now = new Date().toISOString();
  const localNote = {
    id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    ...payload,
    owner_id: ownerId,
    is_trashed: false,
    created_at: now,
    updated_at: now,
  };
  saveLocalNotes(ownerId, [localNote, ...getLocalNotes(ownerId).filter((n) => n.id !== localNote.id)]);
  return { data: localNote, error: null };
};

export const updateNote = async (noteId, content, title = null, userId = null) => {
  const updates = {};
  if (content !== undefined) updates.content = content;
  if (title !== null && title !== undefined) updates.title = title;

  if (Object.keys(updates).length === 0) {
    return { data: null, error: new Error('Nothing to update.') };
  }

  if (hasApiSession()) {
    try {
      const updated = await request(`/notes/${encodeURIComponent(noteId)}`, {
        method: 'PUT',
        body: updates,
      });
      mergeNoteIntoCache(updated, userId);
      return { data: updated, error: null };
    } catch (error) {
      console.warn('Python updateNote failed, using offline cache:', error.message);
    }
  }

  return updateLocalNote(noteId, updates, userId);
};

const updateNoteFields = async (noteId, fields, userId) => {
  if (hasApiSession()) {
    try {
      const updated = await request(`/notes/${encodeURIComponent(noteId)}`, {
        method: 'PUT',
        body: fields,
      });
      mergeNoteIntoCache(updated, userId);
      return { data: updated, error: null };
    } catch (error) {
      console.warn('Python note update failed, using offline cache:', error.message);
    }
  }
  return updateLocalNote(noteId, fields, userId);
};

export const toggleFavoriteNote = (noteId, isFavorite, userId) =>
  updateNoteFields(noteId, { is_favorite: isFavorite }, userId);

export const toggleArchiveNote = (noteId, isArchived, userId) =>
  updateNoteFields(noteId, { is_archived: isArchived }, userId);

export const deleteNoteToTrash = (noteId, userId) =>
  updateNoteFields(noteId, { is_trashed: true }, userId);

export const restoreNoteFromTrash = (noteId, userId) =>
  updateNoteFields(noteId, { is_trashed: false }, userId);

export const permanentDeleteNote = async (noteId, userId) => {
  if (hasApiSession()) {
    try {
      await request(`/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' });
      removeNoteFromCache(noteId, userId);
      return { error: null };
    } catch (error) {
      console.warn('Python permanent delete failed, using offline cache:', error.message);
    }
  }

  removeNoteFromCache(noteId, userId);
  return { error: null };
};

// ---------------------------------------------------------------------------
// TASKS (Python: /tasks CRUD)
// ---------------------------------------------------------------------------
export const getTasks = async (userId) => {
  if (hasApiSession()) {
    try {
      const payload = await request('/tasks');
      const tasks = listFrom(payload, 'tasks');
      saveLocalTasks(tasks);
      return { data: tasks, error: null };
    } catch (error) {
      console.warn('Python getTasks failed, using offline cache:', error.message);
    }
  }

  const tasks = [...getLocalTasks()].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
  return { data: tasks, error: null };
};

export const createTask = async (content, priority = 'medium', dueDate = null) => {
  const payload = {
    content,
    priority,
    due_date: dueDate,
    is_completed: false,
  };

  if (hasApiSession()) {
    try {
      const created = await request('/tasks', { method: 'POST', body: payload });
      saveLocalTasks([created, ...getLocalTasks().filter((task) => task.id !== created.id)]);
      return { data: created, error: null };
    } catch (error) {
      console.warn('Python createTask failed, using offline cache:', error.message);
    }
  }

  const localTask = {
    id: `task-${Date.now()}`,
    ...payload,
    created_at: new Date().toISOString(),
  };
  saveLocalTasks([localTask, ...getLocalTasks().filter((task) => task.id !== localTask.id)]);
  return { data: localTask, error: null };
};

export const toggleTaskComplete = async (taskId, isCompleted) => {
  if (hasApiSession()) {
    try {
      const updated = await request(`/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PUT',
        body: { is_completed: isCompleted },
      });
      saveLocalTasks(
        getLocalTasks().map((task) => (task.id === taskId ? { ...task, ...updated } : task))
      );
      return { data: updated, error: null };
    } catch (error) {
      console.warn('Python toggleTaskComplete failed, using offline cache:', error.message);
    }
  }

  const updatedTasks = getLocalTasks().map((task) =>
    task.id === taskId ? { ...task, is_completed: isCompleted } : task
  );
  saveLocalTasks(updatedTasks);
  return { data: { id: taskId, is_completed: isCompleted }, error: null };
};

export const deleteTask = async (taskId) => {
  if (hasApiSession()) {
    try {
      await request(`/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
      saveLocalTasks(getLocalTasks().filter((task) => task.id !== taskId));
      return { error: null };
    } catch (error) {
      console.warn('Python deleteTask failed, using offline cache:', error.message);
    }
  }

  saveLocalTasks(getLocalTasks().filter((task) => task.id !== taskId));
  return { error: null };
};

// ---------------------------------------------------------------------------
// OPTIONAL ATTACHMENTS (Python: /attachments/* + /notes/{id}/attachments)
// ---------------------------------------------------------------------------
// Storage is optional. These calls are only made when the UI decides the
// feature is enabled; otherwise the attachment panel stays disabled.
export const getAttachmentConfig = async () => {
  try {
    const config = await request('/attachments/config', { auth: false });
    return { data: config, error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
};

export const getAttachments = async (noteId) => {
  if (!hasApiSession()) {
    return { data: [], error: null };
  }
  try {
    const payload = await request(
      `/notes/${encodeURIComponent(noteId)}/attachments`
    );
    return { data: listFrom(payload, 'attachments'), error: null };
  } catch (error) {
    return { data: [], error: toError(error) };
  }
};

export const uploadAttachment = async (noteId, file, folderId = null) => {
  if (!hasApiSession()) {
    return {
      data: null,
      error: new Error('Sign in with a real account to upload attachments.'),
    };
  }

  try {
    const body = new FormData();
    body.append('file', file);
    if (folderId) body.append('folder_id', folderId);
    const created = await request(
      `/notes/${encodeURIComponent(noteId)}/attachments`,
      { method: 'POST', body, formData: true }
    );
    return { data: created, error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
};

export const getAttachmentFolders = async (parentId = null) => {
  try {
    const query = parentId ? `?parent_id=${encodeURIComponent(parentId)}` : '';
    const payload = await request(`/attachments/folders${query}`);
    return { data: listFrom(payload, 'folders'), error: null };
  } catch (error) {
    return { data: [], error: toError(error) };
  }
};

export const getAttachmentFolderTree = async () => {
  try {
    const payload = await request('/attachments/folders/tree');
    return { data: listFrom(payload, 'folders'), error: null };
  } catch (error) {
    return { data: [], error: toError(error) };
  }
};

export const createAttachmentFolder = async (name, parentId = null) => {
  try {
    return { data: await request('/attachments/folders', { method: 'POST', body: { name, parent_id: parentId } }), error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
};

export const updateAttachmentFolder = async (folderId, name) => {
  try {
    return { data: await request(`/attachments/folders/${encodeURIComponent(folderId)}`, { method: 'PUT', body: { name } }), error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
};

export const deleteAttachmentFolder = async (folderId) => {
  try {
    await request(`/attachments/folders/${encodeURIComponent(folderId)}`, { method: 'DELETE' });
    return { error: null };
  } catch (error) {
    return { error: toError(error) };
  }
};

export const moveAttachmentFolder = async (folderId, parentId) => {
  try {
    return { data: await request(`/attachments/folders/${encodeURIComponent(folderId)}/move`, { method: 'PUT', body: { parent_id: parentId } }), error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
};

export const renameAttachment = async (attachmentId, fileName) => {
  try {
    return { data: await request(`/attachments/${encodeURIComponent(attachmentId)}`, { method: 'PUT', body: { file_name: fileName } }), error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
};

export const moveAttachment = async (attachmentId, folderId) => {
  try {
    return { data: await request(`/attachments/${encodeURIComponent(attachmentId)}/move`, { method: 'PATCH', body: { folder_id: folderId } }), error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
};

export const deleteAttachment = async (attachmentId) => {
  if (!hasApiSession()) {
    return {
      data: null,
      error: new Error('Sign in with a real account to manage attachments.'),
    };
  }
  try {
    await request(`/attachments/${encodeURIComponent(attachmentId)}`, {
      method: 'DELETE',
    });
    return { data: { id: attachmentId }, error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
};

// ---------------------------------------------------------------------------
// ADMIN SERVICES (Python: /admin/*)
// ---------------------------------------------------------------------------
export const getAllUsers = async () => {
  if (hasApiSession()) {
    try {
      const payload = await request('/admin/users');
      const users = listFrom(payload, 'users');
      storage.set(PROFILES_KEY, JSON.stringify(users));
      return { data: users, error: null };
    } catch (error) {
      console.warn('Python getAllUsers failed, using offline cache:', error.message);
    }
  }
  return { data: getLocalProfiles(), error: null };
};

export const toggleUserRole = async (userId, newRole) => {
  if (hasApiSession()) {
    try {
      const payload = await request(`/admin/users/${encodeURIComponent(userId)}/role`, {
        method: 'PUT',
        body: { role: newRole },
      });
      return { data: payload.user || null, error: null };
    } catch (error) {
      return { data: null, error: toError(error) };
    }
  }

  const updated = getLocalProfiles().map((profile) =>
    profile.id === userId ? { ...profile, role: newRole } : profile
  );
  storage.set(PROFILES_KEY, JSON.stringify(updated));
  return { data: { id: userId, role: newRole }, error: null };
};

export const getAdminStats = async () => {
  if (hasApiSession()) {
    try {
      const stats = await request('/admin/stats');
      return { data: stats, error: null };
    } catch (error) {
      console.warn('Python getAdminStats failed, using offline cache:', error.message);
    }
  }

  const profiles = getLocalProfiles();
  const tasks = getLocalTasks();
  const notes = collectLocalNotes();
  return {
    data: {
      users: profiles.length,
      admins: profiles.filter((profile) => profile.role === 'admin').length,
      pages: notes.length,
      tasks: tasks.length,
      workspaces: 1,
      attachments: 0,
      admin_logs: 0,
      trashed_pages: notes.filter((note) => note.is_trashed).length,
      collections: ['profiles', 'workspaces', 'pages', 'tasks', 'attachments', 'admin_logs'],
      recent_logs: [],
    },
    error: null,
  };
};

const collectLocalNotes = () => {
  const notes = [];
  try {
    if (typeof localStorage !== 'undefined') {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !key.startsWith(NOTES_PREFIX)) continue;
        const userId = key.slice(NOTES_PREFIX.length);
        getLocalNotes(userId).forEach((note) => notes.push({ ...note, owner_id: note.owner_id || userId }));
      }
    }
  } catch {
    // ignore
  }
  const unique = new Map();
  notes.forEach((note) => unique.set(note.id, note));
  return [...unique.values()];
};

export const getAdminNotes = async (filters = {}) => {
  if (hasApiSession()) {
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.owner_id) params.set('owner_id', filters.owner_id);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const payload = await request(`/admin/notes${suffix}`);
      return { data: listFrom(payload, 'notes'), error: null };
    } catch (error) {
      console.warn('Python getAdminNotes failed, using offline cache:', error.message);
    }
  }

  const profiles = getLocalProfiles();
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const notes = collectLocalNotes().map((note) => {
    const owner = profileMap.get(note.owner_id);
    return {
      ...note,
      owner_name: owner?.username || 'Unknown user',
      owner_email: owner?.email || '',
    };
  });
  notes.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
  return { data: notes, error: null };
};

export const adminUpdateNote = async (noteId, fields) => {
  if (hasApiSession()) {
    try {
      const updated = await request(`/admin/notes/${encodeURIComponent(noteId)}`, {
        method: 'PUT',
        body: fields,
      });
      mergeNoteIntoCache(updated);
      return { data: updated, error: null };
    } catch (error) {
      return { data: null, error: toError(error) };
    }
  }
  return updateLocalNote(noteId, fields);
};

// Default export kept for any component that still does `import api from ...`.
const apiClient = {
  getToken,
  getStoredUser,
  getStoredSession,
  setSession,
  clearSession,
  signInWithEmail,
  signUpWithEmail,
  signOut,
  getAdminMe,
  getCurrentUser,
  getNotes,
  getNoteById,
  createNote,
  updateNote,
  toggleFavoriteNote,
  toggleArchiveNote,
  deleteNoteToTrash,
  restoreNoteFromTrash,
  permanentDeleteNote,
  getTasks,
  createTask,
  toggleTaskComplete,
  deleteTask,
  getAttachmentConfig,
  getAttachments,
  uploadAttachment,
  deleteAttachment,
  getAllUsers,
  toggleUserRole,
  getAdminStats,
  getAdminNotes,
  adminUpdateNote,
};

export default apiClient;
