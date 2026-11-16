import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { LoginInput, RegisterInput } from '@zeze/shared';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { newSessionToken } from '../../common/crypto/tokens';
import { AppError, badRequest, notFound } from '../../common/http/app-error';
import type { AuthContext } from '../../common/auth-context';
import type { RequestMeta } from '../../common/decorators';
import { env } from '../../config/env';
import { createOrganization } from '../orgs/org-factory';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const ARGON = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
// Pre-computed hash used to equalize timing when the email is unknown.
let dummyHash: string | null = null;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jwt: JwtService,
    private readonly enc: EncryptionService,
  ) {}

  static hashPassword(pw: string) {
    return argon2.hash(pw, ARGON);
  }

  async register(input: RegisterInput, meta: RequestMeta) {
    const signups = await this.prisma.systemSetting.findUnique({
      where: { key: 'signupsEnabled' },
    });
    if (signups && signups.value === false)
      throw new AppError(
        'FORBIDDEN',
        'New registrations are temporarily disabled. Please contact sales.',
      );
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw new AppError('CONFLICT', 'An account with this email already exists.');
    const passwordHash = await AuthService.hashPassword(input.password);
    const { user, org } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash },
      });
      const org = await createOrganization(tx, {
        name: input.organizationName,
        type: input.accountType,
        ownerUserId: user.id,
        billingEmail: input.email,
      });
      await this.audit.record(
        {
          action: 'auth.register',
          actor: { userId: user.id },
          orgId: org.id,
          targetType: 'User',
          targetId: user.id,
          metadata: { accountType: input.accountType },
          meta,
        },
        tx,
      );
      return { user, org };
    });
    const session = await this.createSession(user.id, org.id, meta, false);
    return { user: { id: user.id, email: user.email, name: user.name }, orgId: org.id, ...session };
  }

  async login(input: LoginInput, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.deletedAt) {
      dummyHash ??= await AuthService.hashPassword('dummy-password-for-timing');
      await argon2.verify(dummyHash, input.password).catch(() => false);
      throw new AppError('INVALID_CREDENTIALS');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError('ACCOUNT_LOCKED');
    const ok = await argon2.verify(user.passwordHash, input.password).catch(() => false);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed >= MAX_FAILED ? 0 : failed,
          lockedUntil:
            failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined,
        },
      });
      await this.audit.record({
        action: 'auth.login_failed',
        actor: { userId: user.id },
        targetType: 'User',
        targetId: user.id,
        meta,
      });
      throw new AppError('INVALID_CREDENTIALS');
    }
    if (user.status !== 'ACTIVE') throw new AppError('FORBIDDEN', 'This account is not active.');
    if (user.mfaEnabled) {
      if (!input.mfaCode) throw new AppError('MFA_REQUIRED');
      if (!this.verifyTotp(user.mfaSecretEnc, input.mfaCode)) {
        await this.audit.record({ action: 'auth.mfa_failed', actor: { userId: user.id }, meta });
        throw new AppError('INVALID_CREDENTIALS', 'Invalid MFA code.');
      }
    }
    if (argon2.needsRehash(user.passwordHash, ARGON)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await AuthService.hashPassword(input.password) },
      });
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const firstOrg = await this.prisma.organizationMember.findFirst({
      where: { userId: user.id, org: { type: { not: 'PLATFORM' }, deletedAt: null } },
      orderBy: { createdAt: 'asc' },
    });
    const session = await this.createSession(
      user.id,
      firstOrg?.orgId ?? null,
      meta,
      user.mfaEnabled,
    );
    await this.audit.record({
      action: 'auth.login',
      actor: { userId: user.id },
      targetType: 'Session',
      targetId: session.sessionId,
      meta,
    });
    return { user: { id: user.id, email: user.email, name: user.name }, ...session };
  }

  private async createSession(
    userId: string,
    activeOrgId: string | null,
    meta: RequestMeta,
    mfaVerified: boolean,
  ) {
    const { token, hash } = newSessionToken();
    const expiresAt = new Date(Date.now() + env().SESSION_TTL_HOURS * 3600_000);
    const s = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hash,
        activeOrgId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        expiresAt,
        mfaVerified,
      },
    });
    return { token, sessionId: s.id, expiresAt };
  }

  async logout(auth: AuthContext, meta: RequestMeta) {
    await this.prisma.session.update({
      where: { id: auth.sessionId },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      action: 'auth.logout',
      actor: auth,
      targetType: 'Session',
      targetId: auth.sessionId,
      meta,
    });
  }

  async switchOrg(auth: AuthContext, orgId: string) {
    const m = auth.memberships.find((x) => x.orgId === orgId && x.orgType !== 'PLATFORM');
    if (!m) throw notFound('Organization');
    await this.prisma.session.update({
      where: { id: auth.sessionId },
      data: { activeOrgId: orgId },
    });
  }

  async issueJwt(auth: AuthContext) {
    const expiresIn = 900;
    const token = await this.jwt.signAsync(
      { sub: auth.userId, sid: auth.sessionId },
      { secret: env().JWT_SECRET, expiresIn, audience: 'zeze-app' },
    );
    return { accessToken: token, tokenType: 'Bearer', expiresIn };
  }

  async changePassword(auth: AuthContext, current: string, next: string, meta: RequestMeta) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!(await argon2.verify(user.passwordHash, current)))
      throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect.');
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await AuthService.hashPassword(next) },
      }),
      this.prisma.session.updateMany({
        where: { userId: user.id, id: { not: auth.sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      action: 'auth.password_changed',
      actor: auth,
      targetType: 'User',
      targetId: user.id,
      meta,
    });
  }

  listSessions(auth: AuthContext) {
    return this.prisma.session.findMany({
      where: { userId: auth.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async revokeSession(auth: AuthContext, id: string) {
    const r = await this.prisma.session.updateMany({
      where: { id, userId: auth.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!r.count) throw notFound('Session');
  }

  // ── MFA (TOTP) ──
  private verifyTotp(secretEnc: string | null, code: string) {
    if (!secretEnc) return false;
    const secret = this.enc.decryptJson<{ secret: string }>(JSON.parse(secretEnc), 'mfa').secret;
    return authenticator.verify({ token: code, secret });
  }

  async mfaSetup(auth: AuthContext) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (user.mfaEnabled) throw badRequest('MFA is already enabled.');
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { mfaSecretEnc: JSON.stringify(this.enc.encryptJson({ secret }, 'mfa')) },
    });
    return { secret, otpauthUrl: authenticator.keyuri(user.email, env().COMPANY_NAME, secret) };
  }

  async mfaEnable(auth: AuthContext, code: string, meta: RequestMeta) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!this.verifyTotp(user.mfaSecretEnc, code)) throw badRequest('Invalid code.');
    await this.prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
    await this.audit.record({
      action: 'auth.mfa_enabled',
      actor: auth,
      targetType: 'User',
      targetId: user.id,
      meta,
    });
  }

  async mfaDisable(auth: AuthContext, password: string, code: string, meta: RequestMeta) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (
      !(await argon2.verify(user.passwordHash, password)) ||
      !this.verifyTotp(user.mfaSecretEnc, code)
    )
      throw new AppError('INVALID_CREDENTIALS');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: false, mfaSecretEnc: null },
    });
    await this.audit.record({
      action: 'auth.mfa_disabled',
      actor: auth,
      targetType: 'User',
      targetId: user.id,
      meta,
    });
  }
}
