import { Controller, Delete, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Response } from 'express';
import { z } from 'zod';
import { loginSchema, passwordSchema, registerSchema } from '@zeze/shared';
import { Auth, Public, RateLimit, ReqMeta, RequestMeta } from '../../common/decorators';
import type { AuthContext } from '../../common/auth-context';
import { ApiZodBody, ZBody, uuidParam } from '../../common/http/zod';
import { randomBase62 } from '../../common/crypto/tokens';
import { env, isProd } from '../../config/env';
import { AuthService } from './auth.service';
import { CSRF_COOKIE, SESSION_COOKIE } from './session.resolver';

const cookieBase = (): CookieOptions => ({
  secure: isProd(),
  sameSite: 'lax',
  path: '/',
  domain: env().COOKIE_DOMAIN || undefined,
});

function presentContext(a: AuthContext) {
  return {
    user: { id: a.userId, email: a.email, name: a.name },
    org: a.org,
    orgRole: a.orgRole,
    orgPermissions: [...a.orgPermissions],
    platformRole: a.platformRole,
    platformPermissions: [...a.platformPermissions],
    isPlatformStaff: a.platformPermissions.size > 0,
    memberships: a.memberships.filter((m) => m.orgType !== 'PLATFORM'),
  };
}

const switchSchema = z.object({ orgId: z.string().uuid() });
const changePwSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
const mfaCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
const mfaDisableSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(1),
});

@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setSession(res: Response, token: string, expiresAt: Date) {
    res.cookie(SESSION_COOKIE, token, { ...cookieBase(), httpOnly: true, expires: expiresAt });
  }

  @Public()
  @Get('csrf')
  csrf(@Res({ passthrough: true }) res: Response) {
    const token = randomBase62(32);
    res.cookie(CSRF_COOKIE, token, { ...cookieBase(), httpOnly: false });
    return { csrfToken: token };
  }

  @Public()
  @RateLimit(5, 60)
  @Post('register')
  @ApiZodBody(registerSchema)
  async register(
    @ZBody(registerSchema) body: z.infer<typeof registerSchema>,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.auth.register(body, meta);
    this.setSession(res, r.token, r.expiresAt);
    return { user: r.user, orgId: r.orgId };
  }

  @Public()
  @RateLimit(10, 60)
  @HttpCode(200)
  @Post('login')
  @ApiZodBody(loginSchema)
  async login(
    @ZBody(loginSchema) body: z.infer<typeof loginSchema>,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.auth.login(body, meta);
    this.setSession(res, r.token, r.expiresAt);
    return { user: r.user };
  }

  @HttpCode(204)
  @Post('logout')
  async logout(
    @Auth() a: AuthContext,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(a, meta);
    res.clearCookie(SESSION_COOKIE, cookieBase());
  }

  @Get('me')
  me(@Auth() a: AuthContext) {
    return presentContext(a);
  }

  @HttpCode(204)
  @Post('switch-org')
  @ApiZodBody(switchSchema)
  async switchOrg(@Auth() a: AuthContext, @ZBody(switchSchema) b: z.infer<typeof switchSchema>) {
    await this.auth.switchOrg(a, b.orgId);
  }

  /** Short-lived JWT for scripted access to the management API (not the gateway — use API keys there). */
  @HttpCode(200)
  @Post('token')
  token(@Auth() a: AuthContext) {
    return this.auth.issueJwt(a);
  }

  @HttpCode(204)
  @RateLimit(5, 60)
  @Post('password')
  @ApiZodBody(changePwSchema)
  async changePassword(
    @Auth() a: AuthContext,
    @ZBody(changePwSchema) b: z.infer<typeof changePwSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.auth.changePassword(a, b.currentPassword, b.newPassword, meta);
  }

  @Get('sessions')
  sessions(@Auth() a: AuthContext) {
    return this.auth.listSessions(a);
  }

  @HttpCode(204)
  @Delete('sessions/:id')
  async revokeSession(@Auth() a: AuthContext, @Param('id') id: string) {
    await this.auth.revokeSession(a, uuidParam.parse(id));
  }

  @Post('mfa/setup')
  mfaSetup(@Auth() a: AuthContext) {
    return this.auth.mfaSetup(a);
  }

  @HttpCode(204)
  @RateLimit(10, 60)
  @Post('mfa/enable')
  @ApiZodBody(mfaCodeSchema)
  async mfaEnable(
    @Auth() a: AuthContext,
    @ZBody(mfaCodeSchema) b: z.infer<typeof mfaCodeSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.auth.mfaEnable(a, b.code, meta);
  }

  @HttpCode(204)
  @RateLimit(10, 60)
  @Post('mfa/disable')
  @ApiZodBody(mfaDisableSchema)
  async mfaDisable(
    @Auth() a: AuthContext,
    @ZBody(mfaDisableSchema) b: z.infer<typeof mfaDisableSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.auth.mfaDisable(a, b.password, b.code, meta);
  }
}
