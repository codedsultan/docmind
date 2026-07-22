import type { DocumentResponse, UploadResult, QueryResponse } from '@/types/api';

function getAuthHeaders(): Record<string, string> {
  const key = process.env.NEXT_PUBLIC_API_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

function getBaseUrl(): string {
  if (typeof window === 'undefined') {
    return (
      process.env.API_BASE_URL_SERVER ??
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:4000/api'
    );
  }
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
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
      ...getAuthHeaders(),
      ...options.headers,
    },
    ...options,
  });

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
  const res = await fetch(url, { method: 'POST', headers: getAuthHeaders(), body: formData });

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
  const res = await fetch(url, { method: 'DELETE', headers: getAuthHeaders() });

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
