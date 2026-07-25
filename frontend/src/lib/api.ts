import type { DocumentResponse, UploadResult, QueryResponse } from '@/types/api';

// Client-side token cache — populated from the httpOnly cookie via /api/auth/token
let clientToken: string | null = null;
let initPromise: Promise<string | null> | null = null;

/** Fetch the auth token from the httpOnly cookie for client-side use. */
export async function initClientToken(): Promise<string | null> {
  if (clientToken) return clientToken;
  if (!initPromise) {
    initPromise = fetch('/api/auth/token')
      .then(async (res) => {
        if (res.ok) {
          const data = (await res.json()) as { token: string | null };
          clientToken = data.token;
          return clientToken;
        }
        return null;
      })
      .catch(() => null);
  }
  return initPromise;
}

// Eagerly start token init at module load time (browser only).
// The module loads before React starts rendering, so by the time
// useQuery fires listDocuments() during render, initPromise is
// already set and getAuthToken() will await it.
if (typeof window !== 'undefined' && !initPromise && !clientToken) {
  initPromise = fetch('/api/auth/token')
    .then(async (res) => {
      if (res.ok) {
        const data = (await res.json()) as { token: string | null };
        clientToken = data.token;
        return clientToken;
      }
      return null;
    })
    .catch(() => null);
}

/** Clear the client-side token cache (e.g. after logout). */
export function clearClientToken(): void {
  clientToken = null;
  initPromise = null;
}

async function getAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') {
    try {
      // dynamic require — works in server components / route handlers
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { cookies } = require('next/headers');
      const cookieStore = await cookies();
      return cookieStore.get('auth_token')?.value ?? null;
    } catch {
      return null;
    }
  }

  // If init is already in progress (e.g. providers fired first render and
  // kicked off initClientToken via useEffect), await the shared promise so
  // getAuthToken returns the resolved value rather than null.
  if (initPromise) {
    return initPromise;
  }

  return clientToken;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

function getBaseUrl(): string {
  if (typeof window === 'undefined') {
    return (
      process.env.API_BASE_URL_SERVER ??
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:4500/api'
    );
  }
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4500/api';
}

export const API_BASE_URL = getBaseUrl();
export { getAuthHeaders };

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(await getAuthHeaders()),
      ...options.headers,
    },
    ...options,
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      // Clear the server-side cookie before redirecting to break the loop
      await fetch('/api/auth/logout');
      window.location.href = '/auth/login';
    }
    throw new Error('Unauthorized — redirecting to login');
  }

  if (!res.ok) {
    throw new Error(`API error ${res.status} — ${url}`);
  }

  return res.json() as Promise<T>;
}

// ── Document endpoints ───────────────────────────────────────────

export async function uploadDocument(
  file: File,
  title?: string,
  visibility?: 'private' | 'public',
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (title) formData.append('title', title);
  if (visibility) formData.append('visibility', visibility);

  const url = `${API_BASE_URL}/v1/documents/upload`;
  const res = await fetch(url, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Upload error ${res.status} — ${url}`);
  }

  return res.json() as Promise<UploadResult>;
}

export async function listDocuments(): Promise<DocumentResponse[]> {
  return apiFetch<DocumentResponse[]>('/v1/documents');
}

export async function getDocument(id: string): Promise<DocumentResponse> {
  return apiFetch<DocumentResponse>(`/v1/documents/${id}`);
}

export async function deleteDocument(id: string): Promise<void> {
  const url = `${API_BASE_URL}/v1/documents/${id}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Delete error ${res.status} — ${url}`);
  }
}

// ── Chat endpoints ──────────────────────────────────────────────

export async function queryDocuments(
  query: string,
  topK?: number,
): Promise<QueryResponse> {
  return apiFetch<QueryResponse>('/v1/chat/query', {
    method: 'POST',
    body: JSON.stringify({ query, topK }),
  });
}