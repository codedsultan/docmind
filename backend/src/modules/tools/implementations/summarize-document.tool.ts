import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { RiskTier } from '../../../common/constants';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  GENERATION_PROVIDER,
  GenerationProvider,
} from '../../providers/generation.provider';
import type { Tool } from '../tool.interface';

const schema = z.object({
  documentId: z.string().min(1),
});

type Params = z.infer<typeof schema>;

const CHUNK_CAP = 30;

@Injectable()
export class SummarizeDocumentTool implements Tool<Params> {
  readonly name = 'summarize_document';
  readonly description = 'Summarize the content of a single document by ID';
  readonly riskTier = RiskTier.read;
  readonly schema = schema;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(GENERATION_PROVIDER) private readonly provider: GenerationProvider,
  ) {}

  async execute(params: Params): Promise<unknown> {
    const chunks = await this.prisma.chunk.findMany({
      where: { documentId: params.documentId },
      orderBy: { chunkIndex: 'asc' },
      take: CHUNK_CAP,
      select: { content: true, chunkIndex: true },
    });

    if (chunks.length === 0) {
      return { summary: 'Document not found or has no content.' };
    }

    const fullText = chunks.map((c) => c.content).join('\n\n');

    const result = await this.provider.generate({
      systemPrompt: 'Summarize the following document content concisely.',
      messages: [{ role: 'user', content: fullText }],
    });

    return {
      summary: result.content,
      chunkCount: chunks.length,
      documentId: params.documentId,
    };
  }
}
