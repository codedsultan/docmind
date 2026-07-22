'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Task {
  id: string;
  title: string;
  description?: string;
  dueAt?: string;
  done: boolean;
  createdAt: string;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch<Task[]>('/v1/tasks');
        setTasks(data);
      } catch {
        setError('Failed to load tasks');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const doneCount = tasks.filter((t) => t.done).length;

  async function handleToggleDone(id: string) {
    try {
      const updated = await apiFetch<Task>(`/v1/tasks/${id}/done`, { method: 'PATCH' });
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch {
      setError('Failed to toggle task');
    }
  }

  async function handleSaveEdit(id: string) {
    try {
      const updated = await apiFetch<Task>(`/v1/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: editTitle }),
      });
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
      setEditingId(null);
    } catch {
      setError('Failed to update task');
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/v1/tasks/${id}`, { method: 'DELETE' });
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch {
      setError('Failed to delete task');
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
        {tasks.length > 0 && (
          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">
            {doneCount} of {tasks.length} done
          </span>
        )}
      </div>
      {error && (
        <p className="mb-4 rounded bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="text-gray-500">No tasks yet. Ask the agent to create a task for you.</p>
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li
              key={task.id}
              className={`flex items-start gap-3 rounded-lg border p-4 ${
                task.done ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white shadow-sm'
              }`}
            >
              <input
                type="checkbox"
                checked={task.done}
                onChange={() => void handleToggleDone(task.id)}
                className="mt-1 h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600"
              />
              <div className="flex-1 min-w-0">
                {editingId === task.id ? (
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                    <button
                      onClick={() => void handleSaveEdit(task.id)}
                      className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded border px-2 py-1 text-xs text-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <span className={`text-sm ${task.done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                    {task.title}
                  </span>
                )}
                {task.dueAt && (
                  <p className="mt-1 text-xs text-gray-400">
                    Due: {new Date(task.dueAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              {editingId !== task.id && (
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => { setEditingId(task.id); setEditTitle(task.title); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void handleDelete(task.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
