'use client';

import { useState } from 'react';
import { useChatStream, type ChatMessage } from '@/hooks/useChatStream';
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
        className="inline-flex h-4 w-4 items-center justify-center rounded bg-blue-100 text-[10px] font-semibold text-blue-700 hover:bg-blue-200 focus:outline-none dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/60"
        aria-label={`Source ${n}: ${citation.documentTitle}`}
      >
        {n}
      </button>
      {open && (
        <span className="absolute bottom-5 left-0 z-10 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <strong className="block mb-1 truncate">{citation.documentTitle}</strong>
          <span className="line-clamp-3">{citation.snippet}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            className="mt-2 text-gray-400 hover:text-gray-600 text-[10px] dark:text-gray-500 dark:hover:text-gray-300"
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

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={
          isUser
            ? 'max-w-[80%] rounded-lg bg-blue-600 px-4 py-2 text-sm text-white'
            : 'max-w-[80%] rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/50'
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            {message.content.length > 0 ? (
              <AnswerWithCitations content={message.content} citations={message.citations} />
            ) : message.streaming ? (
              <span className="inline-block h-4 w-0.5 animate-pulse bg-gray-400 dark:bg-gray-500" />
            ) : null}
            {message.streaming && message.content.length > 0 && (
              <span className="mt-1 inline-block h-4 w-0.5 animate-pulse bg-gray-400 dark:bg-gray-500" />
            )}

            {message.citations.length > 0 && (
              <div className="mt-3">
                <h2 className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                  Sources ({message.citations.length})
                </h2>
                <div className="space-y-2">
                  {message.citations.map((citation) => (
                    <details
                      key={citation.chunkId}
                      className="rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/50">
                        {citation.marker} &middot; {citation.documentTitle}
                      </summary>
                      <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                        {citation.snippet}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [query, setQuery] = useState('');
  const {
    messages,
    loading,
    error,
    pendingConfirmation,
    ask,
    abort,
    clearConfirmation,
    startNewConversation,
  } = useChatStream();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    ask(query.trim());
    setQuery('');
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Chat</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Ask questions about your ingested documents. Follow-up questions keep the conversation&apos;s context.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={startNewConversation}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            New conversation
          </button>
        )}
      </div>

      <div className="space-y-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {messages.length === 0 && !loading && !error && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-700 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
            No messages yet. Ask a question below.
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
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

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What would you like to know?"
          disabled={loading}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400"
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
    </div>
  );
}