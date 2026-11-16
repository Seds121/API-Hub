import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { money, moneyStr } from '@zeze/shared';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AppError, badRequest, notFound } from '../../common/http/app-error';
import type { AuthContext } from '../../common/auth-context';
import type { RequestMeta } from '../../common/decorators';
import { createOrganization } from '../orgs/org-factory';
import { WalletService } from '../billing/wallet.service';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { PricingService } from '../pricing/pricing.service';
import { LicenseService } from '../licenses/license.service';
import { UsageService } from '../usage/usage.service';

/** Agency reseller program. Every operation verifies child.parentOrgId === agency (strict tenant isolation). */
@Injectable()
export class AgencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly wallet: WalletService,
    private readonly keys: ApiKeysService,
    private readonly pricing: PricingService,
    private readonly licenses: LicenseService,
    private readonly usage: UsageService,
  ) {}

  async agreement(agencyOrgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: agencyOrgId },
      include: { agencyAgreement: true },
    });
    if (!org || org.type !== 'AGENCY')
      throw new AppError('FORBIDDEN', 'This organization is not an agency account.');
    if (!org.agencyAgreement || org.agencyAgreement.status !== 'ACTIVE')
      throw new AppError(
        'FORBIDDEN',
        'The reseller program is not active for this agency. Contact sales to activate an agency agreement.',
      );
    return org.agencyAgreement;
  }

  async child(agencyOrgId: string, childId: string) {
    const c = await this.prisma.organization.findFirst({
      where: { id: childId, parentOrgId: agencyOrgId, deletedAt: null },
    });
    if (!c) throw notFound('Subaccount');
    return c;
  }

  async list(agencyOrgId: string) {
    await this.agreement(agencyOrgId);
    const children = await this.prisma.organization.findMany({
      where: { parentOrgId: agencyOrgId, deletedAt: null },
      include: {
        wallet: true,
        _count: {
          select: { apiKeys: { where: { revokedAt: null, deletedAt: null } }, members: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return children.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      createdAt: c.createdAt,
      monthlySpendLimit: c.monthlySpendLimit ? moneyStr(c.monthlySpendLimit) : null,
      balance: c.wallet ? moneyStr(c.wallet.balance) : '0',
      activeKeys: c._count.apiKeys,
      members: c._count.members,
    }));
  }

  async create(
    a: AuthContext,
    agencyOrgId: string,
    input: { name: string; monthlySpendLimit?: string | null; ownerEmail?: string | null },
    meta: RequestMeta,
  ) {
    const ag = await this.agreement(agencyOrgId);
    const count = await this.prisma.organization.count({
      where: { parentOrgId: agencyOrgId, deletedAt: null },
    });
    if (count >= ag.maxSubaccounts)
      throw badRequest(`Subaccount limit reached (${ag.maxSubaccounts}).`);
    const child = await this.prisma.$transaction(async (tx) => {
      // The creating agency user administers the subaccount; an optional existing user becomes its owner.
      const org = await createOrganization(tx, {
        name: input.name,
        type: 'CUSTOMER',
        ownerUserId: a.userId,
        ownerRoleKey: 'ORG_ADMIN',
        parentOrgId: agencyOrgId,
        monthlySpendLimit: input.monthlySpendLimit ?? null,
      });
      if (input.ownerEmail) {
        const u = await tx.user.findFirst({ where: { email: input.ownerEmail, deletedAt: null } });
        if (!u) throw notFound('No registered user with that email');
        if (u.id !== a.userId) {
          const owner = await tx.role.findUniqueOrThrow({ where: { key: 'ORG_OWNER' } });
          await tx.organizationMember.create({
            data: { orgId: org.id, userId: u.id, roleId: owner.id },
          });
        }
      }
      await this.audit.record(
        {
          action: 'agency.subaccount.create',
          actor: a,
          orgId: agencyOrgId,
          targetType: 'Organization',
          targetId: org.id,
          metadata: { name: input.name },
          meta,
        },
        tx,
      );
      return org;
    });
    return child;
  }

  async update(
    a: AuthContext,
    agencyOrgId: string,
    childId: string,
    input: { monthlySpendLimit?: string | null; status?: 'ACTIVE' | 'SUSPENDED'; name?: string },
    meta: RequestMeta,
  ) {
    await this.agreement(agencyOrgId);
    await this.child(agencyOrgId, childId);
    const up = await this.prisma.organization.update({
      where: { id: childId },
      data: {
        name: input.name,
        status: input.status,
        monthlySpendLimit:
          input.monthlySpendLimit === undefined
            ? undefined
            : input.monthlySpendLimit === null
              ? null
              : new Prisma.Decimal(input.monthlySpendLimit),
      },
    });
    await this.audit.record({
      action: 'agency.subaccount.update',
      actor: a,
      orgId: agencyOrgId,
      targetType: 'Organization',
      targetId: childId,
      metadata: input,
      meta,
    });
    return up;
  }

  /** Move credit from the agency wallet to a subaccount wallet (two ledger rows, one transaction). */
  async transfer(
    a: AuthContext,
    agencyOrgId: string,
    childId: string,
    amount: string,
    idemKey: string,
    direction: 'to_child' | 'from_child',
    meta: RequestMeta,
  ) {
    await this.agreement(agencyOrgId);
    const child = await this.child(agencyOrgId, childId);
    const amt = money(amount);
    if (amt.lte(0)) throw badRequest('Amount must be positive.');
    const [from, to] = direction === 'to_child' ? [agencyOrgId, childId] : [childId, agencyOrgId];
    await this.prisma.$transaction(async (tx) => {
      await this.wallet.apply(
        {
          orgId: from,
          amount: amt,
          direction: 'debit',
          type: 'TRANSFER_OUT',
          description:
            direction === 'to_child'
              ? `Transfer to subaccount ${child.name}`
              : `Transfer back to agency`,
          idempotencyKey: `xfer:${agencyOrgId}:${idemKey}:out`,
          referenceType: 'Organization',
          referenceId: to,
          actorUserId: a.userId,
          respectCreditLimit: false,
        },
        tx,
      );
      await this.wallet.apply(
        {
          orgId: to,
          amount: amt,
          direction: 'credit',
          type: 'TRANSFER_IN',
          description:
            direction === 'to_child'
              ? `Transfer from agency`
              : `Transfer from subaccount ${child.name}`,
          idempotencyKey: `xfer:${agencyOrgId}:${idemKey}:in`,
          referenceType: 'Organization',
          referenceId: from,
          actorUserId: a.userId,
        },
        tx,
      );
      await this.audit.record(
        {
          action: 'agency.transfer',
          actor: a,
          orgId: agencyOrgId,
          targetType: 'Organization',
          targetId: childId,
          metadata: { amount: amt.toFixed(6), direction },
          meta,
        },
        tx,
      );
    });
    return { ok: true };
  }

  async listKeys(agencyOrgId: string, childId: string) {
    await this.agreement(agencyOrgId);
    await this.child(agencyOrgId, childId);
    return this.keys.list(childId);
  }

  async createKey(
    a: AuthContext,
    agencyOrgId: string,
    childId: string,
    input: Parameters<ApiKeysService['create']>[2],
    meta: RequestMeta,
  ) {
    await this.agreement(agencyOrgId);
    await this.child(agencyOrgId, childId);
    return this.keys.create(childId, a.userId, input, meta);
  }

  async revokeKey(
    a: AuthContext,
    agencyOrgId: string,
    childId: string,
    keyId: string,
    meta: RequestMeta,
  ) {
    await this.agreement(agencyOrgId);
    await this.child(agencyOrgId, childId);
    return this.keys.revoke(childId, keyId, a.userId, meta);
  }

  /**
   * Agency-set resale price for a subaccount. Requires: custom pricing allowed by agreement, upstream
   * license permitting sub-resale for every provider of the product, and price ≥ the agency's own cost.
   */
  async setPrice(
    a: AuthContext,
    agencyOrgId: string,
    childId: string,
    input: { productId: string; pricePerRequest: string },
    meta: RequestMeta,
  ) {
    const ag = await this.agreement(agencyOrgId);
    if (!ag.allowCustomPricing)
      throw new AppError(
        'FORBIDDEN',
        'Custom resale pricing is not enabled in your agency agreement.',
      );
    await this.child(agencyOrgId, childId);
    const product = await this.prisma.apiProduct.findFirst({
      where: { id: input.productId, status: 'PUBLISHED', deletedAt: null },
      include: {
        endpoints: {
          where: { isActive: true },
          include: { integrations: { where: { isActive: true } } },
        },
      },
    });
    if (!product) throw notFound('API');
    const providerIds = new Set(
      product.endpoints.flatMap((e) => e.integrations.map((i) => i.providerId)),
    );
    for (const pid of providerIds) {
      if (!(await this.licenses.verdict(pid, product.id)).subResaleAllowed)
        throw new AppError(
          'LICENSE_REQUIRED',
          'The upstream license for this API does not permit agency resale.',
        );
    }
    for (const e of product.endpoints) {
      const q = await this.pricing.quote({
        orgId: agencyOrgId,
        orgType: 'AGENCY',
        productId: product.id,
        endpointId: e.id,
      });
      if (q && money(input.pricePerRequest).lt(q.unitPrice))
        throw badRequest(
          `Price must be at least your wholesale cost (${q.unitPrice.toFixed(6)}) for ${e.method} ${e.path}.`,
        );
    }
    const rule = await this.prisma.$transaction(async (tx) => {
      await tx.pricingRule.updateMany({
        where: {
          scope: 'ORGANIZATION',
          orgId: childId,
          productId: product.id,
          endpointId: null,
          isActive: true,
        },
        data: { isActive: false, validTo: new Date() },
      });
      return tx.pricingRule.create({
        data: {
          scope: 'ORGANIZATION',
          orgId: childId,
          productId: product.id,
          pricePerRequest: new Prisma.Decimal(money(input.pricePerRequest).toFixed(6)),
          createdByOrgId: agencyOrgId,
        },
      });
    });
    await this.audit.record({
      action: 'agency.pricing.set',
      actor: a,
      orgId: agencyOrgId,
      targetType: 'PricingRule',
      targetId: rule.id,
      metadata: { childId, productId: product.id, price: input.pricePerRequest },
      meta,
    });
    return rule;
  }

  async report(agencyOrgId: string, days: number) {
    const ag = await this.agreement(agencyOrgId);
    const children = await this.prisma.organization.findMany({
      where: { parentOrgId: agencyOrgId, deletedAt: null },
      select: { id: true, name: true },
    });
    const from = new Date(Date.now() - days * 86400_000);
    const to = new Date();
    const rows = children.length
      ? await this.prisma.apiUsageRecord.groupBy({
          by: ['orgId'],
          where: { orgId: { in: children.map((c) => c.id) }, createdAt: { gte: from, lte: to } },
          _count: { _all: true },
          _sum: { price: true },
        })
      : [];
    const perChild = children.map((c) => {
      const r = rows.find((x) => x.orgId === c.id);
      return {
        orgId: c.id,
        name: c.name,
        requests: r?._count._all ?? 0,
        spend: money(r?._sum.price ?? 0).toFixed(6),
      };
    });
    const totalSpend = perChild.reduce((s, c) => s.plus(c.spend), money(0));
    const series = children.length
      ? await this.usage.series({ orgIds: children.map((c) => c.id), from, to }, 'day')
      : [];
    return {
      range: { from, to },
      subaccounts: perChild,
      totalSpend: totalSpend.toFixed(6),
      revenueSharePercent: moneyStr(ag.revenueSharePercent),
      revenueShareAccrued: totalSpend.mul(money(ag.revenueSharePercent)).div(100).toFixed(6),
      series,
    };
  }
}
