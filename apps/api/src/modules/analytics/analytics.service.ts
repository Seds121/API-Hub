import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { money } from '@zeze/shared';
import { PrismaService } from '../../common/prisma.service';

const n = (v: unknown) => Number(v ?? 0);

/**
 * Platform analytics. Supplier cost is split into ACTUAL (contractual/known) vs ESTIMATED, and records with
 * no cost data are counted separately — never guessed. Margin is reported on known costs only.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [
      customers,
      activeCustomers,
      providers,
      activeApis,
      reqToday,
      reqMonth,
      failedMonth,
      revenue,
      costs,
      providerStatus,
      topups,
    ] = await Promise.all([
      this.prisma.organization.count({
        where: { type: { in: ['CUSTOMER', 'AGENCY'] }, deletedAt: null },
      }),
      this.prisma.organization.count({
        where: {
          type: { in: ['CUSTOMER', 'AGENCY'] },
          deletedAt: null,
          usageRecords: { some: { createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } } },
        },
      }),
      this.prisma.apiProvider.count({ where: { deletedAt: null } }),
      this.prisma.apiProduct.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
      this.prisma.apiUsageRecord.count({ where: { createdAt: { gte: dayStart } } }),
      this.prisma.apiUsageRecord.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.apiUsageRecord.count({
        where: { createdAt: { gte: monthStart }, statusCode: { gte: 400 } },
      }),
      this.revenue(monthStart, now),
      this.supplierCosts(monthStart, now),
      this.prisma.apiProvider.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] },
          createdAt: { gte: monthStart },
        },
        _sum: { amount: true },
      }),
    ]);
    const knownCost = money(costs.actual).plus(costs.estimated);
    return {
      totalCustomers: customers,
      activeCustomers,
      totalProviders: providers,
      activeApis,
      requestsToday: reqToday,
      requestsThisMonth: reqMonth,
      failedRequestsThisMonth: failedMonth,
      revenueThisMonth: revenue.total,
      revenueBreakdown: revenue,
      paymentsCollectedThisMonth: money(topups._sum.amount ?? 0).toFixed(6),
      supplierCostThisMonth: costs,
      grossMarginThisMonth: money(revenue.usage).minus(knownCost).toFixed(6),
      grossMarginNote:
        costs.unknownCount > 0
          ? `${costs.unknownCount} successful upstream calls have no supplier cost data and are excluded from margin.`
          : null,
      providerAvailability: Object.fromEntries(
        providerStatus.map((p) => [p.status, p._count._all]),
      ),
    };
  }

  /** Recognized revenue: usage charges + subscription fees, net of refunds of those (ledger-based). */
  async revenue(from: Date, to: Date) {
    const rows = await this.prisma.walletTransaction.groupBy({
      by: ['type'],
      where: {
        createdAt: { gte: from, lte: to },
        type: { in: ['USAGE_DEBIT', 'SUBSCRIPTION_FEE'] },
      },
      _sum: { amount: true },
    });
    const get = (t: string) => money(rows.find((r) => r.type === t)?._sum.amount ?? 0).neg();
    const usage = get('USAGE_DEBIT');
    const subs = get('SUBSCRIPTION_FEE');
    return {
      usage: usage.toFixed(6),
      subscriptions: subs.toFixed(6),
      total: usage.plus(subs).toFixed(6),
    };
  }

  async supplierCosts(from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<
      { estimated: boolean; known: boolean; total: Prisma.Decimal | null; cnt: bigint }[]
    >`
      SELECT s."costIsEstimated" AS estimated, (s.cost IS NOT NULL) AS known, sum(s.cost) AS total, count(*) AS cnt
      FROM supplier_usage_records s WHERE s."createdAt" BETWEEN ${from} AND ${to} GROUP BY 1, 2`;
    let actual = money(0),
      estimated = money(0),
      unknownCount = 0;
    for (const r of rows) {
      if (!r.known) unknownCount += n(r.cnt);
      else if (r.estimated) estimated = estimated.plus(r.total ?? 0);
      else actual = actual.plus(r.total ?? 0);
    }
    // Fixed supplier subscription fees for subscriptions active in the window (prorated by days).
    const subs = await this.prisma.providerSubscription.findMany({
      where: {
        monthlyFee: { not: null },
        startsAt: { lte: to },
        OR: [{ expiresAt: null }, { expiresAt: { gte: from } }],
      },
    });
    let fixed = money(0);
    for (const s of subs) {
      const start = Math.max(from.getTime(), s.startsAt.getTime());
      const end = Math.min(to.getTime(), s.expiresAt?.getTime() ?? to.getTime());
      if (end > start)
        fixed = fixed.plus(
          money(s.monthlyFee!)
            .mul((end - start) / (30 * 86400_000))
            .toDecimalPlaces(6),
        );
    }
    return {
      actual: actual.toFixed(6),
      estimated: estimated.toFixed(6),
      fixedSubscriptionFeesProrated: fixed.toFixed(6),
      unknownCount,
    };
  }

  async timeseries(from: Date, to: Date, granularity: 'minute' | 'hour' | 'day') {
    const rows = await this.prisma.$queryRaw<
      {
        bucket: Date;
        requests: bigint;
        success: bigint;
        failed: bigint;
        revenue: Prisma.Decimal | null;
        avg_latency: number | null;
        avg_upstream: number | null;
        cost_actual: Prisma.Decimal | null;
        cost_estimated: Prisma.Decimal | null;
      }[]
    >`
      SELECT date_trunc(${granularity}, u."createdAt") AS bucket,
             count(*) AS requests,
             count(*) FILTER (WHERE u."statusCode" < 400) AS success,
             count(*) FILTER (WHERE u."statusCode" >= 400) AS failed,
             sum(u.price) AS revenue,
             avg(u."latencyMs")::float AS avg_latency,
             avg(u."upstreamLatencyMs")::float AS avg_upstream,
             sum(s.cost) FILTER (WHERE s."costIsEstimated" = false) AS cost_actual,
             sum(s.cost) FILTER (WHERE s."costIsEstimated" = true) AS cost_estimated
      FROM api_usage_records u LEFT JOIN supplier_usage_records s ON s."usageRecordId" = u.id
      WHERE u."createdAt" BETWEEN ${from} AND ${to}
      GROUP BY 1 ORDER BY 1`;
    return rows.map((r) => {
      const rev = money(r.revenue ?? 0);
      const ca = money(r.cost_actual ?? 0);
      const ce = money(r.cost_estimated ?? 0);
      return {
        bucket: r.bucket,
        requests: n(r.requests),
        successful: n(r.success),
        failed: n(r.failed),
        avgLatencyMs: Math.round(r.avg_latency ?? 0),
        avgUpstreamLatencyMs: Math.round(r.avg_upstream ?? 0),
        revenue: rev.toFixed(6),
        costActual: ca.toFixed(6),
        costEstimated: ce.toFixed(6),
        margin: rev.minus(ca).minus(ce).toFixed(6),
      };
    });
  }

  async topCustomers(from: Date, to: Date, take = 10) {
    const g = await this.prisma.apiUsageRecord.groupBy({
      by: ['orgId'],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
      _sum: { price: true },
      orderBy: { _sum: { price: 'desc' } },
      take,
    });
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: g.map((x) => x.orgId) } },
      select: { id: true, name: true, type: true },
    });
    return g.map((x) => ({
      org: orgs.find((o) => o.id === x.orgId),
      requests: x._count._all,
      revenue: money(x._sum.price ?? 0).toFixed(6),
    }));
  }

  async topEndpoints(from: Date, to: Date, take = 10) {
    const g = await this.prisma.apiUsageRecord.groupBy({
      by: ['endpointId'],
      where: { createdAt: { gte: from, lte: to }, endpointId: { not: null } },
      _count: { _all: true },
      _sum: { price: true },
      _avg: { latencyMs: true },
      orderBy: { _count: { endpointId: 'desc' } },
      take,
    });
    const eps = await this.prisma.apiEndpoint.findMany({
      where: { id: { in: g.map((x) => x.endpointId!) } },
      select: {
        id: true,
        name: true,
        method: true,
        path: true,
        product: { select: { name: true, slug: true } },
      },
    });
    return g.map((x) => ({
      endpoint: eps.find((e) => e.id === x.endpointId),
      requests: x._count._all,
      revenue: money(x._sum.price ?? 0).toFixed(6),
      avgLatencyMs: Math.round(x._avg.latencyMs ?? 0),
    }));
  }

  async apiPopularity(from: Date, to: Date) {
    const g = await this.prisma.apiUsageRecord.groupBy({
      by: ['productId'],
      where: { createdAt: { gte: from, lte: to }, productId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { productId: 'desc' } },
      take: 10,
    });
    const ps = await this.prisma.apiProduct.findMany({
      where: { id: { in: g.map((x) => x.productId!) } },
      select: { id: true, name: true },
    });
    return g.map((x) => ({
      name: ps.find((p) => p.id === x.productId)?.name ?? 'Unknown',
      requests: x._count._all,
    }));
  }

  async providerAvailability(from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<
      {
        providerId: string;
        name: string;
        status: string;
        checks: bigint;
        ok: bigint;
        avg_latency: number | null;
      }[]
    >`
      SELECT p.id AS "providerId", p.name, p.status::text AS status, count(h.id) AS checks, count(h.id) FILTER (WHERE h.ok) AS ok, avg(h."latencyMs")::float AS avg_latency
      FROM api_providers p LEFT JOIN provider_health_checks h ON h."providerId" = p.id AND h."checkedAt" BETWEEN ${from} AND ${to}
      WHERE p."deletedAt" IS NULL GROUP BY p.id ORDER BY p.name`;
    return rows.map((r) => ({
      providerId: r.providerId,
      name: r.name,
      status: r.status,
      checks: n(r.checks),
      availabilityPct: n(r.checks) ? Math.round((n(r.ok) / n(r.checks)) * 10000) / 100 : null,
      avgLatencyMs: r.avg_latency ? Math.round(r.avg_latency) : null,
    }));
  }

  async supplierCostsByProvider(from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<
      {
        providerId: string;
        name: string;
        calls: bigint;
        actual: Prisma.Decimal | null;
        estimated: Prisma.Decimal | null;
        unknown: bigint;
      }[]
    >`
      SELECT p.id AS "providerId", p.name, count(s.id) AS calls,
             sum(s.cost) FILTER (WHERE NOT s."costIsEstimated") AS actual,
             sum(s.cost) FILTER (WHERE s."costIsEstimated") AS estimated,
             count(s.id) FILTER (WHERE s.cost IS NULL) AS unknown
      FROM api_providers p LEFT JOIN supplier_usage_records s ON s."providerId" = p.id AND s."createdAt" BETWEEN ${from} AND ${to}
      WHERE p."deletedAt" IS NULL GROUP BY p.id ORDER BY p.name`;
    return rows.map((r) => ({
      providerId: r.providerId,
      name: r.name,
      calls: n(r.calls),
      actualCost: money(r.actual ?? 0).toFixed(6),
      estimatedCost: money(r.estimated ?? 0).toFixed(6),
      callsWithoutCostData: n(r.unknown),
    }));
  }

  async revenueByProduct(from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<
      {
        productId: string;
        name: string;
        requests: bigint;
        revenue: Prisma.Decimal | null;
        cost_actual: Prisma.Decimal | null;
        cost_estimated: Prisma.Decimal | null;
        unknown: bigint;
      }[]
    >`
      SELECT pr.id AS "productId", pr.name, count(u.id) AS requests, sum(u.price) AS revenue,
             sum(s.cost) FILTER (WHERE NOT s."costIsEstimated") AS cost_actual,
             sum(s.cost) FILTER (WHERE s."costIsEstimated") AS cost_estimated,
             count(s.id) FILTER (WHERE s.cost IS NULL) AS unknown
      FROM api_products pr JOIN api_usage_records u ON u."productId" = pr.id AND u."createdAt" BETWEEN ${from} AND ${to}
      LEFT JOIN supplier_usage_records s ON s."usageRecordId" = u.id
      GROUP BY pr.id ORDER BY revenue DESC NULLS LAST`;
    return rows.map((r) => {
      const rev = money(r.revenue ?? 0);
      const cost = money(r.cost_actual ?? 0).plus(r.cost_estimated ?? 0);
      return {
        productId: r.productId,
        name: r.name,
        requests: n(r.requests),
        revenue: rev.toFixed(6),
        costActual: money(r.cost_actual ?? 0).toFixed(6),
        costEstimated: money(r.cost_estimated ?? 0).toFixed(6),
        callsWithoutCostData: n(r.unknown),
        grossMargin: rev.minus(cost).toFixed(6),
        marginPct: rev.gt(0) ? rev.minus(cost).div(rev).mul(100).toFixed(2) : null,
      };
    });
  }
}
