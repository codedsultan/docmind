import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GenerationProvider,
  GenerateOptions,
  GenerateResult,
  ChatMessage,
} from './generation.provider';

const GEMINI_GENERATION_MODEL = 'gemini-2.0-flash';

interface GeminiContent {
  role?: string;
  parts: Array<{ text: string }>;
}

interface GeminiCandidate {
  content?: GeminiContent;
  finishReason?: string;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiGenerateResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
}

@Injectable()
export class GeminiGenerationProvider implements GenerationProvider {
  private readonly logger = new Logger(GeminiGenerationProvider.name);
  private readonly apiKey: string;

  readonly model = GEMINI_GENERATION_MODEL;

  constructor(private configService: ConfigService) {
    const key = this.configService.get<string>('GEMINI_API_KEY');
    if (!key) {
      throw new Error(
        'GEMINI_API_KEY is required for GeminiGenerationProvider',
      );
    }
    this.apiKey = key;
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_GENERATION_MODEL}:generateContent`;

    const contents = this.buildContents(opts.systemPrompt, opts.messages);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: opts.temperature ?? 0.3,
          maxOutputTokens: opts.maxOutputTokens ?? 1024,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `Gemini generate API error (${response.status}): ${errorText}`,
      );
      throw new Error(`Generation API error: ${response.status}`);
    }

    const data = (await response.json()) as GeminiGenerateResponse;
    return this.parseResponse(data);
  }

  async *generateStream(opts: GenerateOptions): AsyncIterable<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_GENERATION_MODEL}:streamGenerateContent?alt=sse`;

    const contents = this.buildContents(opts.systemPrompt, opts.messages);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: opts.temperature ?? 0.3,
          maxOutputTokens: opts.maxOutputTokens ?? 1024,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `Gemini stream API error (${response.status}): ${errorText}`,
      );
      throw new Error(`Generation stream API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
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
            const data = JSON.parse(jsonStr) as GeminiGenerateResponse;
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) yield text;
          } catch {
            // Skip malformed SSE events
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildContents(
    systemPrompt: string,
    messages: ChatMessage[],
  ): GeminiContent[] {
    const contents: GeminiContent[] = [];

    if (systemPrompt) {
      contents.push({
        role: 'user',
        parts: [{ text: systemPrompt }],
      });
      contents.push({
        role: 'model',
        parts: [{ text: 'Understood. I will follow these instructions.' }],
      });
    }

    for (const msg of messages) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }

    return contents;
  }

  private parseResponse(data: GeminiGenerateResponse): GenerateResult {
    const content =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
    const finishReason = data.candidates?.[0]?.finishReason;

    const usage = data.usageMetadata
      ? {
          inputTokens: data.usageMetadata.promptTokenCount ?? 0,
          outputTokens: data.usageMetadata.candidatesTokenCount ?? 0,
          totalTokens: data.usageMetadata.totalTokenCount ?? 0,
        }
      : undefined;

    return { content, finishReason, usage };
  }
}
