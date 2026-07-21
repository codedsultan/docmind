'use client';

import { useState } from 'react';
import { queryDocuments } from '@/lib/api';
import type { QueryResponse } from '@/types/api';

export default function ChatPage() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await queryDocuments(query);
      setResult(response);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to get answer',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Chat</h1>
      <p className="text-sm text-gray-500">
        Ask questions about your ingested documents.
      </p>

      {/* Query input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What would you like to know?"
          disabled={loading}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Thinking...' : 'Ask'}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Answer */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="prose prose-sm max-w-none whitespace-pre-wrap">
              {result.answer}
            </div>
          </div>

          {/* Sources */}
          {result.sources.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">
                Sources ({result.sources.length})
              </h2>
              <div className="space-y-2">
                {result.sources.map((source, i) => (
                  <details
                    key={source.chunkId}
                    className="rounded-lg border border-gray-200"
                  >
                    <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      Source {i + 1} &middot;{' '}
                      {(source.similarity * 100).toFixed(1)}% match
                    </summary>
                    <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
                      {source.content}
                      {source.content.length >= 200 && (
                        <span className="text-gray-400">...</span>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* No context found */}
          {result.sources.length === 0 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-700">
              No relevant documents found. Upload documents first or try a
              different question.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
