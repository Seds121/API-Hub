import { Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { moneyStringSchema, PERMISSIONS as P } from '@zeze/shared';
import { Auth, Public, ReqMeta, RequestMeta, RequirePermissions } from '../../common/decorators';
import type { AuthContext } from '../../common/auth-context';
import { ApiZodBody, ZBody, ZQuery, uuidParam } from '../../common/http/zod';
import { paged, pageQuery, serialize } from '../../common/http/pagination';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { badRequest } from '../../common/http/app-error';
import { SETTINGS_SCHEMA } from './settings';

const id = (v: string) => uuidParam.parse(v);
const rangeQ = z.object({
  days: z.coerce.number().int().min(1).max(366).default(30),
  granularity: z.enum(['minute', 'hour', 'day']).default('day'),
});
const auditQ = pageQuery.extend({
  action: z.string().max(80).optional(),
  orgId: z.string().uuid().optional(),
  actorUserId: z.string().uuid().optional(),
  targetId: z.string().max(80).optional(),
});
const alertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  metric: z.enum([
    'PROVIDER_DOWN',
    'ERROR_RATE',
    'LATENCY_MS',
    'LOW_BALANCE',
    'PROVIDER_SUBSCRIPTION_EXPIRY',
    'LICENSE_EXPIRY',
  ]),
  threshold: moneyStringSchema,
  windowMinutes: z.coerce.number().int().min(1).max(10080).default(15),
  providerId: z.string().uuid().optional().nullable(),
  channel: z.enum(['LOG', 'EMAIL', 'WEBHOOK']).default('LOG'),
  target: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

@ApiTags('admin: analytics & system')
@Controller('api/admin')
export class AdminSystemController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
  ) {}

  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('analytics/overview')
  overview() {
    return this.analytics.overview();
  }

  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('analytics/timeseries')
  async timeseries(@ZQuery(rangeQ) q: z.infer<typeof rangeQ>) {
    const days =
      q.granularity === 'minute'
        ? Math.min(q.days, 1)
        : q.granularity === 'hour'
          ? Math.min(q.days, 14)
          : q.days;
    const to = new Date();
    const from =
      q.granularity === 'minute'
        ? new Date(Date.now() - 3600_000)
        : new Date(Date.now() - days * 86400_000);
    return serialize(await this.analytics.timeseries(from, to, q.granularity));
  }

  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('analytics/breakdown')
  async breakdown(@ZQuery(rangeQ) q: z.infer<typeof rangeQ>) {
    const to = new Date();
    const from = new Date(Date.now() - q.days * 86400_000);
    const [topCustomers, topEndpoints, popularity, providers] = await Promise.all([
      this.analytics.topCustomers(from, to),
      this.analytics.topEndpoints(from, to),
      this.analytics.apiPopularity(from, to),
      this.analytics.providerAvailability(from, to),
    ]);
    return serialize({ topCustomers, topEndpoints, popularity, providers });
  }

  @RequirePermissions(P.PLATFORM_BILLING_READ)
  @Get('analytics/supplier-costs')
  async supplierCosts(@ZQuery(rangeQ) q: z.infer<typeof rangeQ>) {
    const to = new Date();
    const from = new Date(Date.now() - q.days * 86400_000);
    const [byProvider, totals, subscriptions] = await Promise.all([
      this.analytics.supplierCostsByProvider(from, to),
      this.analytics.supplierCosts(from, to),
      this.prisma.providerSubscription.findMany({
        where: { status: 'ACTIVE' },
        include: { provider: { select: { name: true } } },
        orderBy: { expiresAt: 'asc' },
      }),
    ]);
    return serialize({ byProvider, totals, subscriptions });
  }

  @RequirePermissions(P.PLATFORM_BILLING_READ)
  @Get('analytics/revenue')
  async revenue(@ZQuery(rangeQ) q: z.infer<typeof rangeQ>) {
    const to = new Date();
    const from = new Date(Date.now() - q.days * 86400_000);
    const [byProduct, revenue, costs, series] = await Promise.all([
      this.analytics.revenueByProduct(from, to),
      this.analytics.revenue(from, to),
      this.analytics.supplierCosts(from, to),
      this.analytics.timeseries(from, to, 'day'),
    ]);
    return serialize({ byProduct, revenue, costs, series });
  }

  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('health-checks')
  healthChecks() {
    return this.prisma.providerHealthCheck.findMany({
      orderBy: { checkedAt: 'desc' },
      take: 200,
      include: { provider: { select: { name: true } } },
    });
  }

  // ── Audit ──
  @RequirePermissions(P.PLATFORM_AUDIT_READ)
  @Get('audit-logs')
  async auditLogs(@ZQuery(auditQ) q: z.infer<typeof auditQ>) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.orgId ? { orgId: q.orgId } : {}),
      ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}),
      ...(q.targetId ? { targetId: q.targetId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { org: { select: { name: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const actorIds = [...new Set(items.map((i) => i.actorUserId).filter(Boolean))] as string[];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, email: true, name: true },
    });
    return paged(
      items.map((i) => ({ ...i, actor: actors.find((a) => a.id === i.actorUserId) ?? null })),
      total,
      q,
    );
  }

  // ── Settings ──
  @Public()
  @Get('public-settings')
  async publicSettings() {
    const s = await this.loadSettings();
    return { maintenanceBanner: s.maintenanceBanner, signupsEnabled: s.signupsEnabled };
  }

  private async loadSettings() {
    const rows = await this.prisma.systemSetting.findMany();
    return SETTINGS_SCHEMA.parse(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  }

  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('settings')
  settings() {
    return this.loadSettings();
  }

  @RequirePermissions(P.PLATFORM_SETTINGS_WRITE)
  @Put('settings')
  @ApiZodBody(SETTINGS_SCHEMA.partial())
  async saveSettings(
    @ZBody(SETTINGS_SCHEMA.partial().strict()) b: Partial<z.infer<typeof SETTINGS_SCHEMA>>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    await this.prisma.$transaction(
      Object.entries(b).map(([key, value]) =>
        this.prisma.systemSetting.upsert({
          where: { key },
          create: { key, value: value as Prisma.InputJsonValue, updatedById: a.userId },
          update: { value: value as Prisma.InputJsonValue, updatedById: a.userId },
        }),
      ),
    );
    await this.audit.record({ action: 'admin.settings.update', actor: a, metadata: b, meta: m });
    return this.loadSettings();
  }

  // ── Alerts ──
  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('alerts')
  async alerts() {
    return serialize(
      await this.prisma.alertRule.findMany({
        orderBy: { createdAt: 'desc' },
        include: { events: { orderBy: { createdAt: 'desc' }, take: 5 } },
      }),
    );
  }

  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('alert-events')
  async alertEvents(@ZQuery(pageQuery) q: z.infer<typeof pageQuery>) {
    const [items, total] = await Promise.all([
      this.prisma.alertEvent.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { rule: { select: { name: true, metric: true } } },
      }),
      this.prisma.alertEvent.count(),
    ]);
    return paged(items, total, q);
  }

  @RequirePermissions(P.PLATFORM_SETTINGS_WRITE)
  @Post('alerts')
  @ApiZodBody(alertSchema)
  async createAlert(
    @ZBody(alertSchema) b: z.infer<typeof alertSchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    if (b.channel === 'WEBHOOK' && (!b.target || !b.target.startsWith('https://')))
      throw badRequest('Webhook alerts need an https:// target URL');
    const r = await this.prisma.alertRule.create({
      data: { ...b, threshold: new Prisma.Decimal(b.threshold) },
    });
    await this.audit.record({
      action: 'admin.alert.create',
      actor: a,
      targetType: 'AlertRule',
      targetId: r.id,
      metadata: { name: r.name, metric: r.metric },
      meta: m,
    });
    return serialize(r);
  }

  @RequirePermissions(P.PLATFORM_SETTINGS_WRITE)
  @Patch('alerts/:id')
  async updateAlert(
    @Param('id') aid: string,
    @ZBody(alertSchema.partial()) b: Partial<z.infer<typeof alertSchema>>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    const r = await this.prisma.alertRule.update({
      where: { id: id(aid) },
      data: { ...b, threshold: b.threshold ? new Prisma.Decimal(b.threshold) : undefined },
    });
    await this.audit.record({
      action: 'admin.alert.update',
      actor: a,
      targetType: 'AlertRule',
      targetId: r.id,
      meta: m,
    });
    return serialize(r);
  }

  @RequirePermissions(P.PLATFORM_SETTINGS_WRITE)
  @HttpCode(204)
  @Delete('alerts/:id')
  async deleteAlert(@Param('id') aid: string, @Auth() a: AuthContext, @ReqMeta() m: RequestMeta) {
    await this.prisma.alertRule.delete({ where: { id: id(aid) } });
    await this.audit.record({
      action: 'admin.alert.delete',
      actor: a,
      targetType: 'AlertRule',
      targetId: id(aid),
      meta: m,
    });
  }

  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @HttpCode(204)
  @Post('alert-events/:id/resolve')
  async resolve(@Param('id') eid: string) {
    await this.prisma.alertEvent.update({
      where: { id: id(eid) },
      data: { resolvedAt: new Date() },
    });
  }
}
