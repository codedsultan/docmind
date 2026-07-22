import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationJob } from './processors/notifications.processor';

@Injectable()
export class QueuesService {
  private readonly logger = new Logger(QueuesService.name);

  constructor(
    @InjectQueue(process.env.QUEUE_NOTIFICATIONS ?? 'notifications')
    private readonly notificationsQueue: Queue,
  ) {}

  async sendNotification(data: NotificationJob): Promise<{ jobId: string }> {
    const job = await this.notificationsQueue.add('send-notification', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 100, // keep last 100 completed jobs
      removeOnFail: 50, // keep last 50 failed jobs
    });

    this.logger.log(
      `Queued notification job #${job.id} for user ${data.userId}`,
    );
    return { jobId: String(job.id) };
  }

  async getQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.notificationsQueue.getWaitingCount(),
      this.notificationsQueue.getActiveCount(),
      this.notificationsQueue.getCompletedCount(),
      this.notificationsQueue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }
}
