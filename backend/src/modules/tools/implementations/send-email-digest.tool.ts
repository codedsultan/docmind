import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { RiskTier } from '../../../common/constants';
import { EMAIL_SERVICE, EmailService } from '../../email/email.interface';
import type { Tool } from '../tool.interface';

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
  ) {}

  async execute(params: Params): Promise<unknown> {
    const recipient = this.config.get<string>('EMAIL_DIGEST_RECIPIENT');
    const subject = params.subject ?? 'Your DocMind Digest';
    const preview = `Subject: ${subject}\nTo: ${recipient ?? '<not configured>'}\n\n[Digest content would appear here]`;

    await this.emailService.sendDigest(preview);

    return { sent: true, subject };
  }
}
