import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { QueuesService } from './queues/queues.service';
import { AuthGuard } from './common/guards/auth.guard';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, ignoreEnvVars: true }),
      ],
      controllers: [AppController],
      providers: [
        AppService,
        AuthGuard,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
          },
        },
        {
          provide: QueuesService,
          useValue: {
            sendNotification: jest.fn(),
            getQueueStats: jest.fn(),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return a connected status payload', async () => {
      const result = await appController.getRoot();
      expect(result.message).toMatch(/Hello.*API/);
      expect(result.db).toBe('connected ✅');
      expect(typeof result.timestamp).toBe('string');
    });
  });
});
