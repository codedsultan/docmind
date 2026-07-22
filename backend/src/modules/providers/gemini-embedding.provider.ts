import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmbeddingProvider,
  EmbedOptions,
  EmbedResult,
} from './embedding.provider';
import { withRetry } from './retry.util';

const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;
const BATCH_SIZE = 100;

interface GeminiEmbedContentResponse {
  values?: number[];
}

@Injectable()
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(GeminiEmbeddingProvider.name);
  private readonly apiKey: string;

  readonly model = GEMINI_EMBEDDING_MODEL;
  readonly dimensions = EMBEDDING_DIMENSIONS;

  constructor(private configService: ConfigService) {
    const key = this.configService.get<string>('GEMINI_API_KEY');
    if (!key) {
      throw new Error('GEMINI_API_KEY is required for GeminiEmbeddingProvider');
    }
    this.apiKey = key;
  }

  async embed(opts: EmbedOptions): Promise<EmbedResult> {
    const { texts } = opts;

    if (texts.length === 0) {
      return { embeddings: [], model: this.model, dimensions: this.dimensions };
    }

    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchResults = await this.embedBatch(batch);
      embeddings.push(...batchResults);
    }

    return { embeddings, model: this.model, dimensions: this.dimensions };
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents`;
    const body = JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${GEMINI_EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIMENSIONS,
      })),
    });

    const response = await withRetry(
      () =>
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body,
        }),
      {},
      (attempt, status) =>
        this.logger.warn(
          `Gemini embed ${status ?? 'network error'} on attempt ${attempt + 1}`,
        ),
    );

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `Gemini embed API error (${response.status}): ${errorText}`,
      );
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      embeddings?: GeminiEmbedContentResponse[];
    };

    if (!data.embeddings) {
      throw new Error('Unexpected Gemini API response: missing embeddings');
    }

    return data.embeddings.map((item) => {
      if (!item.values) {
        throw new Error(
          'Unexpected Gemini API response: missing embedding values',
        );
      }
      return item.values;
    });
  }
}
