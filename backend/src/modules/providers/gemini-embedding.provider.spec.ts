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
    jest.useFakeTimers();

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
    jest.useRealTimers();
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

  /** Helper: advances fake timers by enough time for withRetry's exponential backoff. */
  async function exhaustTimers(): Promise<void> {
    for (let i = 0; i < 10; i++) {
      await jest.advanceTimersByTimeAsync(2000);
    }
  }

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
        json: () => ({
          embeddings: [{ values: mockEmbedding }, { values: mockEmbedding }],
        }),
      });

      const result = await provider.embed({ texts: ['hello', 'world'] });

      expect(result.embeddings).toHaveLength(2);
      expect(result.embeddings[0]).toHaveLength(768);
      expect(result.embeddings[0][0]).toBe(0.1);
      expect(result.model).toBe('gemini-embedding-001');
      expect(result.dimensions).toBe(768);
    });

    it('places outputDimensionality inside each request, not at the top level', async () => {
      const mockEmbedding = Array(768).fill(0);
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => ({ embeddings: [{ values: mockEmbedding }] }),
      });

      await provider.embed({ texts: ['test'] });

      const [, init] = fetchSpy.mock.calls[0] as [unknown, { body: string }];
      const body = JSON.parse(init.body) as {
        requests: { outputDimensionality?: number }[];
        outputDimensionality?: number;
      };
      expect(body.outputDimensionality).toBeUndefined();
      expect(body.requests[0].outputDimensionality).toBe(768);
    });

    it('splits texts into batches of 100', async () => {
      const mockEmbedding = Array(768).fill(0);
      const makeBatchResponse = (count: number) => ({
        ok: true,
        json: () => ({
          embeddings: Array(count).fill({ values: mockEmbedding }),
        }),
      });

      // 101 texts → 2 batches (100 + 1)
      fetchSpy
        .mockResolvedValueOnce(makeBatchResponse(100))
        .mockResolvedValueOnce(makeBatchResponse(1));

      const texts = new Array<string>(101).fill('text');
      const result = await provider.embed({ texts });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.embeddings).toHaveLength(101);
    });

    it('throws an Error when API persistently returns 429 (after retries)', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 429,
        text: () => 'Rate limit exceeded',
      });

      const promise = provider.embed({ texts: ['test'] });
      // Create assertion before advancing timers to attach rejection handler early
      const assertion = expect(promise).rejects.toThrow(
        'Embedding API error: 429',
      );
      await exhaustTimers();
      await assertion;
      // Retried 3 times before giving up
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('recovers after a transient 429 (retry succeeds)', async () => {
      const mockEmbedding = Array(768).fill(0.5);
      fetchSpy
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => 'rate limited',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => ({
            embeddings: [{ values: mockEmbedding }],
          }),
        });

      const promise = provider.embed({ texts: ['text'] });
      await exhaustTimers();
      const result = await promise;

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.embeddings).toHaveLength(1);
      expect(result.embeddings[0]).toHaveLength(768);
    });
  });
});
