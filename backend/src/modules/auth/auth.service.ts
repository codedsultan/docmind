import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { REDIS_CLIENT } from '../../redis/redis.module';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async register(email: string, password: string): Promise<{ token: string }> {
    const normalizedEmail = email.toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await argon2.hash(password);
    const user = await this.prisma.user.create({
      data: { email: normalizedEmail, passwordHash },
      select: { id: true, email: true },
    });

    return { token: this.sign(user) };
  }

  async login(email: string, password: string): Promise<{ token: string }> {
    const normalizedEmail = email.toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { token: this.sign({ id: user.id, email: user.email }) };
  }

  private sign(user: { id: string; email: string }): string {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return this.jwtService.sign(payload);
  }

  /**
   * Adds the current user's token to a Redis blocklist so it can no longer
   * be used for authentication. The blocklist TTL matches the JWT expiry.
   */
  async logout(payload: JwtPayload): Promise<void> {
    if (payload.iat) {
      await this.redis.setex(
        `blocklist:user:${payload.sub}`,
        86_400, // 1 day in seconds, matching JWT expiry
        String(payload.iat),
      );
    }
  }
}
