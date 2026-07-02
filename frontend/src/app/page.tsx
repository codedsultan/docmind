import { apiFetch } from '@/lib/api';

interface HelloResponse {
  message: string;
  timestamp: string;
}

export default async function HomePage() {
  let data: HelloResponse | null = null;
  let error: string | null = null;

  try {
    data = await apiFetch<HelloResponse>('/hello', {
      // Don't cache — show a fresh timestamp on every request
      cache: 'no-store',
    });
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error';
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">jsstack</h1>

      <div className="rounded-lg border p-6 text-center">
        <p className="text-sm text-gray-500 mb-2">Backend says:</p>

        {data ? (
          <>
            <p className="text-xl font-medium">{data.message}</p>
            <p className="text-xs text-gray-400 mt-2">{data.timestamp}</p>
          </>
        ) : (
          <p className="text-red-500 text-sm">
            Could not reach API — {error}
          </p>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Fetched server-side via{' '}
        <code className="bg-gray-100 px-1 rounded">API_BASE_URL_SERVER</code>
      </p>
    </main>
  );
}
