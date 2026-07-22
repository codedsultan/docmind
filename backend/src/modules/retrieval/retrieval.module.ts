import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { RetrievalService } from './retrieval.service';
import { PassthroughReranker } from './passthrough-reranker';
import { RERANKER } from './reranker.interface';

/**
 * RetrievalModule owns the hybrid-search pipeline.
 * Retrieval SQL must stay here — no other module may issue vector/keyword SQL directly.
 * PassthroughReranker is the default bound implementation; swap in an LLM reranker by
 * rebinding RERANKER in a feature module without touching RetrievalService.
 */
@Module({
  imports: [ProvidersModule],
  providers: [
    RetrievalService,
    PassthroughReranker,
    { provide: RERANKER, useExisting: PassthroughReranker },
  ],
  exports: [RetrievalService],
})
export class RetrievalModule {}
