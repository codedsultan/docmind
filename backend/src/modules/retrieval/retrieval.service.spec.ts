import { Test } from '@nestjs/testing';
import { RetrievalService } from './retrieval.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EMBEDDING_PROVIDER } from '../providers/embedding.provider';
import { RERANKER } from './reranker.interface';
import { REDIS_CLIENT } from '../../redis/redis.module';

const makeChunkRaw = (overrides: Partial<Record<string, unknown>> = {}) => ({
  chunkId: 'chunk-1',
  content: 'test content',
  documentId: 'doc-1',
  documentTitle: 'Test Doc',
  chunkIndex: BigInt(0),
  similarity: 0.9,
  ...overrides,
});

describe('RetrievalService', () => {
  let service: RetrievalService;
  let prismaQueryRaw: jest.Mock;

  const mockEmbeddingProvider = {
    embed: jest.fn().mockResolvedValue({
      embeddings: [Array(768).fill(0.1)],
      model: 'gemini-embedding-001',
      dimensions: 768,
    }),
  };

  const passthroughReranker = {
    rerank: jest
      .fn()
      .mockImplementation((_q: string, cs: unknown[]) =>
        Promise.resolve([...cs]),
      ),
  };

  // No-op Redis mock — returns null (cache miss) for every get
  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
  };

  beforeEach(async () => {
    prismaQueryRaw = jest.fn();

    const module = await Test.createTestingModule({
      providers: [
        RetrievalService,
        {
          provide: PrismaService,
          useValue: { $queryRaw: prismaQueryRaw },
        },
        {
          provide: EMBEDDING_PROVIDER,
          useValue: mockEmbeddingProvider,
        },
        {
          provide: RERANKER,
          useValue: passthroughReranker,
        },
        {
          provide: REDIS_CLIENT,
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get(RetrievalService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── userId isolation ────────────────────────────────────────────

  describe('query scoping — userId isolation', () => {
    it('returns empty array when DB yields no rows (other user filtered out)', async () => {
      prismaQueryRaw.mockResolvedValue([]);
      const results = await service.retrieve('test query', {
        userId: 'user-A',
      });
      expect(results).toEqual([]);
      expect(prismaQueryRaw).toHaveBeenCalled();
    });

    it('returns chunks belonging to the requesting user', async () => {
      const raw = makeChunkRaw({ chunkId: 'chunk-1', documentId: 'doc-A' });
      prismaQueryRaw
        .mockResolvedValueOnce([raw]) // vector search
        .mockResolvedValueOnce([]); // keyword search

      const results = await service.retrieve('test query', {
        userId: 'user-A',
      });

      expect(results).toHaveLength(1);
      expect(results[0].documentId).toBe('doc-A');
      expect(results[0].chunkId).toBe('chunk-1');
      expect(results[0].chunkIndex).toBe(0);
    });

    it('passes the correct userId to the SQL query', async () => {
      prismaQueryRaw.mockResolvedValue([]);
      await service.retrieve('query', { userId: 'specific-user-123' });
      const allArgs = prismaQueryRaw.mock.calls.flatMap((c) =>
        (c as unknown[]).flat(Infinity),
      );
      expect(allArgs).toContain('specific-user-123');
    });

    it('returns empty array when embedding provider returns no embeddings', async () => {
      mockEmbeddingProvider.embed.mockResolvedValueOnce({
        embeddings: [],
        model: 'gemini-embedding-001',
        dimensions: 768,
      });
      const results = await service.retrieve('test', { userId: 'user-A' });
      expect(results).toEqual([]);
      expect(prismaQueryRaw).not.toHaveBeenCalled();
    });
  });

  // ── visibility scoping ──────────────────────────────────────────

  describe('visibility scoping', () => {
    it('passes the visibility value to SQL when provided', async () => {
      prismaQueryRaw.mockResolvedValue([]);
      await service.retrieve('query', {
        userId: 'user-A',
        visibility: 'public',
      });
      const allArgs = prismaQueryRaw.mock.calls.flatMap((c) =>
        (c as unknown[]).flat(Infinity),
      );
      expect(allArgs).toContain('public');
    });

    it('omits visibility from SQL parameters when not provided', async () => {
      prismaQueryRaw.mockResolvedValue([]);
      await service.retrieve('query', { userId: 'user-A' });
      const allArgs = prismaQueryRaw.mock.calls.flatMap((c) =>
        (c as unknown[]).flat(Infinity),
      );
      expect(allArgs).not.toContain('public');
      expect(allArgs).not.toContain('private');
    });

    it('returns empty array when visibility filter eliminates all rows', async () => {
      prismaQueryRaw.mockResolvedValue([]);
      const results = await service.retrieve('query', {
        userId: 'user-B',
        visibility: 'public',
      });
      expect(results).toEqual([]);
    });

    it('returns chunks when visibility matches stored document visibility', async () => {
      const raw = makeChunkRaw({
        chunkId: 'chunk-pub',
        documentId: 'doc-pub',
        similarity: 0.88,
      });
      prismaQueryRaw.mockResolvedValueOnce([raw]).mockResolvedValueOnce([]);
      const results = await service.retrieve('query', {
        userId: 'user-A',
        visibility: 'public',
      });
      expect(results).toHaveLength(1);
      expect(results[0].chunkId).toBe('chunk-pub');
    });

    // Task 10: private document chunks must never appear when visibility='public'
    it('never returns private document chunks when retrieve() is called with visibility=public', async () => {
      // The DB enforces this via the visibility filter in SQL.
      // Simulate: private doc chunks were filtered server-side → empty result
      prismaQueryRaw.mockResolvedValue([]);

      const results = await service.retrieve('query', {
        userId: 'user-A',
        visibility: 'public',
      });

      expect(results).toEqual([]);

      // Both vector and keyword paths must have been called with visibility='public'
      const allArgs = prismaQueryRaw.mock.calls.flatMap((c) =>
        (c as unknown[]).flat(Infinity),
      );
      expect(allArgs).toContain('public');
      // 'private' must never appear as a bound parameter
      expect(allArgs).not.toContain('private');
    });
  });

  // ── hybrid fusion (Task 8) ──────────────────────────────────────

  describe('hybrid fusion — keyword path surfaces keyword-only chunk', () => {
    it('includes a chunk that keyword search surfaces but vector search ranks low', async () => {
      // vector search returns doc-A (high similarity) — doc-B is below similarity floor and absent
      const vectorResult = makeChunkRaw({
        chunkId: 'chunk-A',
        documentId: 'doc-A',
        documentTitle: 'Doc A',
        similarity: 0.9,
      });

      // keyword search surfaces chunk-B (not in vector results)
      const keywordResult = { chunkId: 'chunk-B', rank: 0.8 };

      // fetchChunksByIds call for keyword-only chunk-B
      const keywordOnlyChunk = makeChunkRaw({
        chunkId: 'chunk-B',
        documentId: 'doc-B',
        documentTitle: 'Doc B',
        similarity: 0,
      });

      prismaQueryRaw
        .mockResolvedValueOnce([vectorResult]) // vector search
        .mockResolvedValueOnce([keywordResult]) // keyword search
        .mockResolvedValueOnce([keywordOnlyChunk]); // fetchChunksByIds for chunk-B

      const results = await service.retrieve('query', {
        userId: 'user-A',
        topK: 5,
      });

      const ids = results.map((r) => r.chunkId);
      // Both chunks should appear: chunk-A from vector path, chunk-B from keyword path
      expect(ids).toContain('chunk-A');
      expect(ids).toContain('chunk-B');

      // Per-path scores are populated
      const a = results.find((r) => r.chunkId === 'chunk-A')!;
      expect(a.vectorScore).toBeCloseTo(0.9);
      expect(a.keywordScore).toBeUndefined();

      const b = results.find((r) => r.chunkId === 'chunk-B')!;
      expect(b.keywordScore).toBeCloseTo(0.8);
      expect(b.vectorScore).toBeUndefined();
    });
  });

  // ── keywordSearch ───────────────────────────────────────────────

  describe('keywordSearch()', () => {
    it('returns chunkId and rank from the DB result', async () => {
      prismaQueryRaw.mockResolvedValue([{ chunkId: 'c1', rank: 0.5 }]);
      const results = await service.keywordSearch('postgres', {
        userId: 'user-A',
        limit: 10,
      });
      expect(results).toEqual([{ chunkId: 'c1', rank: 0.5 }]);
    });

    it('passes visibility to keyword SQL when provided', async () => {
      prismaQueryRaw.mockResolvedValue([]);
      await service.keywordSearch('query', {
        userId: 'user-A',
        visibility: 'public',
        limit: 5,
      });
      const allArgs = prismaQueryRaw.mock.calls.flatMap((c) =>
        (c as unknown[]).flat(Infinity),
      );
      expect(allArgs).toContain('public');
    });
  });

  // ── embedding cache ─────────────────────────────────────────────

  describe('embedding cache (Redis)', () => {
    it('skips embeddingProvider.embed() on a Redis cache hit', async () => {
      const cached = JSON.stringify(Array(768).fill(0.2));
      mockRedis.get.mockResolvedValueOnce(cached);
      prismaQueryRaw.mockResolvedValue([]);

      await service.retrieve('query', { userId: 'user-A' });

      expect(mockEmbeddingProvider.embed).not.toHaveBeenCalled();
    });

    it('calls embeddingProvider.embed() and stores result on cache miss', async () => {
      mockRedis.get.mockResolvedValueOnce(null); // miss
      prismaQueryRaw.mockResolvedValue([]);

      await service.retrieve('query', { userId: 'user-A' });

      expect(mockEmbeddingProvider.embed).toHaveBeenCalledTimes(1);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringMatching(/^embed:/),
        86400,
        expect.any(String),
      );
    });
  });
});
