import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RetrievalService } from '../retrieval/retrieval.service';
import {
  GENERATION_PROVIDER,
  GenerationProvider,
} from '../providers/generation.provider';
import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class QueryDto {
  @ApiProperty({
    description: 'The question to ask',
    minLength: 1,
    maxLength: 5000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  query!: string;

  @ApiProperty({
    description: 'Number of source chunks to retrieve',
    minimum: 1,
    maximum: 20,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number;
}

export class QuerySourceDto {
  @ApiProperty() chunkId!: string;
  @ApiProperty() documentId!: string;
  @ApiProperty() content!: string;
  @ApiProperty() similarity!: number;
}

export class QueryResponseDto {
  @ApiProperty() answer!: string;
  @ApiProperty({ type: [QuerySourceDto] }) sources!: QuerySourceDto[];
}

@ApiTags('chat')
@UseGuards(AuthGuard)
@Controller('v1/chat')
export class QueryController {
  constructor(
    private readonly retrievalService: RetrievalService,
    @Inject(GENERATION_PROVIDER)
    private readonly generationProvider: GenerationProvider,
  ) {}

  @Post('query')
  @ApiOperation({ summary: 'Ask a question about ingested documents' })
  @ApiBody({ type: QueryDto })
  @ApiResponse({
    status: 200,
    description: 'Answer with source chunks',
    type: QueryResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid query input' })
  async query(@Body() dto: QueryDto): Promise<QueryResponseDto> {
    const topK = dto.topK ?? 5;

    // Retrieve relevant chunks
    const chunks = await this.retrievalService.retrieve(dto.query, { topK });

    // Generate answer from context
    const answer = await this.generateAnswer(dto.query, chunks);

    return {
      answer,
      sources: chunks.map((c) => ({
        chunkId: c.chunkId,
        documentId: c.documentId,
        content: c.content.slice(0, 200), // Truncate source preview
        similarity: c.similarity,
      })),
    };
  }

  private async generateAnswer(
    query: string,
    chunks: { content: string; chunkId: string }[],
  ): Promise<string> {
    const systemPrompt =
      'You are a helpful AI assistant that answers questions based on provided context. ' +
      'Answer only from the context provided below. If the context does not contain enough ' +
      'information to answer the question, say you do not know. Do not make up information. ' +
      'Cite relevant sources inline using [source:N] notation where N is the source number.';

    const context = chunks
      .map((c, i) => `[source:${i + 1}] ${c.content}`)
      .join('\n\n');

    const userMessage =
      chunks.length > 0
        ? `Context:\n${context}\n\nQuestion: ${query}`
        : `Question: ${query}\n\nNote: No relevant context was found in the documents.`;

    const result = await this.generationProvider.generate({
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      temperature: 0.3,
      maxOutputTokens: 1024,
    });

    return result.content;
  }
}
