import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma.service';
import { sha256 } from '../../common/crypto/tokens';
import type { AppRequest, AuthContext } from '../../common/auth-context';
import { env } from '../../config/env';

export const SESSION_COOKIE = 'zz_session';
export const CSRF_COOKIE = 'zz_csrf';

@Injectable()
export class SessionResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async resolve(req: AppRequest): Promise<AuthContext | null> {
    const authz = req.headers.authorization;
    if (typeof authz === 'string' && /^Bearer ey/.test(authz)) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub: string; sid: string }>(authz.slice(7), {
          secret: env().JWT_SECRET,
          audience: 'zeze-app',
        });
        return this.build(payload.sid, 'jwt', req);
      } catch {
        return null;
      }
    }
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      select: { id: true },
    });
    if (!session) return null;
    return this.build(session.id, 'cookie', req);
  }

  async build(
    sessionId: string,
    via: 'cookie' | 'jwt',
    req?: AppRequest,
  ): Promise<AuthContext | null> {
    const s = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          include: {
            memberships: {
              where: { org: { deletedAt: null } },
              include: {
                org: true,
                role: { include: { permissions: { include: { permission: true } } } },
              },
            },
          },
        },
      },
    });
    const now = new Date();
    if (!s || s.revokedAt || s.expiresAt < now || s.user.deletedAt || s.user.status !== 'ACTIVE')
      return null;

    // Throttled lastSeen update (avoid a write per request).
    if (now.getTime() - s.lastSeenAt.getTime() > 60_000) {
      void this.prisma.session
        .update({ where: { id: s.id }, data: { lastSeenAt: now } })
        .catch(() => undefined);
    }

    const ms = s.user.memberships;
    const platform = ms.find((m) => m.org.type === 'PLATFORM');
    const headerOrg = req?.headers['x-org-id'];
    const requestedOrg = typeof headerOrg === 'string' ? headerOrg : s.activeOrgId;
    const active =
      ms.find((m) => m.orgId === requestedOrg && m.org.type !== 'PLATFORM') ??
      ms.find((m) => m.org.type !== 'PLATFORM') ??
      null;
    const perms = (m: (typeof ms)[number] | undefined | null) =>
      new Set(m ? m.role.permissions.map((rp) => rp.permission.key) : []);
    // Suspended orgs can still sign in to view data; the gateway and billing refuse their traffic.
    const activeOk = active;

    return {
      userId: s.user.id,
      email: s.user.email,
      name: s.user.name,
      sessionId: s.id,
      via,
      platformPermissions:
        platform && platform.org.status === 'ACTIVE' ? perms(platform) : new Set(),
      platformRole: platform?.role.key ?? null,
      org: activeOk
        ? {
            id: activeOk.org.id,
            type: activeOk.org.type,
            parentOrgId: activeOk.org.parentOrgId,
            name: activeOk.org.name,
          }
        : null,
      orgRole: activeOk?.role.key ?? null,
      orgPermissions: perms(activeOk),
      memberships: ms.map((m) => ({
        orgId: m.orgId,
        orgName: m.org.name,
        orgType: m.org.type,
        role: m.role.key,
      })),
    };
  }
}
