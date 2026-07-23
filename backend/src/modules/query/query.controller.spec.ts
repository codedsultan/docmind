import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QueryController } from './query.controller';
import { RetrievalService } from '../retrieval/retrieval.service';
import { GENERATION_PROVIDER } from '../providers/generation.provider';
import { AuthGuard } from '../../common/guards/auth.guard';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { parseCitations } from './citation.util';
import type { RetrievedChunk } from '../retrieval/retrieval.service';

const mockRetrievalService = { retrieve: jest.fn() };
const mockGenerationProvider = { generate: jest.fn() };
const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
};

class NoopAuthGuard {
  canActivate() {
    return true;
  }
}

const makeChunk = (
  overrides: Partial<RetrievedChunk> = {},
): RetrievedChunk => ({
  chunkId: 'c1',
  documentId: 'd1',
  documentTitle: 'My Doc',
  content: 'Context A',
  chunkIndex: 0,
  similarity: 0.9,
  fusedScore: 0.9,
  ...overrides,
});

describe('QueryController', () => {
  let controller: QueryController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [QueryController],
      providers: [
        { provide: RetrievalService, useValue: mockRetrievalService },
        { provide: GENERATION_PROVIDER, useValue: mockGenerationProvider },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    })
      .overrideGuard(AuthGuard)
      .useClass(NoopAuthGuard)
      .compile();

    controller = module.get(QueryController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('query()', () => {
    it('returns answer and sources when chunks are retrieved', async () => {
      mockRetrievalService.retrieve.mockResolvedValue([makeChunk()]);
      mockGenerationProvider.generate.mockResolvedValue({
        content: 'The answer is A',
      });

      const result = await controller.query({ query: 'What is A?', topK: 3 });

      expect(result.answer).toBe('The answer is A');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].chunkId).toBe('c1');
      expect(result.sources[0].content).toBe('Context A');
      expect(result.sources[0].similarity).toBe(0.9);
    });

    it('uses topK default of 5 when not provided', async () => {
      mockRetrievalService.retrieve.mockResolvedValue([]);
      mockGenerationProvider.generate.mockResolvedValue({
        content: 'No context answer',
      });

      await controller.query({ query: 'anything' });

      expect(mockRetrievalService.retrieve).toHaveBeenCalledWith(
        'anything',
        expect.objectContaining({ topK: 5 }),
      );
    });

    it('passes the caller-supplied topK to retrieval', async () => {
      mockRetrievalService.retrieve.mockResolvedValue([]);
      mockGenerationProvider.generate.mockResolvedValue({ content: 'ok' });

      await controller.query({ query: 'test', topK: 10 });

      expect(mockRetrievalService.retrieve).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({ topK: 10 }),
      );
    });

    it('includes "no context" note when no chunks are found', async () => {
      mockRetrievalService.retrieve.mockResolvedValue([]);
      mockGenerationProvider.generate.mockResolvedValue({
        content: 'I do not know',
      });

      await controller.query({ query: 'obscure question' });

      const generateCall = (
        mockGenerationProvider.generate.mock.calls[0] as unknown[]
      )?.[0] as {
        messages: Array<{ content: string }>;
      };
      expect(generateCall.messages[0].content).toContain('No relevant context');
    });

    it('numbers chunks as [1], [2]… in the prompt context block', async () => {
      const chunks = [makeChunk({ content: 'important fact' })];
      mockRetrievalService.retrieve.mockResolvedValue(chunks);
      mockGenerationProvider.generate.mockResolvedValue({ content: 'answer' });

      await controller.query({ query: 'tell me about important fact' });

      const call = (
        mockGenerationProvider.generate.mock.calls[0] as unknown[]
      )?.[0] as {
        messages: Array<{ content: string }>;
      };
      const userMsg = call.messages[0].content;
      expect(userMsg).toContain('important fact');
      expect(userMsg).toContain('[1]');
    });

    it('truncates source content preview to 200 characters', async () => {
      const chunks = [makeChunk({ content: 'x'.repeat(500) })];
      mockRetrievalService.retrieve.mockResolvedValue(chunks);
      mockGenerationProvider.generate.mockResolvedValue({ content: 'ok' });

      const result = await controller.query({ query: 'q' });

      expect(result.sources[0].content.length).toBe(200);
    });

    it('returns a citations array parsed from [N] markers in the answer', async () => {
      const chunks = [
        makeChunk({
          chunkId: 'c1',
          documentTitle: 'Doc One',
          content: 'First source content',
        }),
        makeChunk({
          chunkId: 'c2',
          documentTitle: 'Doc Two',
          content: 'Second source content',
        }),
      ];
      mockRetrievalService.retrieve.mockResolvedValue(chunks);
      mockGenerationProvider.generate.mockResolvedValue({
        content: 'Based on [1] we know X. See also [2].',
      });

      const result = await controller.query({ query: 'q' });

      expect(result.citations).toHaveLength(2);
      expect(result.citations[0]).toMatchObject({
        marker: '[1]',
        chunkId: 'c1',
        documentTitle: 'Doc One',
      });
      expect(result.citations[1]).toMatchObject({
        marker: '[2]',
        chunkId: 'c2',
        documentTitle: 'Doc Two',
      });
    });

    it('returns empty citations when answer has no [N] markers', async () => {
      mockRetrievalService.retrieve.mockResolvedValue([makeChunk()]);
      mockGenerationProvider.generate.mockResolvedValue({
        content: 'Just an answer.',
      });

      const result = await controller.query({ query: 'q' });
      expect(result.citations).toEqual([]);
    });
  });

  describe('parseCitations() utility', () => {
    it('parses distinct [N] markers and maps them to chunks', () => {
      const chunks = [
        makeChunk({
          chunkId: 'ca',
          documentTitle: 'A',
          content: 'alpha content',
        }),
        makeChunk({
          chunkId: 'cb',
          documentTitle: 'B',
          content: 'beta content',
        }),
      ];
      const citations = parseCitations('See [1] and [2] for details.', chunks);
      expect(citations).toHaveLength(2);
      expect(citations[0].marker).toBe('[1]');
      expect(citations[1].marker).toBe('[2]');
    });

    it('deduplicates repeated [N] markers', () => {
      const chunks = [
        makeChunk({ chunkId: 'c1', documentTitle: 'D', content: 'x' }),
      ];
      const citations = parseCitations(
        '[1] says this and [1] confirms it.',
        chunks,
      );
      expect(citations).toHaveLength(1);
    });

    it('ignores out-of-range markers', () => {
      const chunks = [makeChunk()];
      const citations = parseCitations('[5] is out of range', chunks);
      expect(citations).toHaveLength(0);
    });

    it('snippet is capped at 150 chars by default', () => {
      const chunks = [makeChunk({ content: 'z'.repeat(300) })];
      const citations = parseCitations('[1]', chunks);
      expect(citations[0].snippet.length).toBe(150);
    });
  });

  describe('answer cache', () => {
    it('returns cached response without calling the generation provider', async () => {
      const cached: unknown = {
        answer: 'cached answer',
        sources: [],
        citations: [],
      };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(cached));
      mockRetrievalService.retrieve.mockResolvedValue([]);

      const result = await controller.query({ query: 'q' });

      expect(result.answer).toBe('cached answer');
      expect(mockGenerationProvider.generate).not.toHaveBeenCalled();
    });

    it('stores the response in Redis on cache miss', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockRetrievalService.retrieve.mockResolvedValue([]);
      mockGenerationProvider.generate.mockResolvedValue({
        content: 'fresh answer',
      });

      await controller.query({ query: 'q' });

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringMatching(/^answer:/),
        3600,
        expect.any(String),
      );
    });
  });
});
