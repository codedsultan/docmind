import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GeminiGenerationProvider } from './gemini-generation.provider';

describe('GeminiGenerationProvider', () => {
  let provider: GeminiGenerationProvider;
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
        GeminiGenerationProvider,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    provider = module.get(GeminiGenerationProvider);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  /** Helper: advances fake timers by enough time for withRetry's exponential backoff. */
  async function exhaustTimers(): Promise<void> {
    // withRetry defaults: 3 retries, base delay 1000ms → max backoff ~1+2+4=7s
    for (let i = 0; i < 10; i++) {
      await jest.advanceTimersByTimeAsync(2000);
    }
  }

  describe('generate', () => {
    const defaultOpts = {
      systemPrompt: 'You are helpful.',
      messages: [{ role: 'user' as const, content: 'Hello' }],
    };

    it('returns content string on success', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => ({
          candidates: [
            {
              content: { parts: [{ text: 'Hi there!' }] },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
        }),
      });

      const result = await provider.generate(defaultOpts);

      expect(result.content).toBe('Hi there!');
      expect(result.finishReason).toBe('STOP');
      expect(result.usage).toEqual({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      });
    });

    it('throws when API persistently returns 500 (after retries)', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => 'Internal Server Error',
      });

      const promise = provider.generate(defaultOpts);
      // Create assertion before advancing timers to attach rejection handler early
      const assertion = expect(promise).rejects.toThrow(
        'Generation API error: 500',
      );
      await exhaustTimers();
      await assertion;
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('recovers after a transient 429 then succeeds', async () => {
      fetchSpy
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => 'rate limited',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => ({
            candidates: [
              {
                content: { parts: [{ text: 'recovered' }] },
                finishReason: 'STOP',
              },
            ],
          }),
        });

      const promise = provider.generate(defaultOpts);
      await exhaustTimers();
      const result = await promise;

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.content).toBe('recovered');
    });
  });

  describe('generateStream', () => {
    const defaultOpts = {
      systemPrompt: 'You are helpful.',
      messages: [{ role: 'user' as const, content: 'Tell me a story' }],
    };

    it('yields tokens from mocked SSE response', async () => {
      await exhaustTimers();
      const sseEvents = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Once "}]}}]}',
        'data: {"candidates":[{"content":{"parts":[{"text":"upon "}]}}]}',
        'data: {"candidates":[{"content":{"parts":[{"text":"a time"}]}}]}',
        'data: [DONE]',
      ].join('\n');

      const encoder = new TextEncoder();
      const encoded = encoder.encode(sseEvents);

      let readCount = 0;
      const mockReader = {
        read: jest.fn().mockImplementation(() => {
          if (readCount === 0) {
            readCount++;
            return Promise.resolve({ done: false, value: encoded });
          }
          return Promise.resolve({ done: true, value: undefined });
        }),
        releaseLock: jest.fn(),
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const tokens: string[] = [];
      for await (const token of provider.generateStream(defaultOpts)) {
        tokens.push(token);
      }

      expect(tokens).toEqual(['Once ', 'upon ', 'a time']);
    });

    it('throws when stream API response is not ok', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => 'Unauthorized',
      });

      const gen = provider.generateStream(defaultOpts);
      await expect(gen[Symbol.asyncIterator]().next()).rejects.toThrow(
        'Generation stream API error: 401',
      );
    });
  });
});
