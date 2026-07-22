'use client';

import { useCallback, useRef, useState } from 'react';
import type { Citation } from '@/types/api';
import { API_BASE_URL } from '@/lib/api';

type StreamEvent =
  | { type: 'citations'; data: Citation[] }
  | { type: 'token'; data: string }
  | { type: 'done'; data: string }
  | { type: 'error'; data: string };

interface ChatStreamState {
  content: string;
  citations: Citation[];
  loading: boolean;
  error: string | null;
}

interface UseChatStreamReturn extends ChatStreamState {
  ask: (query: string, topK?: number) => void;
  abort: () => void;
}

export function useChatStream(): UseChatStreamReturn {
  const [state, setState] = useState<ChatStreamState>({
    content: '',
    citations: [],
    loading: false,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((prev) => ({ ...prev, loading: false }));
  }, []);

  const ask = useCallback((query: string, topK?: number) => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ content: '', citations: [], loading: true, error: null });

    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/v1/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, topK }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Stream error ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const json = line.slice(5).trim();
            if (!json) continue;

            let event: StreamEvent;
            try {
              event = JSON.parse(json) as StreamEvent;
            } catch {
              continue;
            }

            if (event.type === 'citations') {
              setState((prev) => ({ ...prev, citations: event.data as Citation[] }));
            } else if (event.type === 'token') {
              setState((prev) => ({ ...prev, content: prev.content + (event.data as string) }));
            } else if (event.type === 'done') {
              setState((prev) => ({ ...prev, loading: false }));
            } else if (event.type === 'error') {
              setState((prev) => ({
                ...prev,
                error: event.data as string,
                loading: false,
              }));
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Stream failed',
          loading: false,
        }));
      }
    })();
  }, []);

  return { ...state, ask, abort };
}
