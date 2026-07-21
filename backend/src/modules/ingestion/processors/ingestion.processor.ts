import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChunkerService } from '../parsers/chunker.service';
import {
  EMBEDDING_PROVIDER,
  EmbeddingProvider,
} from '../../providers/embedding.provider';
import { IngestionJob } from '../ingestion.service';
import {
  DocumentIngestedEvent,
  DOCUMENT_INGESTED_EVENT,
} from '../events/document-ingested.event';

@Processor(process.env.QUEUE_INGESTION ?? 'ingestion')
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chunkerService: ChunkerService,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<IngestionJob>): Promise<void> {
    const { documentId } = job.data;
    this.logger.log(
      `Processing ingestion job #${job.id} for document ${documentId}`,
    );

    // Load the document
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      this.logger.error(`Document ${documentId} not found`);
      throw new Error(`Document ${documentId} not found`);
    }

    if (!document.rawText) {
      this.logger.error(`Document ${documentId} has no raw text`);
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'failed' },
      });
      return;
    }

    try {
      // Mark as processing
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'processing' },
      });

      // 1. Chunk the text
      const chunks = this.chunkerService.chunk(document.rawText);
      this.logger.log(
        `Document ${documentId} split into ${chunks.length} chunks`,
      );

      if (chunks.length === 0) {
        this.logger.warn(`Document ${documentId} produced zero chunks`);
        await this.prisma.document.update({
          where: { id: documentId },
          data: { status: 'ready' },
        });
        return;
      }

      // 2. Batch-embed chunks via provider
      const texts = chunks.map((c) => c.content);
      const { embeddings } = await this.embeddingProvider.embed({ texts });

      if (embeddings.length !== chunks.length) {
        throw new Error(
          `Embedding count mismatch: expected ${chunks.length}, got ${embeddings.length}`,
        );
      }

      // 3. Store chunks in database
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];

        await this.prisma.$executeRaw`
          INSERT INTO "chunks" ("documentId", "content", "contentHash", "chunkIndex", "embedding", "createdAt")
          VALUES (${documentId}, ${chunk.content}, ${chunk.contentHash}, ${chunk.chunkIndex}, ${embedding}::vector, NOW())
          ON CONFLICT ("documentId", "contentHash") DO NOTHING
        `;
      }

      // 4. Update status to ready
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'ready' },
      });

      this.logger.log(
        `✅ Document ${documentId} ingested: ${chunks.length} chunks stored`,
      );

      // 5. Emit DocumentIngested event
      const userId = document.userId;
      this.eventEmitter.emit(
        DOCUMENT_INGESTED_EVENT,
        new DocumentIngestedEvent(documentId, chunks.length, userId),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Ingestion failed for document ${documentId}: ${message}`,
      );

      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'failed' },
      });

      throw error; // Let BullMQ handle retries
    }
  }
}
