import { InjectionToken } from '@nestjs/common';

export interface EmbedOptions {
  texts: string[];
}

export interface EmbedResult {
  embeddings: number[][];
  model: string;
  dimensions: number;
}

export interface EmbeddingProvider {
  embed(opts: EmbedOptions): Promise<EmbedResult>;
  readonly model: string;
  readonly dimensions: number;
}

export const EMBEDDING_PROVIDER = Symbol(
  'EMBEDDING_PROVIDER',
) as InjectionToken;
