import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EMBEDDING_PROVIDER,
  EmbeddingProvider,
} from '../providers/embedding.provider';
import { DEV_USER_ID } from '../../common/constants';
import { reciprocalRankFusion } from './rrf';
import { RERANKER, Reranker } from './reranker.interface';
import { REDIS_CLIENT } from '../../redis/redis.module';

export interface RetrievedChunk {
  chunkId: string;
  content: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  /** Backward-compat alias for fusedScore. */
  similarity: number;
  vectorScore?: number;
  keywordScore?: number;
  fusedScore: number;
}

export interface RetrievalOptions {
  userId?: string;
  topK?: number;
  similarityThreshold?: number;
  visibility?: 'private' | 'public';
}

const CANDIDATE_POOL = 40;
const RERANKER_MAX_INPUTS = 20;
const EMBED_CACHE_TTL = 86400;

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);
  private readonly similarityFloor: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
    @Optional()
    @Inject(RERANKER)
    private readonly reranker: Reranker | null,
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis | null,
  ) {
    this.similarityFloor = parseFloat(
      process.env['RETRIEVAL_SIMILARITY_THRESHOLD'] ?? '0.3',
    );
  }

  // ── Public API ─────────────────────────────────────────────────

  async retrieve(
    query: string,
    options?: RetrievalOptions,
  ): Promise<RetrievedChunk[]> {
    const userId = options?.userId ?? DEV_USER_ID;
    const topK = options?.topK ?? 5;
    const visibility = options?.visibility;

    const queryEmbedding = await this.getEmbedding(query);
    if (queryEmbedding.length === 0) return [];

    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // Run vector and keyword searches in parallel — scoping applied in SQL on both paths
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorSearch(
        embeddingStr,
        userId,
        visibility,
        CANDIDATE_POOL,
        this.similarityFloor,
      ),
      this.keywordSearch(query, { userId, visibility, limit: CANDIDATE_POOL }),
    ]);

    // Build score maps (id → score) for RRF
    const vectorScoreMap = new Map(
      vectorResults.map((r) => [r.chunkId, r.similarity]),
    );
    const keywordScoreMap = new Map(
      keywordResults.map((r) => [r.chunkId, r.rank]),
    );

    // Fuse
    const fusedScores = reciprocalRankFusion(vectorScoreMap, keywordScoreMap);

    // Sort and cap to reranker input limit
    const topIds = [...fusedScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, RERANKER_MAX_INPUTS)
      .map(([id]) => id);

    if (topIds.length === 0) return [];

    // For IDs only in keyword path, fetch their full content
    const vectorById = new Map(vectorResults.map((r) => [r.chunkId, r]));
    const missingIds = topIds.filter((id) => !vectorById.has(id));

    if (missingIds.length > 0) {
      const fetched = await this.fetchChunksByIds(
        missingIds,
        userId,
        visibility,
      );
      fetched.forEach((c) =>
        vectorById.set(c.chunkId, { ...c, similarity: 0 }),
      );
    }

    // Assemble candidates with per-path scores
    const candidates: RetrievedChunk[] = topIds
      .map((id): RetrievedChunk | null => {
        const chunk = vectorById.get(id);
        if (!chunk) return null;
        const vectorScore = vectorScoreMap.get(id);
        const keywordScore = keywordScoreMap.get(id);
        const fusedScore = fusedScores.get(id) ?? 0;
        return {
          chunkId: chunk.chunkId,
          content: chunk.content,
          documentId: chunk.documentId,
          documentTitle: chunk.documentTitle,
          chunkIndex: chunk.chunkIndex,
          vectorScore,
          keywordScore,
          fusedScore,
          similarity: fusedScore,
        };
      })
      .filter((c): c is RetrievedChunk => c !== null);

    // Reranker (PassthroughReranker by default; swappable for LLM reranker later)
    const reranked = this.reranker
      ? await this.reranker.rerank(query, candidates)
      : candidates;

    return reranked.slice(0, topK);
  }

  /**
   * Keyword-only search using full-text search (tsquery).
   * Scoping filters (userId, visibility, isActive, status) applied in SQL.
   */
  async keywordSearch(
    query: string,
    opts: { userId: string; visibility?: string; limit: number },
  ): Promise<{ chunkId: string; rank: number }[]> {
    const { userId, visibility, limit } = opts;

    const raw = visibility
      ? await this.prisma.$queryRaw<KeywordRaw[]>`
          SELECT
            c.id AS "chunkId",
            ts_rank(c.content_tsv, websearch_to_tsquery('english', ${query})) AS rank
          FROM chunks c
          JOIN documents d ON d.id = c."documentId"
          WHERE d."userId" = ${userId}
            AND d."isActive" = true
            AND d.status = 'ready'
            AND d.visibility = ${visibility}::"DocumentVisibility"
            AND c.content_tsv @@ websearch_to_tsquery('english', ${query})
          ORDER BY rank DESC
          LIMIT ${limit}
        `
      : await this.prisma.$queryRaw<KeywordRaw[]>`
          SELECT
            c.id AS "chunkId",
            ts_rank(c.content_tsv, websearch_to_tsquery('english', ${query})) AS rank
          FROM chunks c
          JOIN documents d ON d.id = c."documentId"
          WHERE d."userId" = ${userId}
            AND d."isActive" = true
            AND d.status = 'ready'
            AND c.content_tsv @@ websearch_to_tsquery('english', ${query})
          ORDER BY rank DESC
          LIMIT ${limit}
        `;

    return raw.map((r) => ({ chunkId: r.chunkId, rank: Number(r.rank) }));
  }

  async retrieveByUserId(
    query: string,
    userId: string,
    options?: Omit<RetrievalOptions, 'userId'>,
  ): Promise<RetrievedChunk[]> {
    return this.retrieve(query, { ...options, userId });
  }

  // ── Private helpers ────────────────────────────────────────────

  private async getEmbedding(query: string): Promise<number[]> {
    const normalised = query.trim().toLowerCase();
    const cacheKey = `embed:${createHash('sha256').update(normalised).digest('hex')}`;

    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.debug('[cache:hit] embedding');
        return JSON.parse(cached) as number[];
      }
      this.logger.debug('[cache:miss] embedding');
    }

    const { embeddings } = await this.embeddingProvider.embed({
      texts: [query],
    });
    if (embeddings.length === 0 || embeddings[0].length === 0) return [];

    const embedding = embeddings[0];
    if (this.redis) {
      await this.redis.setex(
        cacheKey,
        EMBED_CACHE_TTL,
        JSON.stringify(embedding),
      );
    }
    return embedding;
  }

  private async vectorSearch(
    embeddingStr: string,
    userId: string,
    visibility: string | undefined,
    limit: number,
    threshold: number,
  ): Promise<VectorRaw[]> {
    const raw = visibility
      ? await this.prisma.$queryRaw<VectorRaw[]>`
          SELECT
            c.id AS "chunkId",
            c.content,
            c."documentId",
            d.title AS "documentTitle",
            c."chunkIndex",
            1 - (c.embedding <=> ${embeddingStr}::vector) AS similarity
          FROM chunks c
          JOIN documents d ON d.id = c."documentId"
          WHERE d."userId" = ${userId}
            AND d."isActive" = true
            AND d.status = 'ready'
            AND d.visibility = ${visibility}::"DocumentVisibility"
            AND 1 - (c.embedding <=> ${embeddingStr}::vector) >= ${threshold}
          ORDER BY c.embedding <=> ${embeddingStr}::vector
          LIMIT ${limit}
        `
      : await this.prisma.$queryRaw<VectorRaw[]>`
          SELECT
            c.id AS "chunkId",
            c.content,
            c."documentId",
            d.title AS "documentTitle",
            c."chunkIndex",
            1 - (c.embedding <=> ${embeddingStr}::vector) AS similarity
          FROM chunks c
          JOIN documents d ON d.id = c."documentId"
          WHERE d."userId" = ${userId}
            AND d."isActive" = true
            AND d.status = 'ready'
            AND 1 - (c.embedding <=> ${embeddingStr}::vector) >= ${threshold}
          ORDER BY c.embedding <=> ${embeddingStr}::vector
          LIMIT ${limit}
        `;

    return raw.map((r) => ({
      chunkId: r.chunkId,
      content: r.content,
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      chunkIndex: Number(r.chunkIndex),
      similarity: Number(r.similarity),
    }));
  }

  private async fetchChunksByIds(
    ids: string[],
    userId: string,
    visibility: string | undefined,
  ): Promise<VectorRaw[]> {
    if (ids.length === 0) return [];

    const raw = visibility
      ? await this.prisma.$queryRaw<VectorRaw[]>`
          SELECT
            c.id AS "chunkId",
            c.content,
            c."documentId",
            d.title AS "documentTitle",
            c."chunkIndex",
            0 AS similarity
          FROM chunks c
          JOIN documents d ON d.id = c."documentId"
          WHERE c.id = ANY(${ids}::text[])
            AND d."userId" = ${userId}
            AND d."isActive" = true
            AND d.status = 'ready'
            AND d.visibility = ${visibility}::"DocumentVisibility"
        `
      : await this.prisma.$queryRaw<VectorRaw[]>`
          SELECT
            c.id AS "chunkId",
            c.content,
            c."documentId",
            d.title AS "documentTitle",
            c."chunkIndex",
            0 AS similarity
          FROM chunks c
          JOIN documents d ON d.id = c."documentId"
          WHERE c.id = ANY(${ids}::text[])
            AND d."userId" = ${userId}
            AND d."isActive" = true
            AND d.status = 'ready'
        `;

    return raw.map((r) => ({
      chunkId: r.chunkId,
      content: r.content,
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      chunkIndex: Number(r.chunkIndex),
      similarity: Number(r.similarity),
    }));
  }
}

// ── Raw query return types ─────────────────────────────────────

interface VectorRaw {
  chunkId: string;
  content: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  similarity: number;
}

interface KeywordRaw {
  chunkId: string;
  rank: number;
}
