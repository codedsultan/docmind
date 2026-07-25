import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';
import { QueuesService } from './queues/queues.service';
import { NotificationDto } from './common/dto/notification.dto';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly queuesService: QueuesService,
  ) {}

  @Public()
  @Get()
  getRoot() {
    return this.appService.getHello();
  }

  @Public()
  @Get('hello')
  getHello() {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Post('notify')
  async notify(@Body() body: NotificationDto) {
    return this.queuesService.sendNotification(body);
  }

  @Public()
  @Get('queue/stats')
  async queueStats() {
    return this.queuesService.getQueueStats();
  }
}
