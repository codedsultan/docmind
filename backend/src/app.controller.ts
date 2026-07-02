import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';
import { QueuesService } from './queues/queues.service';
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly queuesService: QueuesService,
  ) { }

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

  @Post('notify')
  async notify(@Body() body: { userId: string; message: string; channel: 'email' | 'push' | 'sms' }) {
    return this.queuesService.sendNotification(body);
  }

  @Get('queue/stats')
  async queueStats() {
    return this.queuesService.getQueueStats();
  }
}