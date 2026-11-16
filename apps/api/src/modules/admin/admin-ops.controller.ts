import { Controller, Get, Headers, HttpCode, Param, Patch, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import {
  money,
  moneyStr,
  moneyStringSchema,
  PERMISSIONS as P,
  positiveMoneySchema,
} from '@zeze/shared';
import { Auth, ReqMeta, RequestMeta, RequirePermissions } from '../../common/decorators';
import type { AuthContext } from '../../common/auth-context';
import { ApiZodBody, ZBody, ZQuery, uuidParam } from '../../common/http/zod';
import { paged, pageQuery, serialize } from '../../common/http/pagination';
import { badRequest, notFound } from '../../common/http/app-error';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { RedisService } from '../../common/redis.service';
import { WalletService } from '../billing/wallet.service';
import { InvoiceService } from '../billing/invoice.service';
import { SubscriptionService } from '../billing/subscription.service';
import { PaymentsService } from '../payments/payments.service';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { UsageService } from '../usage/usage.service';
import { usageQuery, range } from '../usage/usage.controller';

const id = (v: string) => uuidParam.parse(v);
const orgQuery = pageQuery.extend({
  type: z.enum(['CUSTOMER', 'AGENCY', 'PLATFORM']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  parentOrgId: z.string().uuid().optional(),
});
const orgPatch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  monthlySpendLimit: moneyStringSchema.optional().nullable(),
  type: z.enum(['CUSTOMER', 'AGENCY']).optional(),
});
const agreementSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']).default('ACTIVE'),
  wholesaleDiscountPercent: moneyStringSchema.refine(
    (v) => Number(v) >= 0 && Number(v) <= 90,
    '0-90',
  ),
  revenueSharePercent: moneyStringSchema.refine((v) => Number(v) >= 0 && Number(v) <= 90, '0-90'),
  maxSubaccounts: z.coerce.number().int().min(1).max(10000).default(25),
  allowCustomPricing: z.boolean().default(true),
  notes: z.string().max(2000).optional().nullable(),
});
const adjustSchema = z.object({
  direction: z.enum(['credit', 'debit']),
  amount: positiveMoneySchema,
  reason: z.string().trim().min(5).max(500),
});
const walletPatch = z.object({
  creditLimit: moneyStringSchema.refine((v) => Number(v) >= 0, '≥ 0').optional(),
  lowBalanceThreshold: moneyStringSchema.refine((v) => Number(v) >= 0, '≥ 0').optional(),
});
const refundSchema = z.object({
  amount: positiveMoneySchema,
  reason: z.string().trim().min(5).max(500),
});
const verifySchema = z.object({ bankReference: z.string().max(120).optional() });
const subAssign = z.object({ planId: z.string().uuid() });

@ApiTags('admin: operations')
@Controller('api/admin')
export class AdminOpsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
    private readonly wallet: WalletService,
    private readonly invoices: InvoiceService,
    private readonly subs: SubscriptionService,
    private readonly payments: PaymentsService,
    private readonly keys: ApiKeysService,
    private readonly usage: UsageService,
  ) {}

  // ── Organizations / customers / agencies ──
  @RequirePermissions(P.PLATFORM_CUSTOMERS_READ)
  @Get('organizations')
  async orgs(@ZQuery(orgQuery) q: z.infer<typeof orgQuery>) {
    const where: Prisma.OrganizationWhereInput = {
      deletedAt: null,
      type: q.type ?? { not: 'PLATFORM' },
      ...(q.status ? { status: q.status } : {}),
      ...(q.parentOrgId ? { parentOrgId: q.parentOrgId } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { billingEmail: { contains: q.q, mode: 'insensitive' } },
              { slug: { contains: q.q } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          wallet: { select: { balance: true, reserved: true, creditLimit: true } },
          parent: { select: { id: true, name: true } },
          agencyAgreement: { select: { status: true } },
          subscriptions: {
            where: { status: 'ACTIVE' },
            include: { plan: { select: { name: true } } },
            take: 1,
          },
          _count: {
            select: {
              members: true,
              apiKeys: { where: { revokedAt: null, deletedAt: null } },
              children: true,
            },
          },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);
    return serialize(paged(items, total, q));
  }

  @RequirePermissions(P.PLATFORM_CUSTOMERS_READ)
  @Get('organizations/:id')
  async org(@Param('id') oid: string) {
    const o = await this.prisma.organization.findFirst({
      where: { id: id(oid), deletedAt: null },
      include: {
        wallet: true,
        parent: { select: { id: true, name: true } },
        children: {
          where: { deletedAt: null },
          select: { id: true, name: true, status: true, createdAt: true },
        },
        agencyAgreement: true,
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                status: true,
                lastLoginAt: true,
                mfaEnabled: true,
              },
            },
            role: { select: { key: true, name: true } },
          },
        },
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 10, include: { plan: true } },
        pricingRules: {
          where: { isActive: true },
          include: {
            product: { select: { name: true } },
            endpoint: { select: { name: true, path: true } },
          },
        },
      },
    });
    if (!o) throw notFound('Organization');
    const usage = await this.usage.summary({
      orgIds: [o.id],
      from: new Date(Date.now() - 30 * 86400_000),
      to: new Date(),
    });
    return serialize({ ...o, usage30d: usage.totals });
  }

  @RequirePermissions(P.PLATFORM_CUSTOMERS_WRITE)
  @Patch('organizations/:id')
  @ApiZodBody(orgPatch)
  async patchOrg(
    @Param('id') oid: string,
    @ZBody(orgPatch) b: z.infer<typeof orgPatch>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    const o = await this.prisma.organization.findFirst({ where: { id: id(oid), deletedAt: null } });
    if (!o || o.type === 'PLATFORM') throw notFound('Organization');
    const up = await this.prisma.organization.update({
      where: { id: o.id },
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
      action: 'admin.org.update',
      actor: a,
      orgId: o.id,
      targetType: 'Organization',
      targetId: o.id,
      metadata: b,
      meta: m,
    });
    return serialize(up);
  }

  @RequirePermissions(P.PLATFORM_CUSTOMERS_WRITE)
  @Post('organizations/:id/agency-agreement')
  @ApiZodBody(agreementSchema)
  async agreement(
    @Param('id') oid: string,
    @ZBody(agreementSchema) b: z.infer<typeof agreementSchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    const o = await this.prisma.organization.findFirst({ where: { id: id(oid), deletedAt: null } });
    if (!o || o.type === 'PLATFORM') throw notFound('Organization');
    if (o.parentOrgId) throw badRequest('Subaccounts cannot become agencies.');
    const data = {
      status: b.status,
      wholesaleDiscountPercent: new Prisma.Decimal(b.wholesaleDiscountPercent),
      revenueSharePercent: new Prisma.Decimal(b.revenueSharePercent),
      maxSubaccounts: b.maxSubaccounts,
      allowCustomPricing: b.allowCustomPricing,
      notes: b.notes,
    };
    const ag = await this.prisma.$transaction(async (tx) => {
      if (o.type !== 'AGENCY')
        await tx.organization.update({ where: { id: o.id }, data: { type: 'AGENCY' } });
      return tx.agencyAgreement.upsert({
        where: { agencyOrgId: o.id },
        create: { agencyOrgId: o.id, ...data },
        update: data,
      });
    });
    await this.audit.record({
      action: 'admin.agency.agreement',
      actor: a,
      orgId: o.id,
      targetType: 'AgencyAgreement',
      targetId: ag.id,
      metadata: b,
      meta: m,
    });
    return serialize(ag);
  }

  /** Pays accrued revenue share for a month to the agency wallet (idempotent per agency+month). */
  @RequirePermissions(P.PLATFORM_WALLET_ADJUST)
  @HttpCode(200)
  @Post('organizations/:id/revenue-share/settle')
  async settleRevenueShare(
    @Param('id') oid: string,
    @ZBody(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })) b: { month: string },
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    const ag = await this.prisma.agencyAgreement.findUnique({ where: { agencyOrgId: id(oid) } });
    if (!ag) throw notFound('Agency agreement');
    const [y, mo] = b.month.split('-').map(Number) as [number, number];
    const from = new Date(Date.UTC(y, mo - 1, 1));
    const to = new Date(Date.UTC(y, mo, 1));
    if (to > new Date()) throw badRequest('Only completed months can be settled.');
    const children = await this.prisma.organization.findMany({
      where: { parentOrgId: ag.agencyOrgId },
      select: { id: true },
    });
    const agg = await this.prisma.apiUsageRecord.aggregate({
      where: { orgId: { in: children.map((c) => c.id) }, createdAt: { gte: from, lt: to } },
      _sum: { price: true },
    });
    const share = money(agg._sum.price ?? 0)
      .mul(money(ag.revenueSharePercent))
      .div(100)
      .toDecimalPlaces(6);
    if (share.lte(0)) return { settled: '0.000000', month: b.month };
    const r = await this.prisma.$transaction(async (tx) => {
      const e = await this.wallet.apply(
        {
          orgId: ag.agencyOrgId,
          amount: share,
          direction: 'credit',
          type: 'ADMIN_CREDIT',
          description: `Revenue share ${b.month} (${moneyStr(ag.revenueSharePercent)}%)`,
          idempotencyKey: `revshare:${ag.agencyOrgId}:${b.month}`,
          referenceType: 'AgencyAgreement',
          referenceId: ag.id,
          actorUserId: a.userId,
        },
        tx,
      );
      await this.audit.record(
        {
          action: 'admin.agency.revenue_share',
          actor: a,
          orgId: ag.agencyOrgId,
          targetType: 'AgencyAgreement',
          targetId: ag.id,
          metadata: { month: b.month, amount: share.toFixed(6) },
          meta: m,
        },
        tx,
      );
      return e;
    });
    return { settled: share.toFixed(6), month: b.month, replayed: r.replayed };
  }

  @RequirePermissions(P.PLATFORM_BILLING_WRITE)
  @Post('organizations/:id/subscription')
  @ApiZodBody(subAssign)
  async assignPlan(
    @Param('id') oid: string,
    @ZBody(subAssign) b: z.infer<typeof subAssign>,
    @Auth() a: AuthContext,
    @Headers('idempotency-key') idem?: string,
  ) {
    if (!idem) throw badRequest('Idempotency-Key header required.');
    return serialize(
      await this.subs.subscribeFromWallet(id(oid), b.planId, a.userId, `admin:${id(oid)}:${idem}`),
    );
  }

  // ── Users ──
  @RequirePermissions(P.PLATFORM_CUSTOMERS_READ)
  @Get('users')
  async users(@ZQuery(pageQuery) q: z.infer<typeof pageQuery>) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(q.q
        ? {
            OR: [
              { email: { contains: q.q, mode: 'insensitive' } },
              { name: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          mfaEnabled: true,
          lastLoginAt: true,
          createdAt: true,
          memberships: {
            select: {
              org: { select: { id: true, name: true, type: true } },
              role: { select: { key: true } },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paged(items, total, q);
  }

  @RequirePermissions(P.PLATFORM_CUSTOMERS_WRITE)
  @Patch('users/:id')
  async patchUser(
    @Param('id') uid: string,
    @ZBody(z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }))
    b: { status: 'ACTIVE' | 'SUSPENDED' },
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    if (id(uid) === a.userId) throw badRequest('You cannot change your own status.');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: id(uid) }, data: { status: b.status } }),
      ...(b.status === 'SUSPENDED'
        ? [
            this.prisma.session.updateMany({
              where: { userId: id(uid), revokedAt: null },
              data: { revokedAt: new Date() },
            }),
          ]
        : []),
    ]);
    await this.audit.record({
      action: 'admin.user.status',
      actor: a,
      targetType: 'User',
      targetId: id(uid),
      metadata: b,
      meta: m,
    });
    return { ok: true };
  }

  // ── API keys (cross-tenant view, never secrets) ──
  @RequirePermissions(P.PLATFORM_CUSTOMERS_READ)
  @Get('api-keys')
  async apiKeys(
    @ZQuery(
      pageQuery.extend({
        orgId: z.string().uuid().optional(),
        state: z.enum(['active', 'revoked']).optional(),
      }),
    )
    q: z.infer<typeof pageQuery> & { orgId?: string; state?: string },
  ) {
    const where: Prisma.CustomerApiKeyWhereInput = {
      deletedAt: null,
      ...(q.orgId ? { orgId: q.orgId } : {}),
      ...(q.state === 'active'
        ? { revokedAt: null }
        : q.state === 'revoked'
          ? { revokedAt: { not: null } }
          : {}),
      ...(q.q
        ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { prefix: { contains: q.q } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.customerApiKey.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          prefix: true,
          last4: true,
          environment: true,
          scopes: true,
          rateLimitPerMinute: true,
          expiresAt: true,
          lastUsedAt: true,
          revokedAt: true,
          createdAt: true,
          org: { select: { id: true, name: true } },
        },
      }),
      this.prisma.customerApiKey.count({ where }),
    ]);
    return paged(items, total, q);
  }

  @RequirePermissions(P.PLATFORM_CUSTOMERS_WRITE)
  @HttpCode(204)
  @Post('api-keys/:id/revoke')
  async revokeKey(@Param('id') kid: string, @Auth() a: AuthContext, @ReqMeta() m: RequestMeta) {
    const k = await this.prisma.customerApiKey.findUnique({ where: { id: id(kid) } });
    if (!k) throw notFound('API key');
    await this.keys.revoke(k.orgId, k.id, a.userId, m);
  }

  // ── Wallets & ledger ──
  @RequirePermissions(P.PLATFORM_BILLING_READ)
  @Get('wallets')
  async wallets(@ZQuery(pageQuery) q: z.infer<typeof pageQuery>) {
    const where: Prisma.WalletWhereInput = {
      org: {
        deletedAt: null,
        type: { not: 'PLATFORM' },
        ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
      },
    };
    const [items, total] = await Promise.all([
      this.prisma.wallet.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { balance: 'desc' },
        include: { org: { select: { id: true, name: true, type: true, status: true } } },
      }),
      this.prisma.wallet.count({ where }),
    ]);
    return serialize(paged(items, total, q));
  }

  @RequirePermissions(P.PLATFORM_WALLET_ADJUST)
  @HttpCode(200)
  @Post('wallets/:orgId/adjust')
  @ApiZodBody(adjustSchema)
  async adjust(
    @Param('orgId') oid: string,
    @ZBody(adjustSchema) b: z.infer<typeof adjustSchema>,
    @Auth() a: AuthContext,
    @Headers('idempotency-key') idem: string | undefined,
    @ReqMeta() m: RequestMeta,
  ) {
    if (!idem || !/^[A-Za-z0-9_-]{8,100}$/.test(idem))
      throw badRequest('A valid Idempotency-Key header is required.');
    const entry = await this.prisma.$transaction(async (tx) => {
      const e = await this.wallet.apply(
        {
          orgId: id(oid),
          amount: b.amount,
          direction: b.direction,
          type: b.direction === 'credit' ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT',
          description: `Admin adjustment: ${b.reason}`,
          idempotencyKey: `admin-adjust:${idem}`,
          actorUserId: a.userId,
          metadata: { reason: b.reason },
        },
        tx,
      );
      if (!e.replayed)
        await this.audit.record(
          {
            action: `admin.wallet.${b.direction}`,
            actor: a,
            orgId: id(oid),
            targetType: 'WalletTransaction',
            targetId: e.id,
            metadata: { amount: b.amount, reason: b.reason },
            meta: m,
          },
          tx,
        );
      return e;
    });
    return serialize(entry);
  }

  @RequirePermissions(P.PLATFORM_WALLET_ADJUST)
  @Patch('wallets/:orgId')
  @ApiZodBody(walletPatch)
  async walletSettings(
    @Param('orgId') oid: string,
    @ZBody(walletPatch) b: z.infer<typeof walletPatch>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    const w = await this.prisma.wallet.update({
      where: { orgId: id(oid) },
      data: {
        creditLimit: b.creditLimit ? new Prisma.Decimal(b.creditLimit) : undefined,
        lowBalanceThreshold: b.lowBalanceThreshold
          ? new Prisma.Decimal(b.lowBalanceThreshold)
          : undefined,
      },
    });
    await this.audit.record({
      action: 'admin.wallet.settings',
      actor: a,
      orgId: id(oid),
      targetType: 'Wallet',
      targetId: w.id,
      metadata: b,
      meta: m,
    });
    return serialize(w);
  }

  @RequirePermissions(P.PLATFORM_BILLING_READ)
  @Get('transactions')
  async transactions(
    @ZQuery(pageQuery.extend({ orgId: z.string().uuid().optional(), type: z.string().optional() }))
    q: z.infer<typeof pageQuery> & { orgId?: string; type?: string },
  ) {
    const where: Prisma.WalletTransactionWhereInput = {
      ...(q.orgId ? { wallet: { orgId: q.orgId } } : {}),
      ...(q.type ? { type: q.type as never } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'desc' },
        include: { wallet: { select: { org: { select: { id: true, name: true } } } } },
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);
    return serialize(paged(items, total, q));
  }

  // ── Payments & invoices ──
  @RequirePermissions(P.PLATFORM_BILLING_READ)
  @Get('payments')
  async paymentsList(
    @ZQuery(pageQuery.extend({ status: z.string().optional(), provider: z.string().optional() }))
    q: z.infer<typeof pageQuery> & { status?: string; provider?: string },
  ) {
    const where: Prisma.PaymentWhereInput = {
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.provider ? { provider: q.provider as never } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'desc' },
        include: { org: { select: { id: true, name: true } } },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return serialize(
      paged(
        items.map((p) => ({ ...this.payments.present(p), org: p.org })),
        total,
        q,
      ),
    );
  }

  @RequirePermissions(P.PLATFORM_BILLING_WRITE)
  @HttpCode(204)
  @Post('payments/:id/verify')
  async verify(
    @Param('id') pid: string,
    @ZBody(verifySchema) b: z.infer<typeof verifySchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    await this.payments.adminVerifyManual(id(pid), a.userId, b.bankReference, m);
  }

  @RequirePermissions(P.PLATFORM_BILLING_WRITE)
  @HttpCode(204)
  @Post('payments/:id/refund')
  @ApiZodBody(refundSchema)
  async refund(
    @Param('id') pid: string,
    @ZBody(refundSchema) b: z.infer<typeof refundSchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    await this.payments.adminRefund(id(pid), b.amount, b.reason, a.userId, m);
  }

  @RequirePermissions(P.PLATFORM_BILLING_READ)
  @Get('invoices')
  async invoicesList(
    @ZQuery(pageQuery.extend({ orgId: z.string().uuid().optional() }))
    q: z.infer<typeof pageQuery> & { orgId?: string },
  ) {
    const where: Prisma.InvoiceWhereInput = q.orgId ? { orgId: q.orgId } : {};
    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { issuedAt: 'desc' },
        include: { org: { select: { id: true, name: true } } },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return serialize(paged(items, total, q));
  }

  @RequirePermissions(P.PLATFORM_BILLING_READ)
  @Get('invoices/:id/pdf')
  async invoicePdf(@Param('id') iid: string, @Res() res: Response) {
    const { filename, buffer } = await this.invoices.pdf(null, id(iid));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @RequirePermissions(P.PLATFORM_BILLING_READ)
  @Get('webhook-events')
  webhookEvents() {
    return this.prisma.webhookEvent.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        provider: true,
        eventId: true,
        type: true,
        status: true,
        error: true,
        receivedAt: true,
        processedAt: true,
      },
    });
  }

  // ── Usage (cross-tenant) ──
  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('usage')
  async usageRecords(
    @ZQuery(usageQuery.extend({ orgId: z.string().uuid().optional() }))
    q: z.infer<typeof usageQuery> & { orgId?: string },
  ) {
    const r = range(q);
    const where: Prisma.ApiUsageRecordWhereInput = {
      createdAt: { gte: r.from, lte: r.to },
      ...(q.orgId ? { orgId: q.orgId } : {}),
      ...(q.productId ? { productId: q.productId } : {}),
      ...(q.status === 'success'
        ? { statusCode: { lt: 400 } }
        : q.status === 'error'
          ? { statusCode: { gte: 400 } }
          : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.apiUsageRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          org: { select: { id: true, name: true } },
          product: { select: { name: true } },
          supplierUsage: { select: { cost: true, costIsEstimated: true } },
        },
      }),
      this.prisma.apiUsageRecord.count({ where }),
    ]);
    return serialize(paged(items, total, q));
  }

  @RequirePermissions(P.PLATFORM_SETTINGS_WRITE)
  @HttpCode(204)
  @Post('cache/flush-gateway')
  async flushGatewayCache(@Auth() a: AuthContext) {
    // SCAN (not KEYS) to avoid blocking Redis.
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.client.scan(cursor, 'MATCH', 'gw:*', 'COUNT', 500);
      cursor = next;
      if (batch.length) await this.redis.client.del(...batch);
    } while (cursor !== '0');
    await this.audit.record({ action: 'admin.cache.flush', actor: a });
  }
}
