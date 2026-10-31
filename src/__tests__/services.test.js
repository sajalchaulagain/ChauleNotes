import { describe, it, expect, beforeEach, beforeAll } from 'vitest';

// Polyfill localStorage in Node test environment
beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    let store = {};
    globalThis.localStorage = {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, val) => {
        store[key] = String(val);
      },
      removeItem: (key) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
  }
});

import {
  getNotes,
  createNote,
  updateNote,
  toggleFavoriteNote,
  deleteNoteToTrash,
  restoreNoteFromTrash,
  permanentDeleteNote,
  getTasks,
  createTask,
  toggleTaskComplete,
  deleteTask,
} from '../services/apiClient';

describe('ChauleNotes Storage & Services Suite', () => {
  const testUserId = 'unit-test-user';

  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('returns an empty note list when no synchronized notes are cached', async () => {
    const { data, error } = await getNotes(testUserId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('creates, updates, and fetches a new note successfully', async () => {
    const newNote = {
      title: 'Unit Test Note',
      owner_id: testUserId,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    };

    const createRes = await createNote(newNote);
    expect(createRes.error).toBeNull();
    expect(createRes.data.title).toBe('Unit Test Note');
    const noteId = createRes.data.id;

    // Update note
    const updateRes = await updateNote(noteId, undefined, 'Updated Test Note', testUserId);
    expect(updateRes.error).toBeNull();
    expect(updateRes.data.title).toBe('Updated Test Note');

    // Toggle favorite
    const favRes = await toggleFavoriteNote(noteId, true, testUserId);
    expect(favRes.error).toBeNull();

    // Move to trash
    const trashRes = await deleteNoteToTrash(noteId, testUserId);
    expect(trashRes.error).toBeNull();

    // Verify it is trashed
    const trashedNotes = await getNotes(testUserId, { is_trashed: true });
    expect(trashedNotes.data.some((n) => n.id === noteId)).toBe(true);

    // Restore note
    await restoreNoteFromTrash(noteId, testUserId);
    const activeNotes = await getNotes(testUserId, { is_trashed: false });
    expect(activeNotes.data.some((n) => n.id === noteId)).toBe(true);

    // Permanent delete
    await permanentDeleteNote(noteId, testUserId);
    const allNotes = await getNotes(testUserId);
    expect(allNotes.data.some((n) => n.id === noteId)).toBe(false);
  });

  it('manages tasks lifecycle: create, toggle, and delete', async () => {
    const taskRes = await createTask('Test Automated Task', 'high');
    expect(taskRes.error).toBeNull();
    expect(taskRes.data.content).toBe('Test Automated Task');
    expect(taskRes.data.is_completed).toBe(false);

    const taskId = taskRes.data.id;

    // Toggle task
    await toggleTaskComplete(taskId, true);
    const allTasks = await getTasks(testUserId);
    const task = allTasks.data.find((t) => t.id === taskId);
    expect(task?.is_completed).toBe(true);

    // Delete task
    await deleteTask(taskId);
    const afterDelete = await getTasks(testUserId);
    expect(afterDelete.data.some((t) => t.id === taskId)).toBe(false);
  });
});
