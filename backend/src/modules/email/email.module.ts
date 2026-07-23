import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailLogService } from './email-log.service';
import { SmtpEmailService } from './email-smtp.service';
import { EMAIL_SERVICE } from './email.interface';

@Module({
  imports: [],
  providers: [
    {
      provide: EMAIL_SERVICE,
      useFactory: (config: ConfigService) => {
        const mode = config.get<string>('EMAIL_MODE', 'log');
        if (mode === 'send') {
          const host = config.get<string>('SMTP_HOST');
          const user = config.get<string>('SMTP_USER');
          const pass = config.get<string>('SMTP_PASS');
          if (!host || !user || !pass) {
            throw new Error(
              'EMAIL_MODE=send requires SMTP_HOST, SMTP_USER, and SMTP_PASS to be configured',
            );
          }
          return new SmtpEmailService(config);
        }
        return new EmailLogService();
      },
      inject: [ConfigService],
    },
  ],
  exports: [EMAIL_SERVICE],
})
export class EmailModule {}
