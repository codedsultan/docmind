import { InjectionToken } from '@nestjs/common';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface GenerateOptions {
  systemPrompt: string;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GenerateResult {
  content: string;
  finishReason?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface GenerationProvider {
  generate(opts: GenerateOptions): Promise<GenerateResult>;
  generateStream(opts: GenerateOptions): AsyncIterable<string>;
  readonly model: string;
}

export const GENERATION_PROVIDER = Symbol(
  'GENERATION_PROVIDER',
) as InjectionToken;
