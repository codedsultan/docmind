import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { QueuesService } from './queues/queues.service';
import { AuthGuard } from './common/guards/auth.guard';
import { NotificationDto } from './common/dto/notification.dto';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly queuesService: QueuesService,
  ) {}

  @Get()
  getRoot() {
    return this.appService.getHello();
  }

  @Get('hello')
  getHello() {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @UseGuards(AuthGuard)
  @Post('notify')
  async notify(@Body() body: NotificationDto) {
    return this.queuesService.sendNotification(body);
  }

  @UseGuards(AuthGuard)
  @Get('queue/stats')
  async queueStats() {
    return this.queuesService.getQueueStats();
  }
}
