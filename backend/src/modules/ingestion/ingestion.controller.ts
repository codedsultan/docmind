import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard';
import { IngestionService } from './ingestion.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentResponseDto } from './dto/document-response.dto';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@ApiTags('documents')
@Controller('v1/documents')
@UseGuards(AuthGuard)
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('upload')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Upload a document (PDF, Markdown, or plain text)' })
  @ApiResponse({
    status: 201,
    description: 'Document created and queued for ingestion',
    type: DocumentResponseDto,
  })
  @ApiResponse({
    status: 422,
    description: 'File type or size validation failed',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Document file (PDF, .md, .txt)',
        },
        title: { type: 'string', description: 'Optional title' },
        visibility: {
          type: 'string',
          enum: ['private', 'public'],
          description: 'Document visibility',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
          new FileTypeValidator({
            fileType: /^(application\/pdf|text\/plain|text\/markdown)$/,
          }),
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.ingestionService.uploadDocument(file, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all active documents' })
  @ApiResponse({
    status: 200,
    description: 'Array of active documents',
    type: [DocumentResponseDto],
  })
  async list() {
    return this.ingestionService.listDocuments();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a document by ID' })
  async get(@Param('id') id: string) {
    return this.ingestionService.getDocument(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a document' })
  @ApiResponse({ status: 204, description: 'Document soft-deleted' })
  async delete(@Param('id') id: string) {
    await this.ingestionService.deleteDocument(id);
    return { message: 'Document deleted' };
  }
}
