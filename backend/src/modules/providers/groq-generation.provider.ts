import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GenerationProvider,
  GenerateOptions,
  GenerateResult,
} from './generation.provider';
import { withRetry } from './retry.util';

const GROQ_DEFAULT_MODEL = 'llama3-8b-8192';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface GroqStreamChunk {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
}

@Injectable()
export class GroqGenerationProvider implements GenerationProvider {
  private readonly logger = new Logger(GroqGenerationProvider.name);
  private readonly apiKey: string;
  readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const key = this.configService.get<string>('GROQ_API_KEY');
    if (!key) {
      throw new Error('GROQ_API_KEY is required for GroqGenerationProvider');
    }
    this.apiKey = key;
    this.model =
      this.configService.get<string>('GROQ_MODEL') ?? GROQ_DEFAULT_MODEL;
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const messages = this.buildMessages(opts);
    const body = JSON.stringify({
      model: this.model,
      messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxOutputTokens ?? 1024,
    });

    const response = await withRetry(
      () =>
        fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body,
        }),
      {},
      (attempt, status) =>
        this.logger.warn(
          `Groq generate ${status ?? 'network error'} on attempt ${attempt + 1}`,
        ),
    );

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `Groq generate API error (${response.status}): ${errorText}`,
      );
      throw new Error(`Groq generation API error: ${response.status}`);
    }

    const data = (await response.json()) as GroqResponse;
    return this.parseResponse(data);
  }

  async *generateStream(opts: GenerateOptions): AsyncIterable<string> {
    const messages = this.buildMessages(opts);
    const body = JSON.stringify({
      model: this.model,
      messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxOutputTokens ?? 1024,
      stream: true,
    });

    const response = await withRetry(
      () =>
        fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body,
        }),
      {},
      (attempt, status) =>
        this.logger.warn(
          `Groq stream ${status ?? 'network error'} on attempt ${attempt + 1}`,
        ),
    );

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `Groq stream API error (${response.status}): ${errorText}`,
      );
      throw new Error(`Groq generation stream API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = (await reader.read()) as {
          done: boolean;
          value: Uint8Array | undefined;
        };
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6).trim();
          if (jsonStr === '[DONE]') return;

          try {
            const chunk = JSON.parse(jsonStr) as GroqStreamChunk;
            const token = chunk.choices?.[0]?.delta?.content;
            if (token) yield token;
          } catch {
            // Skip malformed SSE events
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildMessages(opts: GenerateOptions): GroqMessage[] {
    const messages: GroqMessage[] = [];

    if (opts.systemPrompt) {
      messages.push({ role: 'system', content: opts.systemPrompt });
    }

    for (const msg of opts.messages) {
      messages.push({
        role:
          msg.role === 'assistant'
            ? 'assistant'
            : msg.role === 'system'
              ? 'system'
              : 'user',
        content: msg.content,
      });
    }

    return messages;
  }

  private parseResponse(data: GroqResponse): GenerateResult {
    const content = data.choices?.[0]?.message?.content ?? '';
    const finishReason = data.choices?.[0]?.finish_reason ?? undefined;

    const usage = data.usage
      ? {
          inputTokens: data.usage.prompt_tokens ?? 0,
          outputTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
        }
      : undefined;

    return { content, finishReason, usage };
  }
}
