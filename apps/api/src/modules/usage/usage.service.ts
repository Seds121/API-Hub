import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { money } from '@zeze/shared';
import { PrismaService } from '../../common/prisma.service';

export interface UsageFilter {
  orgIds: string[];
  from: Date;
  to: Date;
  productId?: string;
  apiKeyId?: string;
}

const n = (v: unknown) => Number(v ?? 0);

/** Usage metering read-models. All queries are scoped by explicit org ids (tenant isolation). */
@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  private where(f: UsageFilter): Prisma.ApiUsageRecordWhereInput {
    return {
      orgId: { in: f.orgIds },
      createdAt: { gte: f.from, lte: f.to },
      ...(f.productId ? { productId: f.productId } : {}),
      ...(f.apiKeyId ? { apiKeyId: f.apiKeyId } : {}),
    };
  }

  async summary(f: UsageFilter) {
    const w = this.where(f);
    const [total, success, failed, agg, byApiRaw, series] = await Promise.all([
      this.prisma.apiUsageRecord.count({ where: w }),
      this.prisma.apiUsageRecord.count({ where: { ...w, statusCode: { gte: 200, lt: 400 } } }),
      this.prisma.apiUsageRecord.count({ where: { ...w, statusCode: { gte: 400 } } }),
      this.prisma.apiUsageRecord.aggregate({
        where: w,
        _sum: { price: true },
        _avg: { latencyMs: true },
      }),
      this.prisma.apiUsageRecord.groupBy({
        by: ['productId'],
        where: w,
        _count: { _all: true },
        _sum: { price: true },
        orderBy: { _count: { productId: 'desc' } },
        take: 20,
      }),
      this.series(f, 'day'),
    ]);
    const products = await this.prisma.apiProduct.findMany({
      where: { id: { in: byApiRaw.map((b) => b.productId!).filter(Boolean) } },
      select: { id: true, name: true, slug: true },
    });
    return {
      range: { from: f.from, to: f.to },
      totals: {
        requests: total,
        successful: success,
        failed,
        spend: money(agg._sum.price ?? 0).toFixed(6),
        avgLatencyMs: Math.round(agg._avg.latencyMs ?? 0),
      },
      byApi: byApiRaw.map((b) => ({
        productId: b.productId,
        name: products.find((p) => p.id === b.productId)?.name ?? 'Unknown',
        slug: products.find((p) => p.id === b.productId)?.slug,
        requests: b._count._all,
        spend: money(b._sum.price ?? 0).toFixed(6),
      })),
      series,
    };
  }

  async series(f: UsageFilter, granularity: 'minute' | 'hour' | 'day') {
    const rows = await this.prisma.$queryRaw<
      {
        bucket: Date;
        requests: bigint;
        success: bigint;
        failed: bigint;
        spend: Prisma.Decimal | null;
        avg_latency: number | null;
      }[]
    >`
      SELECT date_trunc(${granularity}, "createdAt") AS bucket,
             count(*) AS requests,
             count(*) FILTER (WHERE "statusCode" < 400) AS success,
             count(*) FILTER (WHERE "statusCode" >= 400) AS failed,
             sum(price) AS spend,
             avg("latencyMs")::float AS avg_latency
      FROM api_usage_records
      WHERE "orgId" = ANY(${f.orgIds}::uuid[]) AND "createdAt" BETWEEN ${f.from} AND ${f.to}
        ${f.productId ? Prisma.sql`AND "productId" = ${f.productId}::uuid` : Prisma.empty}
        ${f.apiKeyId ? Prisma.sql`AND "apiKeyId" = ${f.apiKeyId}::uuid` : Prisma.empty}
      GROUP BY 1 ORDER BY 1`;
    return rows.map((r) => ({
      bucket: r.bucket,
      requests: n(r.requests),
      successful: n(r.success),
      failed: n(r.failed),
      spend: money(r.spend ?? 0).toFixed(6),
      avgLatencyMs: Math.round(r.avg_latency ?? 0),
    }));
  }

  async records(f: UsageFilter & { status?: 'success' | 'error'; skip: number; take: number }) {
    const w: Prisma.ApiUsageRecordWhereInput = {
      ...this.where(f),
      ...(f.status === 'success'
        ? { statusCode: { lt: 400 } }
        : f.status === 'error'
          ? { statusCode: { gte: 400 } }
          : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.apiUsageRecord.findMany({
        where: w,
        orderBy: { createdAt: 'desc' },
        skip: f.skip,
        take: f.take,
        select: {
          id: true,
          correlationId: true,
          method: true,
          path: true,
          statusCode: true,
          errorCode: true,
          latencyMs: true,
          price: true,
          coveredBySubscription: true,
          createdAt: true,
          product: { select: { name: true, slug: true } },
          endpoint: { select: { name: true, path: true } },
          apiKey: { select: { name: true, prefix: true } },
          org: { select: { id: true, name: true } },
        },
      }),
      this.prisma.apiUsageRecord.count({ where: w }),
    ]);
    return { items, total };
  }
}
