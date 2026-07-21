import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const apiKey = this.configService.get<string>('API_KEY');
    if (!apiKey) {
      throw new UnauthorizedException('API not configured for direct access');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const raw = request.headers['authorization'];
    const authHeader = Array.isArray(raw) ? raw[0] : raw;

    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    const expectedBuf = Buffer.from(apiKey, 'utf8');
    const providedBuf = Buffer.from(token, 'utf8');

    if (
      expectedBuf.length !== providedBuf.length ||
      !timingSafeEqual(expectedBuf, providedBuf)
    ) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
