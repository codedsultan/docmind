import {
  Body,
  Controller,
  Inject,
  Logger,
  Optional,
  Post,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createHash } from 'crypto';
import type Redis from 'ioredis';
import { Observable, Subject } from 'rxjs';
import type { Request } from 'express';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RetrievalService } from '../retrieval/retrieval.service';
import {
  GENERATION_PROVIDER,
  GenerationProvider,
} from '../providers/generation.provider';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { CitationDto, QueryDto, ANSWER_CACHE_TTL } from './query.controller';
import type { Citation } from './query.controller';
import type { RetrievedChunk } from '../retrieval/retrieval.service';

interface SseEvent {
  data: string;
}

interface TypedPayload {
  type: 'citations' | 'token' | 'done' | 'error';
  data: Citation[] | string;
}

@ApiTags('chat')
@UseGuards(AuthGuard)
@Controller('v1/chat')
export class QueryStreamController {
  private readonly logger = new Logger(QueryStreamController.name);

  constructor(
    private readonly retrievalService: RetrievalService,
    @Inject(GENERATION_PROVIDER)
    private readonly generationProvider: GenerationProvider,
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis | null,
  ) {}

  @Post('stream')
  @Sse()
  @ApiOperation({ summary: 'Stream an answer token-by-token over SSE' })
  @ApiBody({ type: QueryDto })
  stream(@Body() dto: QueryDto, @Req() req: Request): Observable<SseEvent> {
    const subject = new Subject<SseEvent>();

    void this.handleStream(dto, req, subject);

    return subject.asObservable();
  }

  // ── Private ────────────────────────────────────────────────────

  private emit(subject: Subject<SseEvent>, payload: TypedPayload): void {
    subject.next({ data: JSON.stringify(payload) });
  }

  private async handleStream(
    dto: QueryDto,
    req: Request,
    subject: Subject<SseEvent>,
  ): Promise<void> {
    let aborted = false;
    req.on('close', () => {
      aborted = true;
    });

    try {
      const topK = dto.topK ?? 5;
      const chunks = await this.retrievalService.retrieve(dto.query, { topK });

      if (aborted) {
        subject.complete();
        return;
      }

      const citations = this.buildCitations(chunks);
      this.emit(subject, { type: 'citations', data: citations });

      // Check answer cache (streaming path caches the full answer string)
      const sortedChunkIds = [...chunks.map((c) => c.chunkId)].sort().join(',');
      const cacheKey = `answer:${createHash('sha256')
        .update(dto.query.trim().toLowerCase() + sortedChunkIds)
        .digest('hex')}`;

      if (this.redis) {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          this.logger.debug('[cache:hit] answer (stream)');
          const parsed = JSON.parse(cached) as { answer: string };
          const answer = parsed.answer ?? cached;
          // Re-emit cached answer token-by-token for consistent UX
          for (const char of answer) {
            if (aborted) {
              subject.complete();
              return;
            }
            this.emit(subject, { type: 'token', data: char });
          }
          this.emit(subject, { type: 'done', data: '' });
          subject.complete();
          return;
        }
        this.logger.debug('[cache:miss] answer (stream)');
      }

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
          ? `Context:\n${context}\n\nQuestion: ${dto.query}`
          : `Question: ${dto.query}\n\nNote: No relevant context was found in the documents.`;

      let fullAnswer = '';

      const stream = this.generationProvider.generateStream({
        systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        temperature: 0.3,
        maxOutputTokens: 1024,
      });

      for await (const token of stream) {
        if (aborted) break;
        fullAnswer += token;
        this.emit(subject, { type: 'token', data: token });
      }

      if (!aborted && this.redis) {
        // Cache the full answer so the non-streaming endpoint also benefits
        await this.redis.setex(
          cacheKey,
          ANSWER_CACHE_TTL,
          JSON.stringify({ answer: fullAnswer }),
        );
      }

      this.emit(subject, { type: 'done', data: '' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Stream error';
      this.logger.error('SSE stream error', err);
      this.emit(subject, { type: 'error', data: message });
    } finally {
      subject.complete();
    }
  }

  /**
   * Builds a simple citation list from retrieved chunks (marker = position in context).
   * Fine-grained [N] parsing happens post-generation in the non-streaming path.
   */
  private buildCitations(chunks: RetrievedChunk[]): CitationDto[] {
    return chunks.map((c, i): Citation => ({
      marker: `[${i + 1}]`,
      chunkId: c.chunkId,
      documentTitle: c.documentTitle,
      snippet: c.content.slice(0, 150),
    }));
  }
}
