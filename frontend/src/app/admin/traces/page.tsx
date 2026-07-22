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
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Query Traces</h1>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-gray-500">No traces recorded yet.</p>
      ) : (
        <>
          <p className="mb-4 text-sm text-gray-500">{data.total} traces total</p>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Query</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Latency</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cache</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tools</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((trace) => (
                  <tr key={trace.id} className="hover:bg-gray-50">
                    <td className="max-w-xs px-4 py-3 text-sm">
                      <Link href={`/admin/traces/${trace.id}`} className="text-blue-600 hover:underline">
                        <span className="line-clamp-1">{trace.query}</span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                      {new Date(trace.createdAt).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-700">
                      {totalLatency(trace.latencyBreakdown)}ms
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      <span className={`mr-1 inline-block rounded px-1.5 py-0.5 text-xs ${trace.cacheFlags.embeddingHit ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        embed
                      </span>
                      <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${trace.cacheFlags.answerHit ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        answer
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-700">
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
