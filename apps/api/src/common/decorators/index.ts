import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AppRequest, AuthContext } from '../auth-context';
import { forbidden } from '../http/app-error';

export const IS_PUBLIC = 'zz:public';
export const PERMS = 'zz:perms';
export const RATE_LIMIT = 'zz:ratelimit';
export const SKIP_CSRF = 'zz:skipcsrf';

/** Route does not require an authenticated session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Route needs all listed permissions. "platform:*" keys are checked against platform membership; others against the active org. */
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMS, perms);
export const RateLimit = (limit: number, windowSeconds = 60) =>
  SetMetadata(RATE_LIMIT, { limit, windowSeconds });
/** For server-to-server endpoints authenticated by signature (payment webhooks). */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);

export const Auth = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.auth) throw forbidden();
  return req.auth;
});

/** Active org id; throws if the user has no organization context. */
export const OrgId = createParamDecorator((_d: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  const id = req.auth?.org?.id;
  if (!id) throw forbidden('An organization context is required.');
  return id;
});

export const ReqMeta = createParamDecorator((_d: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  return {
    ip: req.ip ?? null,
    userAgent: (req.headers['user-agent'] ?? '').slice(0, 300),
    requestId: req.requestId,
  };
});
export type RequestMeta = { ip: string | null; userAgent: string; requestId: string };
