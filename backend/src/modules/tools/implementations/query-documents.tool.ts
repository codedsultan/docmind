import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { RiskTier } from '../../../common/constants';
import { RetrievalService } from '../../retrieval/retrieval.service';
import {
  GENERATION_PROVIDER,
  GenerationProvider,
} from '../../providers/generation.provider';
import { buildAllCitations } from '../../query/citation.util';
import type { Tool, ToolContext } from '../tool.interface';

const schema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(20).optional(),
});

type Params = z.infer<typeof schema>;

@Injectable()
export class QueryDocumentsTool implements Tool<Params> {
  readonly name = 'query_documents';
  readonly description = 'Search documents and return an answer with citations';
  readonly riskTier = RiskTier.read;
  readonly schema = schema;

  constructor(
    private readonly retrievalService: RetrievalService,
    @Inject(GENERATION_PROVIDER) private readonly provider: GenerationProvider,
  ) {}

  async execute(params: Params, ctx: ToolContext): Promise<unknown> {
    const chunks = await this.retrievalService.retrieve(params.query, {
      userId: ctx.userId,
      topK: params.topK ?? 5,
    });

    if (chunks.length === 0) {
      return { answer: 'No relevant documents found.', citations: [] };
    }

    const context = chunks
      .map((c, i) => `[${i + 1}] (${c.documentTitle}) ${c.content}`)
      .join('\n\n');

    const result = await this.provider.generate({
      systemPrompt:
        'Answer the user question based on the provided document context. Cite sources with [N] markers.',
      messages: [
        {
          role: 'user',
          content: `Context:\n${context}\n\nQuestion: ${params.query}`,
        },
      ],
    });

    const citations = buildAllCitations(chunks, 200);

    return { answer: result.content, citations };
  }
}
