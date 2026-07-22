import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QueryController } from './query.controller';
import { RetrievalService } from '../retrieval/retrieval.service';
import { GENERATION_PROVIDER } from '../providers/generation.provider';
import { AuthGuard } from '../../common/guards/auth.guard';

const mockRetrievalService = { retrieve: jest.fn() };
const mockGenerationProvider = { generate: jest.fn() };

// Bypass AuthGuard for unit tests — security is tested via e2e
class NoopAuthGuard {
  canActivate() {
    return true;
  }
}

describe('QueryController', () => {
  let controller: QueryController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [QueryController],
      providers: [
        { provide: RetrievalService, useValue: mockRetrievalService },
        { provide: GENERATION_PROVIDER, useValue: mockGenerationProvider },
        { provide: ConfigService, useValue: { get: jest.fn() } },
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
      const chunks = [
        {
          chunkId: 'c1',
          documentId: 'd1',
          content: 'Context A',
          chunkIndex: 0,
          similarity: 0.9,
        },
      ];
      mockRetrievalService.retrieve.mockResolvedValue(chunks);
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

    it('includes "no context" note in the user message when no chunks are found', async () => {
      mockRetrievalService.retrieve.mockResolvedValue([]);
      mockGenerationProvider.generate.mockResolvedValue({
        content: 'I do not know',
      });

      await controller.query({ query: 'obscure question' });

      const generateCall = (
        mockGenerationProvider.generate.mock.calls[0] as unknown[]
      )?.[0] as { messages: Array<{ content: string }> };
      const userMsg: string = generateCall.messages[0].content;
      expect(userMsg).toContain('No relevant context');
    });

    it('includes retrieved chunk content in the prompt when chunks are found', async () => {
      const chunks = [
        {
          chunkId: 'c1',
          documentId: 'd1',
          content: 'important fact',
          chunkIndex: 0,
          similarity: 0.85,
        },
      ];
      mockRetrievalService.retrieve.mockResolvedValue(chunks);
      mockGenerationProvider.generate.mockResolvedValue({ content: 'answer' });

      await controller.query({ query: 'tell me about important fact' });

      const generateCall = (
        mockGenerationProvider.generate.mock.calls[0] as unknown[]
      )?.[0] as { messages: Array<{ content: string }> };
      const userMsg: string = generateCall.messages[0].content;
      expect(userMsg).toContain('important fact');
      expect(userMsg).toContain('[source:1]');
    });

    it('truncates source content preview to 200 characters', async () => {
      const longContent = 'x'.repeat(500);
      const chunks = [
        {
          chunkId: 'c1',
          documentId: 'd1',
          content: longContent,
          chunkIndex: 0,
          similarity: 0.8,
        },
      ];
      mockRetrievalService.retrieve.mockResolvedValue(chunks);
      mockGenerationProvider.generate.mockResolvedValue({ content: 'ok' });

      const result = await controller.query({ query: 'q' });

      expect(result.sources[0].content.length).toBe(200);
    });
  });
});
