import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { QueryController } from './query.controller';

@Module({
  imports: [ProvidersModule, RetrievalModule],
  controllers: [QueryController],
})
export class QueryModule {}
