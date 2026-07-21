'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  uploadDocument,
  listDocuments,
  deleteDocument,
} from '@/lib/api';
import type { DocumentResponse } from '@/types/api';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      setError(null);
      const docs = await listDocuments();
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const file = formData.get('file') as File;
    const title = formData.get('title') as string | null;
    const visibility = formData.get('visibility') as string | null;

    if (!file || file.size === 0) return;

    setUploading(true);
    setUploadMessage(null);

    try {
      const result = await uploadDocument(
        file,
        title || undefined,
        visibility as 'private' | 'public' | undefined,
      );
      setUploadMessage(result.message);
      form.reset();
      await fetchDocuments();
    } catch (err) {
      setUploadMessage(
        `Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-2xl font-bold">Documents</h1>

      {/* Upload form */}
      <form
        onSubmit={handleUpload}
        className="space-y-4 rounded-lg border border-gray-200 p-4"
      >
        <h2 className="text-lg font-semibold">Upload Document</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            File (PDF, Markdown, or Text)
          </label>
          <input
            type="file"
            name="file"
            accept=".pdf,.md,.txt,text/plain,text/markdown,application/pdf"
            required
            className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
          />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">
              Title (optional)
            </label>
            <input
              type="text"
              name="title"
              placeholder="Derived from filename if empty"
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Visibility
            </label>
            <select
              name="visibility"
              defaultValue="private"
              className="mt-1 block rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={uploading}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>

        {uploadMessage && (
          <p className="text-sm text-gray-600">{uploadMessage}</p>
        )}
      </form>

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <p className="text-sm text-gray-500">Loading documents...</p>
      ) : documents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          No documents yet. Upload a PDF, Markdown, or text file to get
          started.
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-900">
                  {doc.title}
                </p>
                <p className="text-xs text-gray-500">
                  {doc.sourceType} &middot;{' '}
                  <span
                    className={
                      doc.status === 'ready'
                        ? 'text-green-600'
                        : doc.status === 'failed'
                          ? 'text-red-600'
                          : 'text-yellow-600'
                    }
                  >
                    {doc.status}
                  </span>
                  &nbsp;&middot; v{doc.version}
                </p>
              </div>
              <button
                onClick={() => handleDelete(doc.id)}
                className="ml-4 shrink-0 rounded px-3 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
