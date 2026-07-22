import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

export interface NotificationJob {
  userId: string;
  message: string;
  channel: 'email' | 'push' | 'sms';
}

@Processor(process.env.QUEUE_NOTIFICATIONS ?? 'notifications')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  async process(job: Job<NotificationJob>): Promise<{ sent: boolean }> {
    this.logger.log(
      `Processing job #${job.id} — ${job.name} for user ${job.data.userId}`,
    );

    // Simulate sending — replace with real email/push/sms logic
    await this.simulateSend(job.data);

    this.logger.log(`✅ Job #${job.id} completed`);
    return { sent: true };
  }

  private async simulateSend(data: NotificationJob): Promise<void> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    // Log metadata only — message body is intentionally excluded (may contain PII)
    this.logger.log(`📨 [${data.channel.toUpperCase()}] → user:${data.userId}`);
  }
}
