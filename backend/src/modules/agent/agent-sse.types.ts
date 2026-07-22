import type { ToolProposal } from '../tools/tool-proposal.type';

export type AgentSseEvent =
  | { type: 'token'; data: string }
  | { type: 'citations'; data: unknown[] }
  | { type: 'done'; data: string }
  | { type: 'error'; data: string }
  | { type: 'tool_call'; data: { toolName: string; params: unknown } }
  | {
      type: 'tool_result';
      data: { toolName: string; result?: unknown; error?: string };
    }
  | { type: 'confirmation_required'; data: ToolProposal };
