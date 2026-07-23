import {
  Body,
  Controller,
  Inject,
  Logger,
  Optional,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { createHash } from 'crypto';
import type Redis from 'ioredis';
import { AuthGuard } from '../../common/guards/auth.guard';
import {
  RetrievalService,
  RetrievedChunk,
} from '../retrieval/retrieval.service';
import { parseCitations, Citation } from './citation.util';
import {
  GENERATION_PROVIDER,
  GenerationProvider,
} from '../providers/generation.provider';
import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { REDIS_CLIENT } from '../../redis/redis.module';

export const ANSWER_CACHE_TTL = 3600;

export class QueryDto {
  @ApiProperty({
    description: 'The question to ask',
    minLength: 1,
    maxLength: 5000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  query!: string;

  @ApiProperty({
    description: 'Number of source chunks to retrieve',
    minimum: 1,
    maximum: 20,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number;
}

export class CitationDto {
  @ApiProperty() marker!: string;
  @ApiProperty() chunkId!: string;
  @ApiProperty() documentTitle!: string;
  @ApiProperty() snippet!: string;
}

export class QuerySourceDto {
  @ApiProperty() chunkId!: string;
  @ApiProperty() documentId!: string;
  @ApiProperty() content!: string;
  @ApiProperty() similarity!: number;
}

export class QueryResponseDto {
  @ApiProperty() answer!: string;
  @ApiProperty({ type: [QuerySourceDto] }) sources!: QuerySourceDto[];
  @ApiProperty({ type: [CitationDto] }) citations!: CitationDto[];
}

export type { Citation };

@ApiTags('chat')
@UseGuards(AuthGuard)
@Controller('v1/chat')
export class QueryController {
  private readonly logger = new Logger(QueryController.name);

  constructor(
    private readonly retrievalService: RetrievalService,
    @Inject(GENERATION_PROVIDER)
    private readonly generationProvider: GenerationProvider,
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis | null,
  ) {}

  @Post('query')
  @ApiOperation({ summary: 'Ask a question about ingested documents' })
  @ApiBody({ type: QueryDto })
  @ApiResponse({ status: 200, type: QueryResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid query input' })
  async query(@Body() dto: QueryDto): Promise<QueryResponseDto> {
    const topK = dto.topK ?? 5;
    const chunks = await this.retrievalService.retrieve(dto.query, { topK });

    const sortedChunkIds = [...chunks.map((c) => c.chunkId)].sort().join(',');
    const answerCacheKey = `answer:${createHash('sha256')
      .update(dto.query.trim().toLowerCase() + sortedChunkIds)
      .digest('hex')}`;

    // Cache busts naturally: when new chunks are ingested the sorted chunk IDs change
    // → a new cache key is derived, so stale answers are never served.
    if (this.redis) {
      const cached = await this.redis.get(answerCacheKey);
      if (cached) {
        try {
          this.logger.debug('[cache:hit] answer');
          return JSON.parse(cached) as QueryResponseDto;
        } catch {
          this.logger.warn(
            '[cache:corrupt] bad JSON in answer cache — re-generating',
          );
          await this.redis.del(answerCacheKey);
        }
      }
      this.logger.debug('[cache:miss] answer');
    }

    const answer = await this.generateAnswer(dto.query, chunks);
    const citations = parseCitations(answer, chunks);

    const response: QueryResponseDto = {
      answer,
      citations,
      sources: chunks.map((c) => ({
        chunkId: c.chunkId,
        documentId: c.documentId,
        content: c.content.slice(0, 200),
        similarity: c.similarity,
      })),
    };

    if (this.redis) {
      await this.redis.setex(
        answerCacheKey,
        ANSWER_CACHE_TTL,
        JSON.stringify(response),
      );
    }

    return response;
  }

  // ── Helpers ──────────────────────────────────────────────────

  private generateAnswer(
    query: string,
    chunks: RetrievedChunk[],
  ): Promise<string> {
    const systemPrompt =
      'You are a helpful AI assistant that answers questions based on provided context. ' +
      'Answer only from the context provided below. If the context does not contain enough ' +
      'information to answer the question, say you do not know. Do not make up information. ' +
      'Cite sources inline using [N] markers exactly as numbered in the context block.';

    const context = chunks
      .map((c, i) => `[${i + 1}] ${c.content}`)
      .join('\n\n');

    const userMessage =
      chunks.length > 0
        ? `Context:\n${context}\n\nQuestion: ${query}`
        : `Question: ${query}\n\nNote: No relevant context was found in the documents.`;

    return this.generationProvider
      .generate({
        systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        temperature: 0.3,
        maxOutputTokens: 1024,
      })
      .then((r) => r.content);
  }
}
