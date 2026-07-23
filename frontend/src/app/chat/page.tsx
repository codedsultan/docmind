'use client';

import { useState } from 'react';
import { useChatStream } from '@/hooks/useChatStream';
import { ConfirmationCard } from '@/components/ConfirmationCard';
import type { Citation } from '@/types/api';

function CitationBadge({ citation }: { citation: Citation }) {
  const [open, setOpen] = useState(false);
  const n = citation.marker.replace(/\[|\]/g, '');

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-4 w-4 items-center justify-center rounded bg-blue-100 text-[10px] font-semibold text-blue-700 hover:bg-blue-200 focus:outline-none"
        aria-label={`Source ${n}: ${citation.documentTitle}`}
      >
        {n}
      </button>
      {open && (
        <span className="absolute bottom-5 left-0 z-10 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg text-xs text-gray-700">
          <strong className="block mb-1 truncate">{citation.documentTitle}</strong>
          <span className="line-clamp-3">{citation.snippet}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            className="mt-2 text-gray-400 hover:text-gray-600 text-[10px]"
          >
            close
          </button>
        </span>
      )}
    </span>
  );
}

function AnswerWithCitations({
  content,
  citations,
}: {
  content: string;
  citations: Citation[];
}) {
  const citationMap = new Map(citations.map((c) => [c.marker, c]));
  const parts = content.split(/(\[\d+\])/g);

  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((part, i) => {
        const citation = citationMap.get(part);
        if (citation) {
          return <CitationBadge key={i} citation={citation} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

export default function ChatPage() {
  const [query, setQuery] = useState('');
  const {
    content,
    citations,
    loading,
    error,
    pendingConfirmation,
    ask,
    abort,
    clearConfirmation,
  } = useChatStream();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    ask(query.trim());
  };

  const hasAnswer = content.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Chat</h1>
      <p className="text-sm text-gray-500">Ask questions about your ingested documents.</p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What would you like to know?"
          disabled={loading}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
        {loading ? (
          <button
            type="button"
            onClick={abort}
            className="rounded-lg bg-red-600 px-6 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!query.trim()}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Ask
          </button>
        )}
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {pendingConfirmation && (
        <ConfirmationCard
          proposal={pendingConfirmation}
          onConfirmed={() => {
            // After confirmation, the tool executes server-side.
            // The SSE stream has ended, so we just clean up.
            clearConfirmation();
          }}
          onCancel={clearConfirmation}
        />
      )}

      {hasAnswer && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <AnswerWithCitations content={content} citations={citations} />
            {loading && (
              <span className="mt-1 inline-block h-4 w-0.5 animate-pulse bg-gray-400" />
            )}
          </div>

          {citations.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">
                Sources ({citations.length})
              </h2>
              <div className="space-y-2">
                {citations.map((citation) => (
                  <details
                    key={citation.chunkId}
                    className="rounded-lg border border-gray-200"
                  >
                    <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      {citation.marker} &middot; {citation.documentTitle}
                    </summary>
                    <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
                      {citation.snippet}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!hasAnswer && !loading && !error && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-700">
          No answer yet. Ask a question above.
        </div>
      )}
    </div>
  );
}
