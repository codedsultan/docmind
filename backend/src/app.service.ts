import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) { }

  async getHello(): Promise<{ message: string; timestamp: string; db: string }> {
    // Raw query — works before any migrations, just proves connectivity
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      message: 'Hello from Backend API 👋',
      timestamp: new Date().toISOString(),
      db: 'connected ✅',
    };
  }
}