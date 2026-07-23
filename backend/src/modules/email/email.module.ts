import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailLogService } from './email-log.service';
import { EMAIL_SERVICE } from './email.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    EmailLogService,
    {
      provide: EMAIL_SERVICE,
      useExisting: EmailLogService,
    },
  ],
  exports: [EMAIL_SERVICE],
})
export class EmailModule {}
