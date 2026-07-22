import { Test } from '@nestjs/testing';
import { QueryDocumentsTool } from './query-documents.tool';
import { RetrievalService } from '../../retrieval/retrieval.service';
import { GENERATION_PROVIDER } from '../../providers/generation.provider';
import { RiskTier } from '../../../common/constants';
import type { RetrievedChunk } from '../../retrieval/retrieval.service';

function makeChunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    chunkId: 'chunk-1',
    content: 'Test chunk content for document retrieval evaluation.',
    documentId: 'doc-1',
    documentTitle: 'Test Document',
    chunkIndex: 0,
    similarity: 0.9,
    fusedScore: 0.9,
    ...overrides,
  };
}

async function buildTool(
  chunks: RetrievedChunk[] = [],
  generatedAnswer = 'The answer is [1] based on the document.',
) {
  const retrievalService = {
    retrieve: jest.fn().mockResolvedValue(chunks),
  };
  const generationProvider = {
    model: 'mock',
    generate: jest.fn().mockResolvedValue({ content: generatedAnswer }),
    generateStream: jest.fn(),
  };

  const module = await Test.createTestingModule({
    providers: [
      QueryDocumentsTool,
      { provide: RetrievalService, useValue: retrievalService },
      { provide: GENERATION_PROVIDER, useValue: generationProvider },
    ],
  }).compile();

  return {
    tool: module.get(QueryDocumentsTool),
    retrievalService,
    generationProvider,
  };
}

describe('QueryDocumentsTool', () => {
  it('has riskTier read', async () => {
    const { tool } = await buildTool();
    expect(tool.riskTier).toBe(RiskTier.read);
  });

  it('delegates to RetrievalService with the provided query and default topK', async () => {
    const { tool, retrievalService } = await buildTool([makeChunk()]);
    await tool.execute({ query: 'test query' }, { userId: 'u1' });
    expect(retrievalService.retrieve).toHaveBeenCalledWith('test query', {
      userId: 'u1',
      topK: 5,
    });
  });

  it('passes topK through to RetrievalService when specified', async () => {
    const { tool, retrievalService } = await buildTool([makeChunk()]);
    await tool.execute({ query: 'test', topK: 3 }, { userId: 'u1' });
    expect(retrievalService.retrieve).toHaveBeenCalledWith('test', {
      userId: 'u1',
      topK: 3,
    });
  });

  it('returns "no documents found" when retrieval yields no chunks', async () => {
    const { tool } = await buildTool([]);
    const result = (await tool.execute(
      { query: 'missing' },
      { userId: 'u1' },
    )) as {
      answer: string;
      citations: unknown[];
    };
    expect(result.answer).toMatch(/no relevant documents/i);
    expect(result.citations).toHaveLength(0);
  });

  it('builds citations with [N] markers for each returned chunk', async () => {
    const chunks = [
      makeChunk({ chunkId: 'c1', documentId: 'd1' }),
      makeChunk({ chunkId: 'c2', documentId: 'd2' }),
    ];
    const { tool } = await buildTool(chunks);
    const result = (await tool.execute({ query: 'q' }, { userId: 'u1' })) as {
      citations: Array<{ marker: string; chunkId: string }>;
    };
    expect(result.citations[0].marker).toBe('[1]');
    expect(result.citations[0].chunkId).toBe('c1');
    expect(result.citations[1].marker).toBe('[2]');
    expect(result.citations[1].chunkId).toBe('c2');
  });

  it('includes snippets truncated to 200 characters in citations', async () => {
    const longContent = 'x'.repeat(500);
    const { tool } = await buildTool([makeChunk({ content: longContent })]);
    const result = (await tool.execute({ query: 'q' }, { userId: 'u1' })) as {
      citations: Array<{ snippet: string }>;
    };
    expect(result.citations[0].snippet).toHaveLength(200);
  });

  it('passes context-numbered chunks to the generation provider', async () => {
    const chunks = [makeChunk({ content: 'doc content here' })];
    const { tool, generationProvider } = await buildTool(chunks, 'answer');
    await tool.execute({ query: 'my query' }, { userId: 'u1' });
    const [callArgs] = generationProvider.generate.mock.calls as Array<
      [{ messages: Array<{ content: string }> }]
    >;
    expect(callArgs[0].messages[0].content).toContain('[1]');
    expect(callArgs[0].messages[0].content).toContain('doc content here');
    expect(callArgs[0].messages[0].content).toContain('my query');
  });
});
