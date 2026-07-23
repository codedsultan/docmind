import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailService } from './email.interface';

/** Production implementation: sends digest via SMTP using nodemailer. */
@Injectable()
export class SmtpEmailService implements EmailService {
  private readonly logger = new Logger(SmtpEmailService.name);
  private readonly host: string;
  private readonly port: number;
  private readonly user: string;
  private readonly pass: string;

  constructor(private readonly config: ConfigService) {
    this.host = this.config.get<string>('SMTP_HOST') ?? 'localhost';
    this.port = this.config.get<number>('SMTP_PORT') ?? 587;
    this.user = this.config.get<string>('SMTP_USER') ?? '';
    this.pass = this.config.get<string>('SMTP_PASS') ?? '';

    if (!this.user && !this.pass) {
      this.logger.warn(
        'SMTP credentials not configured — emails will not be delivered',
      );
    }
  }

  async sendDigest(preview: string): Promise<void> {
    // Dynamic import to avoid bundling nodemailer when EMAIL_MODE=log
    const nodemailer = await import('nodemailer');

    const transporter = nodemailer.createTransport({
      host: this.host,
      port: this.port,
      secure: this.port === 465,
      auth:
        this.user && this.pass
          ? { user: this.user, pass: this.pass }
          : undefined,
    });

    const recipient = this.config.get<string>('EMAIL_DIGEST_RECIPIENT') ?? '';

    await transporter.sendMail({
      from: this.user,
      to: recipient,
      subject: 'Your DocMind Digest',
      text: preview,
    });

    this.logger.log(`Digest sent to ${recipient}`);
  }
}
