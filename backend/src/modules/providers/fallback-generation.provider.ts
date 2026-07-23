import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  GenerationProvider,
  GenerateOptions,
  GenerateResult,
} from './generation.provider';

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message;
    const match = msg.match(/error:\s*(\d{3})/i) ?? msg.match(/\b(\d{3})\b/);
    if (match) {
      return RETRYABLE_STATUS.has(Number(match[1]));
    }
    if (msg.toLowerCase().includes('timeout')) return true;
  }
  return false;
}

export class FallbackGenerationProvider implements GenerationProvider {
  private readonly logger = new Logger(FallbackGenerationProvider.name);

  constructor(
    private readonly primary: GenerationProvider,
    private readonly secondary: GenerationProvider,
    private readonly events: EventEmitter2,
  ) {}

  get model(): string {
    return this.primary.model;
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    try {
      return await this.primary.generate(opts);
    } catch (err) {
      if (!isRetryableError(err)) throw err;
      this.emitFallback(err);
      return this.secondary.generate(opts);
    }
  }

  async *generateStream(opts: GenerateOptions): AsyncIterable<string> {
    try {
      yield* this.primary.generateStream(opts);
    } catch (err) {
      if (!isRetryableError(err)) throw err;
      this.emitFallback(err);
      yield* this.secondary.generateStream(opts);
    }
  }

  private emitFallback(err: unknown): void {
    const errMsg = err instanceof Error ? err.message : String(err);
    this.logger.warn(
      `[FallbackGenerationProvider] Primary provider (${this.primary.model}) failed: ${errMsg}. Delegating to secondary (${this.secondary.model}).`,
    );
    this.events.emit('ProviderFallback', {
      primaryModel: this.primary.model,
      secondaryModel: this.secondary.model,
      errorMessage: errMsg,
    });
  }
}
