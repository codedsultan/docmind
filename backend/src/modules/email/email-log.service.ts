import { Injectable, Logger } from '@nestjs/common';
import type { EmailService } from './email.interface';

/** Dev implementation: logs the digest preview to console, never sends. */
@Injectable()
export class EmailLogService implements EmailService {
  private readonly logger = new Logger(EmailLogService.name);

  sendDigest(preview: string): Promise<void> {
    this.logger.log(`[EMAIL_LOG] Digest preview:\n${preview}`);
    return Promise.resolve();
  }
}
