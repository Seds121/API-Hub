import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../redis.service';
import { RATE_LIMIT } from '../decorators';
import { AppError } from '../http/app-error';
import type { AppRequest } from '../auth-context';

const DEFAULT = { limit: 300, windowSeconds: 60 };

/** Per-IP (and per-route when decorated) limiter for the web application API. The gateway has its own limiter. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (req.path.startsWith('/v1/')) return true;
    const cfg = this.reflector.getAllAndOverride<{ limit: number; windowSeconds: number }>(
      RATE_LIMIT,
      [ctx.getHandler(), ctx.getClass()],
    );
    const { limit, windowSeconds } = cfg ?? DEFAULT;
    const scope = cfg ? `${ctx.getClass().name}.${ctx.getHandler().name}` : 'global';
    const r = await this.redis.hit(`app:${scope}:${req.ip}`, limit, windowSeconds * 1000);
    const res = ctx.switchToHttp().getResponse();
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(r.remaining));
    if (!r.allowed)
      throw new AppError('RATE_LIMITED', undefined, undefined, {
        'Retry-After': String(Math.ceil(r.resetMs / 1000)),
      });
    return true;
  }
}
