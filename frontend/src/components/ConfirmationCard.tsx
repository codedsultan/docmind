'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { ToolProposal } from '@/hooks/useChatStream';

interface Props {
  proposal: ToolProposal;
  onConfirmed: (result: unknown) => void;
  onCancel: () => void;
}

type State = 'idle' | 'pending' | 'confirmed' | 'error';

export function ConfirmationCard({ proposal, onConfirmed, onCancel }: Props) {
  const [uiState, setUiState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleConfirm() {
    setUiState('pending');
    try {
      const res = await apiFetch<{ result: unknown }>('/v1/agent/confirm', {
        method: 'POST',
        body: JSON.stringify({ confirmationToken: proposal.confirmationToken }),
      });
      setUiState('confirmed');
      onConfirmed(res.result);
    } catch (err) {
      setUiState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Confirmation failed');
    }
  }

  return (
    <div className="my-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="mb-2 text-sm font-semibold text-amber-800">
        Action requires confirmation
      </p>
      <div className="mb-3 rounded border border-amber-100 bg-white p-3">
        <p className="whitespace-pre-wrap font-mono text-xs text-gray-700">
          {proposal.preview}
        </p>
      </div>

      {uiState === 'confirmed' ? (
        <p className="text-sm text-green-700">Confirmed — action sent.</p>
      ) : uiState === 'error' ? (
        <p className="text-sm text-red-600">{errorMsg}</p>
      ) : (
        <div className="flex gap-3">
          <button
            disabled={uiState === 'pending'}
            onClick={() => void handleConfirm()}
            className="rounded bg-amber-600 px-4 py-1.5 text-sm text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {uiState === 'pending' ? 'Sending…' : 'Confirm'}
          </button>
          <button
            disabled={uiState === 'pending'}
            onClick={onCancel}
            className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
