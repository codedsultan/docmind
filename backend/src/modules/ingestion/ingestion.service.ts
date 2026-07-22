import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_USER_ID } from '../../common/constants';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { ParserService } from './parsers/parser.service';
import { createHash } from 'crypto';
import { SourceType } from '../../../generated/prisma/enums';

export interface IngestionJob {
  documentId: string;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parserService: ParserService,
    @InjectQueue(process.env.QUEUE_INGESTION ?? 'ingestion')
    private readonly ingestionQueue: Queue,
  ) {}

  async uploadDocument(
    file: Express.Multer.File,
    dto: UploadDocumentDto,
    userId: string = DEV_USER_ID,
  ) {
    const contentHash = createHash('sha256').update(file.buffer).digest('hex');

    const title = (
      dto.title ?? file.originalname.replace(/\.[^/.]+$/, '')
    ).slice(0, 255);
    const sourceType = this.inferSourceType(file.mimetype, file.originalname);

    // Check for duplicate content scoped to this user
    const existing = await this.prisma.document.findUnique({
      where: { userId_contentHash: { userId, contentHash } },
    });

    if (existing) {
      if (!existing.isActive) {
        const updated = await this.prisma.document.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            status: 'pending',
            version: existing.version + 1,
          },
        });
        await this.enqueueIngestion(existing.id);
        return { document: updated, message: 'Document reactivated' };
      }
      return {
        document: existing,
        message: 'Document already exists (duplicate content)',
      };
    }

    // Parse the file to extract text
    const parsed = await this.parserService.parse(
      file.buffer,
      file.mimetype,
      file.originalname,
    );

    // Create document record with raw text (status: pending)
    const document = await this.prisma.document.create({
      data: {
        userId,
        title,
        contentHash,
        rawText: parsed.text,
        sourceType,
        visibility: dto.visibility ?? 'private',
        status: 'pending',
        isActive: true,
        version: 1,
      },
    });

    // Enqueue async ingestion job
    await this.enqueueIngestion(document.id);

    this.logger.log(`Document uploaded: ${document.id} — "${title}"`);

    return { document, message: 'Document uploaded successfully' };
  }

  private async enqueueIngestion(documentId: string): Promise<void> {
    await this.ingestionQueue.add(
      'ingest-document',
      { documentId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Enqueued ingestion job for document ${documentId}`);
  }

  async listDocuments(userId: string = DEV_USER_ID) {
    return this.prisma.document.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        title: true,
        sourceType: true,
        visibility: true,
        status: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getDocument(id: string, userId: string = DEV_USER_ID) {
    const doc = await this.prisma.document.findFirst({
      where: { id, userId, isActive: true },
      select: {
        id: true,
        userId: true,
        title: true,
        sourceType: true,
        visibility: true,
        status: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async deleteDocument(id: string, userId: string = DEV_USER_ID) {
    const doc = await this.prisma.document.findFirst({
      where: { id, userId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    await this.prisma.document.update({
      where: { id },
      data: { isActive: false },
    });

    this.logger.log(`Document soft-deleted: ${id}`);
  }

  private inferSourceType(mimetype: string, filename: string): SourceType {
    if (mimetype === 'application/pdf' || filename.endsWith('.pdf'))
      return SourceType.pdf;
    if (
      mimetype === 'text/markdown' ||
      filename.endsWith('.md') ||
      filename.endsWith('.mdx')
    )
      return SourceType.markdown;
    if (filename.endsWith('.html') || filename.endsWith('.htm'))
      return SourceType.html;
    if (filename.endsWith('.rtf')) return SourceType.rtf;
    return SourceType.txt;
  }
}
