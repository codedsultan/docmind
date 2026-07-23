import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Annotation, StateGraph, END, START } from '@langchain/langgraph';
import {
  GENERATION_PROVIDER,
  GenerationProvider,
  ChatMessage,
} from '../providers/generation.provider';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { isToolProposal, ToolProposal } from '../tools/tool-proposal.type';
import type { AgentSseEvent } from './agent-sse.types';

const SYSTEM_PROMPT = `You are DocMind, an AI assistant that can use tools to help users explore their documents.

When you need to use a tool, respond with ONLY a valid JSON object (no markdown, no extra text):
{"tool": "<tool_name>", "params": {<param_name>: <param_value>, ...}}

IMPORTANT: Use the exact format above. Do NOT use {"tool_name": {...}} — always use the "tool" key with the tool name as the value.

When you have enough information to answer, respond with your answer as plain text.

Use tools one at a time. After receiving a tool result, decide whether to use another tool or provide a final answer.`;

// ── Agent graph state ─────────────────────────────────────────────
const AgentState = Annotation.Root({
  messages: Annotation<ChatMessage[]>({
    value: (prev: ChatMessage[], update: ChatMessage[]) => [...prev, ...update],
    default: () => [],
  }),
  systemPrompt: Annotation<string>(),
  lastModelOutput: Annotation<string>(),
  pendingToolCall: Annotation<{ name: string; params: unknown } | null>(),
  toolResult: Annotation<{
    toolName: string;
    result?: unknown;
    error?: string;
  } | null>(),
  proposal: Annotation<ToolProposal | null>(),
  iterationCount: Annotation<number>({
    value: (_: number, b: number) => b,
    default: () => 0,
  }),
});

type AgentStateType = typeof AgentState.State;

interface ParsedAction {
  toolCall: { name: string; params: unknown } | null;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly maxIterations: number;

  constructor(
    private readonly toolRegistry: ToolRegistryService,
    @Inject(GENERATION_PROVIDER) private readonly provider: GenerationProvider,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.maxIterations = this.config.get<number>('AGENT_MAX_ITERATIONS') ?? 10;
  }

  /**
   * Run the agent graph and emit SSE events via the provided callback.
   *
   * Graph:  modelTurn → [dispatch → toolDispatch → modelTurn]* → finalAnswer
   *
   * Pause-at-confirmation: the toolDispatch node returns a ToolProposal when
   * the dispatched tool is `external_write`; the stream consumer emits
   * `confirmation_required` and stops. Resume happens via POST /agent/confirm
   * which calls ToolRegistryService.executeConfirmed() independently.
   */
  async run(
    query: string,
    userId: string,
    emit: (event: AgentSseEvent) => void,
    queryId?: string,
  ): Promise<void> {
    const toolList = this.toolRegistry
      .listTools()
      .map((t) => `- ${t.name}: ${t.description}`)
      .join('\n');

    const systemPrompt = toolList
      ? `${SYSTEM_PROMPT}\n\nAvailable tools:\n${toolList}`
      : SYSTEM_PROMPT;

    const maxIter = this.maxIterations;

    // ── Node: modelTurn ─────────────────────────────────────────────
    const modelTurnNode = async (
      state: AgentStateType,
    ): Promise<{
      lastModelOutput: string;
      pendingToolCall: { name: string; params: unknown } | null;
      iterationCount: number;
    }> => {
      const result = await this.provider.generate({
        systemPrompt: state.systemPrompt,
        messages: state.messages,
        temperature: 0.1,
      });
      const action = this.parseModelOutput(result.content);
      return {
        lastModelOutput: result.content,
        pendingToolCall: action.toolCall,
        iterationCount: state.iterationCount + 1,
      };
    };

    // ── Node: toolDispatch ──────────────────────────────────────────
    const toolDispatchNode = async (
      state: AgentStateType,
    ): Promise<Partial<AgentStateType>> => {
      if (!state.pendingToolCall) {
        throw new Error(
          'toolDispatch reached with no pendingToolCall in state',
        );
      }
      const { name, params } = state.pendingToolCall;
      let dispatchResult: unknown;
      let error: string | undefined;

      try {
        dispatchResult = await this.toolRegistry.dispatch(name, params, {
          userId,
          queryId,
        });
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }

      // external_write: return proposal, stop the loop
      if (dispatchResult !== undefined && isToolProposal(dispatchResult)) {
        return {
          proposal: dispatchResult,
          toolResult: null,
          pendingToolCall: null,
        };
      }

      const toolResultMsg: ChatMessage = error
        ? {
            role: 'user',
            content: `Tool "${name}" failed: ${error}`,
          }
        : {
            role: 'user',
            content: `Tool "${name}" returned: ${JSON.stringify(dispatchResult)}`,
          };

      return {
        messages: [
          { role: 'assistant', content: state.lastModelOutput },
          toolResultMsg,
        ],
        toolResult: {
          toolName: name,
          result: error ? undefined : dispatchResult,
          error,
        },
        proposal: null,
        pendingToolCall: null,
      };
    };

    // ── Routing ─────────────────────────────────────────────────────
    const routeAfterModelTurn = (state: AgentStateType): string =>
      state.pendingToolCall ? 'dispatch' : 'finalAnswer';

    const routeAfterToolDispatch = (state: AgentStateType): string => {
      if (state.proposal) return 'proposalPending';
      if (state.iterationCount >= maxIter) return 'maxReached';
      return 'loop';
    };

    // ── Compile graph ───────────────────────────────────────────────
    const graph = new StateGraph(AgentState)
      .addNode('modelTurn', modelTurnNode)
      .addNode('toolDispatch', toolDispatchNode)
      .addConditionalEdges('modelTurn', routeAfterModelTurn, {
        dispatch: 'toolDispatch',
        finalAnswer: END,
      })
      .addConditionalEdges('toolDispatch', routeAfterToolDispatch, {
        loop: 'modelTurn',
        proposalPending: END,
        maxReached: END,
      })
      .addEdge(START, 'modelTurn')
      .compile();

    // ── Stream execution ────────────────────────────────────────────
    const startMs = Date.now();
    let currentIterationCount = 0;
    let lastNode = '';
    let proposalEmitted = false;

    for await (const stepOutput of await graph.stream(
      {
        messages: [{ role: 'user', content: query }],
        systemPrompt,
      },
      { streamMode: 'updates' },
    )) {
      const output = stepOutput as Record<string, Partial<AgentStateType>>;

      if ('modelTurn' in output) {
        lastNode = 'modelTurn';
        const update = output['modelTurn'];
        if (update.iterationCount !== undefined) {
          currentIterationCount = update.iterationCount;
        }
        if (update.pendingToolCall) {
          emit({
            type: 'tool_call',
            data: {
              toolName: update.pendingToolCall.name,
              params: update.pendingToolCall.params,
            },
          });
        } else {
          // Final answer — word-tokenise for SSE token stream
          const answer = update.lastModelOutput ?? '';
          for (const token of answer.split(' ')) {
            emit({ type: 'token', data: token + ' ' });
          }
        }
      } else if ('toolDispatch' in output) {
        lastNode = 'toolDispatch';
        const update = output['toolDispatch'];

        if (update.proposal && isToolProposal(update.proposal)) {
          emit({ type: 'confirmation_required', data: update.proposal });
          proposalEmitted = true;
          break;
        }

        const tr = update.toolResult;
        if (tr?.error) {
          emit({
            type: 'tool_result',
            data: { toolName: tr.toolName, error: tr.error },
          });
        } else {
          emit({
            type: 'tool_result',
            data: {
              toolName: tr?.toolName ?? 'unknown',
              result: tr?.result,
            },
          });
        }
      }
    }

    if (proposalEmitted) {
      this.eventEmitter.emit('TurnCompleted', {
        userId,
        queryId,
        query,
        provider: this.provider.model,
        model: this.provider.model,
        latencyBreakdown: { total: Date.now() - startMs },
        cacheFlags: { embeddingHit: false, answerHit: false },
        toolCallAuditIds: [],
      });
      return;
    }

    if (lastNode === 'toolDispatch' && currentIterationCount >= maxIter) {
      emit({ type: 'done', data: 'max_iterations_reached' });
      return;
    }

    // Final answer path
    emit({ type: 'done', data: '' });

    this.eventEmitter.emit('TurnCompleted', {
      userId,
      queryId,
      query,
      provider: this.provider.model,
      model: this.provider.model,
      latencyBreakdown: { total: Date.now() - startMs },
      cacheFlags: { embeddingHit: false, answerHit: false },
      toolCallAuditIds: [],
    });
  }

  // ── Private helpers ─────────────────────────────────────────────

  private parseModelOutput(content: string): ParsedAction {
    let trimmed = content.trim();

    // Strip markdown code fences (```json ... ``` or ``` ... ```)
    const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
    if (fenceMatch) {
      trimmed = fenceMatch[1].trim();
    }

    const jsonMatch = trimmed.match(/^\{[\s\S]*\}$/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;

        // Primary format: {"tool": "<name>", "params": {...}}
        if (typeof parsed.tool === 'string') {
          return {
            toolCall: {
              name: parsed.tool,
              params: parsed.params ?? {},
            },
          };
        }

        // Fallback: {"<tool_name>": {<params>}} — match if key is a registered tool
        const knownTools = this.toolRegistry.listTools().map((t) => t.name);
        for (const key of Object.keys(parsed)) {
          if (knownTools.includes(key) && typeof parsed[key] === 'object') {
            return {
              toolCall: {
                name: key,
                params: parsed[key] ?? {},
              },
            };
          }
        }
      } catch {
        // Malformed JSON — treat as final answer, never surface raw content
      }
    }
    return { toolCall: null };
  }
}
