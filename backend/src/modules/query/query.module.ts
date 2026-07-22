import { Module } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ProvidersModule } from '../providers/providers.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { QueryController } from './query.controller';
import { QueryStreamController } from './query-stream.controller';

/**
 * Only QueryController and QueryStreamController may call RetrievalService.
 * No other module should issue retrieval SQL directly — all retrieval SQL lives
 * inside RetrievalModule (RetrievalService / retrieval.service.ts).
 */
@Module({
  imports: [ProvidersModule, RetrievalModule],
  controllers: [QueryController, QueryStreamController],
  providers: [AuthGuard],
})
export class QueryModule {}
