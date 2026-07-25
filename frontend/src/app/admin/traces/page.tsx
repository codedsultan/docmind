'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface TraceItem {
  id: string;
  query: string;
  provider: string;
  model: string;
  latencyBreakdown: Record<string, number>;
  cacheFlags: { embeddingHit: boolean; answerHit: boolean };
  toolCallAuditIds: string[];
  createdAt: string;
}

interface TracePage {
  items: TraceItem[];
  total: number;
  page: number;
  limit: number;
}

function totalLatency(breakdown: Record<string, number>): number {
  return Object.values(breakdown).reduce((a, b) => a + b, 0);
}

export default function AdminTracesPage() {
  const [data, setData] = useState<TracePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<TracePage>('/v1/admin/traces')
      .then(setData)
      .catch(() => setError('Failed to load traces'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">Query Traces</h1>
      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading…</p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No traces recorded yet.</p>
      ) : (
        <>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{data.total} traces total</p>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:shadow-none">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Query</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Latency</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Cache</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Tools</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {data.items.map((trace) => (
                  <tr key={trace.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="max-w-xs px-4 py-3 text-sm">
                      <Link href={`/admin/traces/${trace.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                        <span className="line-clamp-1">{trace.query}</span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {new Date(trace.createdAt).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-700 dark:text-gray-300">
                      {totalLatency(trace.latencyBreakdown)}ms
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      <span className={`mr-1 inline-block rounded px-1.5 py-0.5 text-xs ${trace.cacheFlags.embeddingHit ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                        embed
                      </span>
                      <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${trace.cacheFlags.answerHit ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                        answer
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-700 dark:text-gray-300">
                      {trace.toolCallAuditIds.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
