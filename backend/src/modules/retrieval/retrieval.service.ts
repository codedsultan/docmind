import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EMBEDDING_PROVIDER,
  EmbeddingProvider,
} from '../providers/embedding.provider';
import { DEV_USER_ID } from '../../common/constants';

export interface RetrievedChunk {
  chunkId: string;
  content: string;
  documentId: string;
  chunkIndex: number;
  similarity: number;
}

export interface RetrievalOptions {
  userId?: string;
  topK?: number;
  similarityThreshold?: number;
  visibility?: 'private' | 'public';
}

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  async retrieve(
    query: string,
    options?: RetrievalOptions,
  ): Promise<RetrievedChunk[]> {
    const userId = options?.userId ?? DEV_USER_ID;
    const topK = options?.topK ?? 5;
    const threshold = options?.similarityThreshold ?? 0.5;

    // Embed the query
    const { embeddings } = await this.embeddingProvider.embed({
      texts: [query],
    });

    if (embeddings.length === 0 || embeddings[0].length === 0) {
      return [];
    }

    const queryEmbedding = embeddings[0];
    const embeddingStr = `[${queryEmbedding.join(',')}]`;
    const visibility = options?.visibility;

    // Vector search via $queryRaw — two branches to avoid dynamic SQL concatenation
    const results = visibility
      ? await this.prisma.$queryRaw<RetrievedChunkRaw[]>`
          SELECT
            c.id AS "chunkId",
            c.content,
            c."documentId",
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
          LIMIT ${topK}
        `
      : await this.prisma.$queryRaw<RetrievedChunkRaw[]>`
          SELECT
            c.id AS "chunkId",
            c.content,
            c."documentId",
            c."chunkIndex",
            1 - (c.embedding <=> ${embeddingStr}::vector) AS similarity
          FROM chunks c
          JOIN documents d ON d.id = c."documentId"
          WHERE d."userId" = ${userId}
            AND d."isActive" = true
            AND d.status = 'ready'
            AND 1 - (c.embedding <=> ${embeddingStr}::vector) >= ${threshold}
          ORDER BY c.embedding <=> ${embeddingStr}::vector
          LIMIT ${topK}
        `;

    return results.map((r) => ({
      chunkId: r.chunkId,
      content: r.content,
      documentId: r.documentId,
      chunkIndex: Number(r.chunkIndex),
      similarity: Number(r.similarity),
    }));
  }

  async retrieveByUserId(
    query: string,
    userId: string,
    options?: Omit<RetrievalOptions, 'userId'>,
  ): Promise<RetrievedChunk[]> {
    return this.retrieve(query, { ...options, userId });
  }
}

interface RetrievedChunkRaw {
  chunkId: string;
  content: string;
  documentId: string;
  chunkIndex: bigint | number;
  similarity: number;
}
