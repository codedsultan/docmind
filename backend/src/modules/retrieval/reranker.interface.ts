import { InjectionToken } from '@nestjs/common';
import type { RetrievedChunk } from './retrieval.service';

export interface Reranker {
  rerank(
    query: string,
    candidates: RetrievedChunk[],
  ): Promise<RetrievedChunk[]>;
}

export const RERANKER = Symbol('RERANKER') as InjectionToken;
