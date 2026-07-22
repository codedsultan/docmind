import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  GENERATION_PROVIDER,
  GenerationProvider,
  ChatMessage,
} from '../providers/generation.provider';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { isToolProposal } from '../tools/tool-proposal.type';
import type { AgentSseEvent } from './agent-sse.types';

const SYSTEM_PROMPT = `You are DocMind, an AI assistant that can use tools to help users explore their documents.

When you need to use a tool, respond with ONLY a valid JSON object (no markdown, no extra text):
{"tool": "<tool_name>", "params": {<params>}}

When you have enough information to answer, respond with your answer as plain text.

Use tools one at a time. After receiving a tool result, decide whether to use another tool or provide a final answer.`;

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
   * Run the agent loop and emit SSE events via the provided callback.
   *
   * Graph structure (LangGraph-inspired):
   *   modelTurn → [toolDispatch → modelTurn]* → finalAnswer
   *
   * Max-iteration guard prevents infinite loops.
   */
  async run(
    query: string,
    userId: string,
    emit: (event: AgentSseEvent) => void,
    queryId?: string,
  ): Promise<void> {
    const messages: ChatMessage[] = [{ role: 'user', content: query }];
    const toolList = this.toolRegistry
      .listTools()
      .map((t) => `- ${t.name}: ${t.description}`)
      .join('\n');

    const systemPrompt = toolList
      ? `${SYSTEM_PROMPT}\n\nAvailable tools:\n${toolList}`
      : SYSTEM_PROMPT;

    const startMs = Date.now();
    let iterations = 0;

    while (iterations < this.maxIterations) {
      iterations++;

      // ── modelTurn node ──────────────────────────────────────────
      const modelResult = await this.modelTurnNode(systemPrompt, messages);
      const action = this.parseModelOutput(modelResult);

      if (!action.toolCall) {
        // Final answer — stream tokens then done
        for (const token of modelResult.split(' ')) {
          emit({ type: 'token', data: token + ' ' });
        }
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
        return;
      }

      // ── toolDispatch node ───────────────────────────────────────
      const { name, params } = action.toolCall;
      emit({ type: 'tool_call', data: { toolName: name, params } });

      let dispatchResult: unknown;
      try {
        dispatchResult = await this.toolRegistry.dispatch(name, params, {
          userId,
          queryId,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        emit({
          type: 'tool_result',
          data: { toolName: name, error: errorMsg },
        });
        messages.push({ role: 'assistant', content: modelResult });
        messages.push({
          role: 'user',
          content: `Tool "${name}" failed: ${errorMsg}`,
        });
        continue;
      }

      if (isToolProposal(dispatchResult)) {
        emit({ type: 'confirmation_required', data: dispatchResult });
        // Pause the agent — resume happens via POST /agent/confirm
        return;
      }

      emit({
        type: 'tool_result',
        data: { toolName: name, result: dispatchResult },
      });
      messages.push({ role: 'assistant', content: modelResult });
      messages.push({
        role: 'user',
        content: `Tool "${name}" returned: ${JSON.stringify(dispatchResult)}`,
      });
    }

    emit({ type: 'done', data: 'max_iterations_reached' });
  }

  // ── Private node implementations ────────────────────────────────

  private async modelTurnNode(
    systemPrompt: string,
    messages: ChatMessage[],
  ): Promise<string> {
    const result = await this.provider.generate({
      systemPrompt,
      messages,
      temperature: 0.1,
    });
    return result.content;
  }

  private parseModelOutput(content: string): ParsedAction {
    const trimmed = content.trim();
    // Attempt to parse as a tool call JSON
    const jsonMatch = trimmed.match(/^\{[\s\S]*\}$/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(trimmed) as {
          tool?: string;
          params?: unknown;
        };
        if (typeof parsed.tool === 'string') {
          return {
            toolCall: { name: parsed.tool, params: parsed.params ?? {} },
          };
        }
      } catch {
        // Not valid JSON — treat as final answer
      }
    }
    return { toolCall: null };
  }
}
