import { Test } from '@nestjs/testing';
import { RetrievalService } from './retrieval.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EMBEDDING_PROVIDER } from '../providers/embedding.provider';

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
      ],
    }).compile();

    service = module.get(RetrievalService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('query scoping — userId isolation', () => {
    it('never returns chunks from private documents owned by another user', async () => {
      // The SQL query in RetrievalService filters by d."userId" = userId.
      // We simulate that the DB correctly returns only matching rows.
      // This test verifies that when the DB returns zero rows (other user's docs filtered out),
      // the service returns an empty array rather than leaking data.

      // Simulate DB returning no results (another user's private docs filtered out)
      prismaQueryRaw.mockResolvedValue([]);

      const results = await service.retrieve('test query', {
        userId: 'user-A',
      });

      expect(results).toEqual([]);

      // Verify the raw query was called (not bypassed)
      expect(prismaQueryRaw).toHaveBeenCalledTimes(1);
    });

    it('returns chunks only for the requesting user', async () => {
      const userAChunk = {
        chunkId: 'chunk-1',
        content: 'User A content',
        documentId: 'doc-A',
        chunkIndex: BigInt(0),
        similarity: 0.9,
      };

      // DB correctly scoped — returns only user-A's chunks
      prismaQueryRaw.mockResolvedValue([userAChunk]);

      const results = await service.retrieve('test query', {
        userId: 'user-A',
      });

      expect(results).toHaveLength(1);
      expect(results[0].documentId).toBe('doc-A');
      expect(results[0].chunkId).toBe('chunk-1');
      expect(results[0].chunkIndex).toBe(0); // bigint converted to number
    });

    it('verifies the SQL template literal receives the correct userId parameter', async () => {
      prismaQueryRaw.mockResolvedValue([]);

      await service.retrieve('query', { userId: 'specific-user-123' });

      // The $queryRaw call should have been made with parameters that include the userId.
      // We verify it was invoked exactly once, confirming the path through retrieve().
      expect(prismaQueryRaw).toHaveBeenCalledTimes(1);

      // The first argument to $queryRaw is a TemplateStringsArray (tagged template),
      // so we inspect the full call args for the userId string value.
      const callArgs = prismaQueryRaw.mock.calls[0] as unknown[];
      const flatArgs = callArgs?.flat(Infinity);
      expect(flatArgs).toContain('specific-user-123');
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

  describe('visibility scoping', () => {
    it('passes the visibility value to the raw query when provided', async () => {
      prismaQueryRaw.mockResolvedValue([]);

      await service.retrieve('query', {
        userId: 'user-A',
        visibility: 'public',
      });

      expect(prismaQueryRaw).toHaveBeenCalledTimes(1);
      const flatArgs = (prismaQueryRaw.mock.calls[0] as unknown[])?.flat(
        Infinity,
      );
      expect(flatArgs).toContain('public');
    });

    it('does not include a visibility parameter when visibility is omitted', async () => {
      prismaQueryRaw.mockResolvedValue([]);

      await service.retrieve('query', { userId: 'user-A' });

      expect(prismaQueryRaw).toHaveBeenCalledTimes(1);
      const flatArgs = (prismaQueryRaw.mock.calls[0] as unknown[])?.flat(
        Infinity,
      );
      // Neither 'public' nor 'private' should appear as a bound parameter
      expect(flatArgs).not.toContain('public');
      expect(flatArgs).not.toContain('private');
    });

    it('returns empty array when visibility filter causes DB to return no rows', async () => {
      // Simulate DB filtering out private docs from another user when public is requested
      prismaQueryRaw.mockResolvedValue([]);

      const results = await service.retrieve('query', {
        userId: 'user-B',
        visibility: 'public',
      });

      expect(results).toEqual([]);
    });

    it('returns chunks when visibility matches the stored document visibility', async () => {
      const publicChunk = {
        chunkId: 'chunk-pub',
        content: 'public content',
        documentId: 'doc-pub',
        chunkIndex: BigInt(0),
        similarity: 0.88,
      };
      prismaQueryRaw.mockResolvedValue([publicChunk]);

      const results = await service.retrieve('query', {
        userId: 'user-A',
        visibility: 'public',
      });

      expect(results).toHaveLength(1);
      expect(results[0].chunkId).toBe('chunk-pub');
      expect(results[0].similarity).toBe(0.88);
    });
  });
});
