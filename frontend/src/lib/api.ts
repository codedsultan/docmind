/**
 * Resolves the correct API base URL depending on where the code runs.
 *
 * - Server Components / Route Handlers: use API_BASE_URL_SERVER
 *   This points directly at the api container over the internal Docker
 *   network in production, bypassing Caddy entirely.
 *
 * - Client Components ('use client'): use NEXT_PUBLIC_API_URL
 *   This is baked into the JS bundle at build time and must be a URL
 *   the browser can reach — the public domain in prod, localhost in dev.
 */
function getBaseUrl(): string {
  if (typeof window === 'undefined') {
    // Server-side: prefer internal container URL, fall back to public URL
    return (
      process.env.API_BASE_URL_SERVER ??
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:4000/api'
    );
  }
  // Client-side: always use the public URL baked in at build time
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
}

export const API_BASE_URL = getBaseUrl();

/**
 * Thin fetch wrapper — sets Content-Type and throws on non-2xx.
 * Extend with auth headers, retry logic, etc. as the app grows.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status} — ${url}`);
  }

  return res.json() as Promise<T>;
}
