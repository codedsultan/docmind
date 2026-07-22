import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { RiskTier } from '../../../common/constants';
import { NotesService } from '../../notes/notes.service';
import type { Tool, ToolContext } from '../tool.interface';

const schema = z.object({
  content: z.string().min(1).max(10000),
  sourceQueryId: z.string().optional(),
});

type Params = z.infer<typeof schema>;

@Injectable()
export class SaveNoteTool implements Tool<Params> {
  readonly name = 'save_note';
  readonly description = 'Save a note from the current conversation';
  readonly riskTier = RiskTier.internalWrite;
  readonly schema = schema;

  constructor(private readonly notesService: NotesService) {}

  async execute(params: Params, ctx: ToolContext): Promise<unknown> {
    const note = await this.notesService.create(
      ctx.userId,
      params.content,
      params.sourceQueryId,
    );
    return { noteId: note.id, content: note.content };
  }
}
