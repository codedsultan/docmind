'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Note {
  id: string;
  content: string;
  sourceQueryId?: string;
  createdAt: string;
  updatedAt: string;
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch<Note[]>('/v1/notes');
        setNotes(data);
      } catch {
        setError('Failed to load notes');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/v1/notes/${id}`, { method: 'DELETE' });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      setError('Failed to delete note');
    }
  }

  async function handleSaveEdit(id: string) {
    try {
      const updated = await apiFetch<Note>(`/v1/notes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content: editContent }),
      });
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
      setEditingId(null);
    } catch {
      setError('Failed to update note');
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Notes</h1>
      {error && (
        <p className="mb-4 rounded bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-gray-500">No notes yet. Ask the agent to save a note for you.</p>
      ) : (
        <ul className="space-y-4">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              {editingId === note.id ? (
                <div className="space-y-2">
                  <textarea
                    className="w-full rounded border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={4}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => void handleSaveEdit(note.id)}
                      className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm text-gray-800">{note.content}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {new Date(note.createdAt).toLocaleString()}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingId(note.id); setEditContent(note.content); }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void handleDelete(note.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
