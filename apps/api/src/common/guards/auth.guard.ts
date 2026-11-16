import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import { IS_PUBLIC, PERMS, SKIP_CSRF } from '../decorators';
import { AppError } from '../http/app-error';
import type { AppRequest } from '../auth-context';
import { SessionResolver, CSRF_COOKIE } from '../../modules/auth/session.resolver';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

function safeEq(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Global guard: resolves session/JWT auth, enforces CSRF (double-submit) for cookie-authenticated
 * state-changing requests, and checks @RequirePermissions.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionResolver,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (req.path.startsWith('/v1/')) return true; // gateway: API-key auth in its own pipeline
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, targets);

    const auth = await this.sessions.resolve(req);
    if (auth) req.auth = auth;

    // CSRF (double-submit): every state-changing browser request must echo the zz_csrf cookie in
    // X-CSRF-Token. Requests authenticated with a JWT bearer token carry no ambient credentials and are exempt.
    if (!SAFE.has(req.method) && !skipCsrf && auth?.via !== 'jwt') {
      const header = req.headers['x-csrf-token'];
      const cookie = req.cookies?.[CSRF_COOKIE];
      if (typeof header !== 'string' || typeof cookie !== 'string' || !safeEq(header, cookie))
        throw new AppError('CSRF_FAILED');
    }

    if (isPublic) return true;
    if (!auth) throw new AppError('UNAUTHENTICATED');

    const perms = this.reflector.getAllAndOverride<string[]>(PERMS, targets) ?? [];
    for (const p of perms) {
      const ok = p.startsWith('platform:')
        ? auth.platformPermissions.has(p)
        : auth.orgPermissions.has(p);
      if (!ok) throw new AppError('FORBIDDEN');
    }
    return true;
  }
}
