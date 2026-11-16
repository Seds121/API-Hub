import { Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { emailSchema, moneyStringSchema, PERMISSIONS as P } from '@zeze/shared';
import { Auth, OrgId, ReqMeta, RequestMeta, RequirePermissions } from '../../common/decorators';
import type { AuthContext } from '../../common/auth-context';
import { ApiZodBody, ZBody, uuidParam } from '../../common/http/zod';
import { serialize, paged } from '../../common/http/pagination';
import { AppError, badRequest, notFound } from '../../common/http/app-error';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';

const orgUpdate = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  billingEmail: emailSchema.optional().nullable(),
  country: z.string().length(2).toUpperCase().optional().nullable(),
  taxId: z.string().max(60).optional().nullable(),
  monthlySpendLimit: moneyStringSchema.optional().nullable(),
});
const ORG_ROLES = ['ORG_OWNER', 'ORG_ADMIN', 'ORG_DEVELOPER', 'ORG_BILLING', 'ORG_VIEWER'] as const;
const memberAdd = z.object({
  email: emailSchema,
  roleKey: z.enum(ORG_ROLES).default('ORG_DEVELOPER'),
});
const memberUpdate = z.object({ roleKey: z.enum(ORG_ROLES) });

@ApiTags('organization')
@Controller('api/org')
export class OrgsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @RequirePermissions(P.ORG_READ)
  @Get()
  async get(@OrgId() orgId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      include: {
        parent: { select: { id: true, name: true } },
        agencyAgreement: true,
        _count: {
          select: {
            members: true,
            apiKeys: { where: { revokedAt: null, deletedAt: null } },
            children: { where: { deletedAt: null } },
          },
        },
      },
    });
    return serialize(org);
  }

  @RequirePermissions(P.ORG_MANAGE)
  @Patch()
  @ApiZodBody(orgUpdate)
  async update(
    @OrgId() orgId: string,
    @Auth() a: AuthContext,
    @ZBody(orgUpdate) b: z.infer<typeof orgUpdate>,
    @ReqMeta() m: RequestMeta,
  ) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    // A subaccount's spending cap is controlled by its agency, not by the subaccount itself.
    if (b.monthlySpendLimit !== undefined && org.parentOrgId)
      throw new AppError('FORBIDDEN', 'Your agency manages the spending limit for this account.');
    const up = await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        ...b,
        monthlySpendLimit:
          b.monthlySpendLimit === undefined
            ? undefined
            : b.monthlySpendLimit === null
              ? null
              : new Prisma.Decimal(b.monthlySpendLimit),
      },
    });
    await this.audit.record({
      action: 'org.update',
      actor: a,
      orgId,
      targetType: 'Organization',
      targetId: orgId,
      metadata: { changes: Object.keys(b) },
      meta: m,
    });
    return serialize(up);
  }

  @RequirePermissions(P.ORG_READ)
  @Get('members')
  members(@OrgId() orgId: string) {
    return this.prisma.organizationMember.findMany({
      where: { orgId },
      include: {
        user: {
          select: { id: true, name: true, email: true, lastLoginAt: true, mfaEnabled: true },
        },
        role: { select: { key: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Adds an existing registered user to the organization. */
  @RequirePermissions(P.ORG_MEMBERS_MANAGE)
  @Post('members')
  @ApiZodBody(memberAdd)
  async addMember(
    @OrgId() orgId: string,
    @Auth() a: AuthContext,
    @ZBody(memberAdd) b: z.infer<typeof memberAdd>,
    @ReqMeta() m: RequestMeta,
  ) {
    if (b.roleKey === 'ORG_OWNER' && a.orgRole !== 'ORG_OWNER')
      throw new AppError('FORBIDDEN', 'Only owners can add owners.');
    const user = await this.prisma.user.findFirst({ where: { email: b.email, deletedAt: null } });
    if (!user)
      throw notFound(
        'No registered user with that email. Ask them to create an account first; then add them here.',
      );
    const role = await this.prisma.role.findUniqueOrThrow({ where: { key: b.roleKey } });
    const member = await this.prisma.organizationMember.create({
      data: { orgId, userId: user.id, roleId: role.id },
    });
    await this.audit.record({
      action: 'org.member.add',
      actor: a,
      orgId,
      targetType: 'User',
      targetId: user.id,
      metadata: { role: b.roleKey },
      meta: m,
    });
    return member;
  }

  @RequirePermissions(P.ORG_MEMBERS_MANAGE)
  @Patch('members/:id')
  async updateMember(
    @OrgId() orgId: string,
    @Auth() a: AuthContext,
    @Param('id') id: string,
    @ZBody(memberUpdate) b: z.infer<typeof memberUpdate>,
    @ReqMeta() m: RequestMeta,
  ) {
    const mem = await this.prisma.organizationMember.findFirst({
      where: { id: uuidParam.parse(id), orgId },
      include: { role: true },
    });
    if (!mem) throw notFound('Member');
    if ((mem.role.key === 'ORG_OWNER' || b.roleKey === 'ORG_OWNER') && a.orgRole !== 'ORG_OWNER')
      throw new AppError('FORBIDDEN', 'Only owners can change owner roles.');
    if (mem.role.key === 'ORG_OWNER' && b.roleKey !== 'ORG_OWNER')
      await this.assertAnotherOwner(orgId, mem.id);
    const role = await this.prisma.role.findUniqueOrThrow({ where: { key: b.roleKey } });
    await this.prisma.organizationMember.update({
      where: { id: mem.id },
      data: { roleId: role.id },
    });
    await this.audit.record({
      action: 'org.member.role',
      actor: a,
      orgId,
      targetType: 'User',
      targetId: mem.userId,
      metadata: { from: mem.role.key, to: b.roleKey },
      meta: m,
    });
    return { ok: true };
  }

  @RequirePermissions(P.ORG_MEMBERS_MANAGE)
  @HttpCode(204)
  @Delete('members/:id')
  async removeMember(
    @OrgId() orgId: string,
    @Auth() a: AuthContext,
    @Param('id') id: string,
    @ReqMeta() m: RequestMeta,
  ) {
    const mem = await this.prisma.organizationMember.findFirst({
      where: { id: uuidParam.parse(id), orgId },
      include: { role: true },
    });
    if (!mem) throw notFound('Member');
    if (mem.role.key === 'ORG_OWNER') {
      if (a.orgRole !== 'ORG_OWNER') throw new AppError('FORBIDDEN');
      await this.assertAnotherOwner(orgId, mem.id);
    }
    await this.prisma.organizationMember.delete({ where: { id: mem.id } });
    await this.audit.record({
      action: 'org.member.remove',
      actor: a,
      orgId,
      targetType: 'User',
      targetId: mem.userId,
      meta: m,
    });
  }

  private async assertAnotherOwner(orgId: string, excludingMemberId: string) {
    const owners = await this.prisma.organizationMember.count({
      where: { orgId, role: { key: 'ORG_OWNER' }, id: { not: excludingMemberId } },
    });
    if (!owners) throw badRequest('An organization must keep at least one owner.');
  }

  @RequirePermissions(P.ORG_MANAGE)
  @Get('audit-logs')
  async auditLogs(@OrgId() orgId: string, @Query('page') page = '1') {
    const p = { page: Math.max(1, Number(page) || 1), pageSize: 50 };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { orgId },
        orderBy: { createdAt: 'desc' },
        skip: (p.page - 1) * 50,
        take: 50,
      }),
      this.prisma.auditLog.count({ where: { orgId } }),
    ]);
    return paged(items, total, p);
  }
}
