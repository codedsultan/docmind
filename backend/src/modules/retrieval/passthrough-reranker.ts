import { Injectable } from '@nestjs/common';
import type { Reranker } from './reranker.interface';
import type { RetrievedChunk } from './retrieval.service';

@Injectable()
export class PassthroughReranker implements Reranker {
  rerank(
    _query: string,
    candidates: RetrievedChunk[],
  ): Promise<RetrievedChunk[]> {
    return Promise.resolve([...candidates]);
  }
}
