import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

/**
 * Staged guard for internal/admin endpoints — intentionally unused in Phases 1-2.
 * - Phase 3: protects /admin/traces and other admin-only internal endpoints.
 * - Phase 8: protects admin-public-chat endpoints.
 *
 * Checks the X-Internal-Key header against INTERNAL_API_KEY config value.
 * Uses timing-safe comparison to prevent timing attacks.
 * Swap for a real JWT/session guard in Phase 5.
 */
@Injectable()
export class InternalKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const key = this.configService.get<string>('INTERNAL_API_KEY');
    if (!key) {
      throw new UnauthorizedException('INTERNAL_API_KEY is not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const raw = request.headers['x-internal-key'];
    const provided = Array.isArray(raw) ? raw[0] : raw;

    if (!provided) {
      throw new UnauthorizedException('Missing internal API key');
    }

    const expectedBuf = Buffer.from(key, 'utf8');
    const providedBuf = Buffer.from(provided, 'utf8');

    if (
      expectedBuf.length !== providedBuf.length ||
      !timingSafeEqual(expectedBuf, providedBuf)
    ) {
      throw new UnauthorizedException('Invalid internal API key');
    }

    return true;
  }
}
