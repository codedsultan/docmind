'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface Trace {
  id: string;
  query: string;
  provider: string;
  model: string;
  retrievedChunks: unknown[];
  latencyBreakdown: Record<string, number>;
  cacheFlags: { embeddingHit: boolean; answerHit: boolean };
  toolCallAuditIds: string[];
  createdAt: string;
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-right text-xs text-gray-500">{label}</span>
      <div className="flex-1 rounded bg-gray-100" style={{ height: 16 }}>
        <div
          className="h-full rounded bg-blue-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-16 text-xs text-gray-700">{value}ms</span>
    </div>
  );
}

export default function TraceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [trace, setTrace] = useState<Trace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Trace>(`/v1/admin/traces/${id}`)
      .then(setTrace)
      .catch(() => setError('Trace not found'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="p-8 text-gray-500">Loading…</p>;
  if (error || !trace) return <p className="p-8 text-red-600">{error ?? 'Not found'}</p>;

  const latencyEntries = Object.entries(trace.latencyBreakdown);
  const maxLatency = Math.max(...Object.values(trace.latencyBreakdown));

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <div>
        <Link href="/admin/traces" className="mb-2 inline-block text-sm text-blue-600 hover:underline">
          ← All traces
        </Link>
        <h1 className="text-xl font-bold text-gray-900 break-words">{trace.query}</h1>
        <p className="mt-1 text-xs text-gray-500">
          {new Date(trace.createdAt).toLocaleString()} · {trace.model}
        </p>
      </div>

      {/* Latency waterfall */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Latency Waterfall
        </h2>
        <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
          {latencyEntries.map(([key, val]) => (
            <Bar key={key} label={key} value={val} max={maxLatency} />
          ))}
        </div>
      </section>

      {/* Cache flags */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Cache
        </h2>
        <div className="flex gap-4">
          <div className={`rounded px-3 py-2 text-sm ${trace.cacheFlags.embeddingHit ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
            Embedding cache: {trace.cacheFlags.embeddingHit ? 'HIT' : 'MISS'}
          </div>
          <div className={`rounded px-3 py-2 text-sm ${trace.cacheFlags.answerHit ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
            Answer cache: {trace.cacheFlags.answerHit ? 'HIT' : 'MISS'}
          </div>
        </div>
      </section>

      {/* Retrieved chunks */}
      {Array.isArray(trace.retrievedChunks) && trace.retrievedChunks.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Retrieved Chunks ({trace.retrievedChunks.length})
          </h2>
          <div className="space-y-2">
            {(trace.retrievedChunks as Array<Record<string, unknown>>).map((chunk, i) => (
              <div key={i} className="rounded-lg border border-gray-200 bg-white p-3 text-xs">
                <div className="mb-1 flex justify-between text-gray-500">
                  <span>{String(chunk.documentTitle ?? chunk.documentId ?? 'Unknown')}</span>
                  <span>score: {typeof chunk.fusedScore === 'number' ? chunk.fusedScore.toFixed(3) : '–'}</span>
                </div>
                <p className="text-gray-700">{String(chunk.content ?? '').slice(0, 300)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tool call audit IDs */}
      {trace.toolCallAuditIds.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Tool Calls ({trace.toolCallAuditIds.length})
          </h2>
          <ul className="space-y-1 font-mono text-xs text-gray-600">
            {trace.toolCallAuditIds.map((auditId) => (
              <li key={auditId} className="rounded bg-gray-50 px-2 py-1">
                {auditId}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
