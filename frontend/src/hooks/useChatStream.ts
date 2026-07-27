'use client';

import { useCallback, useRef, useState } from 'react';
import type { Citation } from '@/types/api';
import { API_BASE_URL, getAuthHeaders } from '@/lib/api';

export interface ToolProposal {
  type: 'proposal';
  toolName: string;
  preview: string;
  confirmationToken: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  /** True while this assistant message's tokens are still streaming in. */
  streaming?: boolean;
}

type StreamEvent =
  | { type: 'conversation_started'; data: { conversationId: string } }
  | { type: 'citations'; data: Citation[] }
  | { type: 'token'; data: string }
  | { type: 'done'; data: string }
  | { type: 'error'; data: string }
  | { type: 'tool_call'; data: { toolName: string; params: unknown } }
  | { type: 'tool_result'; data: { toolName: string; result?: unknown; error?: string } }
  | { type: 'confirmation_required'; data: ToolProposal };

interface ChatStreamState {
  conversationId: string | null;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  pendingConfirmation: ToolProposal | null;
}

interface UseChatStreamReturn extends ChatStreamState {
  ask: (query: string) => void;
  abort: () => void;
  clearConfirmation: () => void;
  /** Starts a brand-new conversation on the next ask() instead of continuing the current one. */
  startNewConversation: () => void;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useChatStream(): UseChatStreamReturn {
  const [state, setState] = useState<ChatStreamState>({
    conversationId: null,
    messages: [],
    loading: false,
    error: null,
    pendingConfirmation: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((prev) => ({ ...prev, loading: false }));
  }, []);

  const clearConfirmation = useCallback(() => {
    setState((prev) => ({ ...prev, pendingConfirmation: null }));
  }, []);

  const startNewConversation = useCallback(() => {
    conversationIdRef.current = null;
    setState({
      conversationId: null,
      messages: [],
      loading: false,
      error: null,
      pendingConfirmation: null,
    });
  }, []);

  const ask = useCallback((query: string) => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMessage: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: query,
      citations: [],
    };
    const assistantId = makeId();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      citations: [],
      streaming: true,
    };

    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMessage, assistantMessage],
      loading: true,
      error: null,
      pendingConfirmation: null,
    }));

    const updateAssistant = (patch: Partial<ChatMessage>) => {
      setState((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.id === assistantId ? { ...m, ...patch } : m,
        ),
      }));
    };

    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/v1/agent/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
          body: JSON.stringify({
            query,
            conversationId: conversationIdRef.current ?? undefined,
          }),
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

            if (event.type === 'conversation_started') {
              conversationIdRef.current = event.data.conversationId;
              setState((prev) => ({
                ...prev,
                conversationId: event.data.conversationId,
              }));
            } else if (event.type === 'citations') {
              updateAssistant({ citations: event.data as Citation[] });
            } else if (event.type === 'token') {
              setState((prev) => ({
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + (event.data as string) }
                    : m,
                ),
              }));
            } else if (event.type === 'done') {
              updateAssistant({ streaming: false });
              setState((prev) => ({ ...prev, loading: false }));
            } else if (event.type === 'error') {
              updateAssistant({ streaming: false });
              setState((prev) => ({
                ...prev,
                error: event.data as string,
                loading: false,
              }));
            } else if (event.type === 'confirmation_required') {
              updateAssistant({ streaming: false });
              setState((prev) => ({
                ...prev,
                loading: false,
                pendingConfirmation: event.data as ToolProposal,
              }));
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        updateAssistant({ streaming: false });
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Stream failed',
          loading: false,
        }));
      }
    })();
  }, []);

  return { ...state, ask, abort, clearConfirmation, startNewConversation };
}
