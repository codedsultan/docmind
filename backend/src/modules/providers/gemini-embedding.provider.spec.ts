import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GeminiEmbeddingProvider } from './gemini-embedding.provider';

describe('GeminiEmbeddingProvider', () => {
  let provider: GeminiEmbeddingProvider;
  let fetchSpy: jest.SpyInstance;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'GEMINI_API_KEY') return 'test-api-key';
      return undefined;
    }),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        GeminiEmbeddingProvider,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    provider = module.get(GeminiEmbeddingProvider);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('throws when GEMINI_API_KEY is missing', async () => {
      const noKeyConfig = { get: jest.fn().mockReturnValue(undefined) };
      await expect(
        Test.createTestingModule({
          providers: [
            GeminiEmbeddingProvider,
            { provide: ConfigService, useValue: noKeyConfig },
          ],
        })
          .compile()
          .then((m) => m.get(GeminiEmbeddingProvider)),
      ).rejects.toThrow('GEMINI_API_KEY is required');
    });
  });

  describe('embed', () => {
    it('returns empty embeddings for empty text array', async () => {
      const result = await provider.embed({ texts: [] });
      expect(result.embeddings).toEqual([]);
      expect(result.model).toBe('gemini-embedding-001');
      expect(result.dimensions).toBe(768);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns correct shape for a successful batch embed', async () => {
      const mockEmbedding = Array(768).fill(0.1);
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          embeddings: [
            { embedding: { values: mockEmbedding } },
            { embedding: { values: mockEmbedding } },
          ],
        }),
      });

      const result = await provider.embed({ texts: ['hello', 'world'] });

      expect(result.embeddings).toHaveLength(2);
      expect(result.embeddings[0]).toHaveLength(768);
      expect(result.embeddings[0][0]).toBe(0.1);
      expect(result.model).toBe('gemini-embedding-001');
      expect(result.dimensions).toBe(768);
    });

    it('splits texts into batches of 100', async () => {
      const mockEmbedding = Array(768).fill(0);
      const makeBatchResponse = (count: number) => ({
        ok: true,
        json: async () => ({
          embeddings: Array(count).fill({
            embedding: { values: mockEmbedding },
          }),
        }),
      });

      // 101 texts → 2 batches (100 + 1)
      fetchSpy
        .mockResolvedValueOnce(makeBatchResponse(100))
        .mockResolvedValueOnce(makeBatchResponse(1));

      const texts = Array(101).fill('text');
      const result = await provider.embed({ texts });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.embeddings).toHaveLength(101);
    });

    it('throws an Error when API returns 429', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      await expect(provider.embed({ texts: ['test'] })).rejects.toThrow(
        'Embedding API error: 429',
      );
    });
  });
});
