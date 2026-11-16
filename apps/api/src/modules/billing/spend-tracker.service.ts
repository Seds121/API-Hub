import { Injectable } from '@nestjs/common';
import { Decimal, money } from '@zeze/shared';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';

const MICRO = 1_000_000;

/**
 * Month-to-date spend per org, kept in Redis as integer micro-units (exact at scale 6) and rebuilt
 * from the database when the key is missing. Used to enforce monthlySpendLimit cheaply per request.
 */
@Injectable()
export class SpendTracker {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private key(orgId: string, d = new Date()) {
    return `spend:${orgId}:${d.toISOString().slice(0, 7)}`;
  }

  async monthToDate(orgId: string): Promise<Decimal> {
    const k = this.key(orgId);
    const v = await this.redis.client.get(k);
    if (v !== null) return money(v).div(MICRO);
    const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const agg = await this.prisma.apiUsageRecord.aggregate({
      where: { orgId, createdAt: { gte: start } },
      _sum: { price: true },
    });
    const total = money(agg._sum.price ?? 0);
    await this.redis.client.set(k, total.mul(MICRO).toFixed(0), 'EX', 40 * 86400, 'NX');
    return total;
  }

  /** Call after the usage record is committed. If the counter is cold, seeding from the DB already includes this charge. */
  async add(orgId: string, amount: Decimal) {
    if (amount.lte(0)) return;
    const k = this.key(orgId);
    if (!(await this.redis.client.exists(k))) {
      await this.monthToDate(orgId);
      return;
    }
    await this.redis.client.incrby(k, Number(amount.mul(MICRO).toFixed(0)));
  }

  /** True if charging `amount` would exceed the org's (or its parent agency's per-subaccount) monthly cap. */
  async wouldExceed(
    org: { id: string; monthlySpendLimit: { toString(): string } | null },
    amount: Decimal,
  ) {
    if (!org.monthlySpendLimit) return false;
    const mtd = await this.monthToDate(org.id);
    return mtd.plus(amount).gt(money(org.monthlySpendLimit));
  }
}
