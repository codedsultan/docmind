import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueuesService } from './queues.service';
import { NotificationsProcessor } from './processors/notifications.processor';

@Module({
    imports: [
        BullModule.forRootAsync({
            useFactory: () => ({
                connection: {
                    url: process.env.REDIS_URL,
                },
            }),
        }),
        BullModule.registerQueue({
            name: process.env.QUEUE_NOTIFICATIONS ?? 'notifications',
        }),
    ],
    providers: [QueuesService, NotificationsProcessor],  // ← add QueuesService here
    exports: [BullModule, QueuesService],
})
export class QueuesModule { }