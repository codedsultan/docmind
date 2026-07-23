import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProvidersModule } from '../providers/providers.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { NotesModule } from '../notes/notes.module';
import { TasksModule } from '../tasks/tasks.module';
import { EmailModule } from '../email/email.module';
import { ToolRegistryService } from './tool-registry.service';
import { QueryDocumentsTool } from './implementations/query-documents.tool';
import { SummarizeDocumentTool } from './implementations/summarize-document.tool';
import { SaveNoteTool } from './implementations/save-note.tool';
import { CreateTaskTool } from './implementations/create-task.tool';
import { SendEmailDigestTool } from './implementations/send-email-digest.tool';

@Module({
  imports: [
    PrismaModule,
    ProvidersModule,
    RetrievalModule,
    NotesModule,
    TasksModule,
    EmailModule,
  ],
  providers: [
    ToolRegistryService,
    QueryDocumentsTool,
    SummarizeDocumentTool,
    SaveNoteTool,
    CreateTaskTool,
    SendEmailDigestTool,
  ],
  exports: [ToolRegistryService],
})
export class ToolsModule implements OnModuleInit {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly queryDocuments: QueryDocumentsTool,
    private readonly summarizeDocument: SummarizeDocumentTool,
    private readonly saveNote: SaveNoteTool,
    private readonly createTask: CreateTaskTool,
    private readonly sendEmailDigest: SendEmailDigestTool,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.queryDocuments);
    this.registry.register(this.summarizeDocument);
    this.registry.register(this.saveNote);
    this.registry.register(this.createTask);
    this.registry.register(this.sendEmailDigest);
  }
}
