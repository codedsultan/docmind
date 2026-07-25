import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { RiskTier } from '../../../common/constants';
import { EMAIL_SERVICE, EmailService } from '../../email/email.interface';
import {
  GENERATION_PROVIDER,
  GenerationProvider,
} from '../../providers/generation.provider';
import { NotesService } from '../../notes/notes.service';
import type { Tool, ToolContext } from '../tool.interface';

const schema = z.object({
  subject: z.string().max(200).optional(),
});

type Params = z.infer<typeof schema>;

@Injectable()
export class SendEmailDigestTool implements Tool<Params> {
  readonly name = 'send_email_digest';
  readonly description =
    'Send an email digest to the configured recipient (requires user confirmation)';
  readonly riskTier = RiskTier.externalWrite;
  readonly schema = schema;

  constructor(
    private readonly config: ConfigService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    @Inject(GENERATION_PROVIDER)
    private readonly generationProvider: GenerationProvider,
    private readonly notesService: NotesService,
  ) {}

  async execute(params: Params, ctx: ToolContext): Promise<unknown> {
    const recipient = this.config.get<string>('EMAIL_DIGEST_RECIPIENT');
    const subject = params.subject ?? 'Your DocMind Digest';

    const recentNotes = await this.notesService.findRecent(ctx.userId, 10);

    let digestBody: string;
    if (recentNotes.length === 0) {
      digestBody = 'You have no notes yet.';
    } else {
      const notesSummaryInput = recentNotes
        .map((n, i) => `${i + 1}. ${n.content}`)
        .join('\n');
      const result = await this.generationProvider.generate({
        systemPrompt:
          'You are a helpful assistant. Summarise the following notes into a concise digest paragraph.',
        messages: [{ role: 'user', content: notesSummaryInput }],
        temperature: 0.3,
      });
      digestBody = result.content;
    }

    const preview =
      `Subject: ${subject}\nTo: ${recipient ?? '<not configured>'}\n\n` +
      digestBody;

    await this.emailService.sendDigest(preview);

    return { sent: true, subject };
  }
}
