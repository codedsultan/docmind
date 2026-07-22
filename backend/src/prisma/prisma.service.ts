import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
// import { PrismaClient } from '../../generated/prisma';

/** JSON-serializable proxy that converts BigInt values to Numbers. */
function bigIntSafeProxy(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (Array.isArray(obj)) return obj.map(bigIntSafeProxy);
  if (typeof obj === 'object') {
    const acc: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      acc[k] = bigIntSafeProxy(v);
    }
    return acc;
  }
  return obj;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Get database URL from environment
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not defined in environment variables');
    }

    // Create the PostgreSQL connection pool
    const dbUrl = new URL(databaseUrl);
    const connLimit = parseInt(
      dbUrl.searchParams.get('connection_limit') ?? '10',
      10,
    );
    const poolTimeout = parseInt(
      dbUrl.searchParams.get('pool_timeout') ?? '20',
      10,
    );
    const pool = new Pool({
      connectionString: databaseUrl,
      max: connLimit,
      connectionTimeoutMillis: poolTimeout * 1000,
    });

    // Create the Prisma adapter
    const adapter = new PrismaPg(pool);

    // Pass the adapter to PrismaClient
    super({
      adapter,
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
    });
  }

  /** Serialize a value to a plain object with all BigInt fields converted to Number. */
  serialize<T>(value: T): T {
    return bigIntSafeProxy(value) as T;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('✅ Prisma connected to database successfully');
    } catch (error) {
      this.logger.error('❌ Failed to connect to database:', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
      this.logger.log('✅ Prisma disconnected from database');
    } catch (error) {
      this.logger.error('❌ Failed to disconnect from database:', error);
    }
  }
}
