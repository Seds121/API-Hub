import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { money } from '@zeze/shared';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { logger } from '../../common/logging/logger';
import { env } from '../../config/env';
import { WalletService } from '../billing/wallet.service';
import { SubscriptionService } from '../billing/subscription.service';
import { ProvidersService } from '../providers/providers.service';
import { sendUpstream } from '../integrations/engine/http-client';
import { SETTINGS_SCHEMA } from '../admin/settings';

interface JobDef {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

/**
 * Background jobs. Each run takes a Redis lock so that with N API/worker instances only one executes.
 * Set DISABLE_BACKGROUND_JOBS=true on web/API instances and run `node dist/worker.js` separately to scale.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnModuleDestroy {
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly wallet: WalletService,
    private readonly subs: SubscriptionService,
    private readonly providers: ProvidersService,
  ) {}

  readonly jobs: JobDef[] = [
    {
      name: 'reservation-sweeper',
      everyMs: 60_000,
      run: () => this.wallet.sweepExpiredReservations(),
    },
    { name: 'subscription-renewals', everyMs: 10 * 60_000, run: () => this.subs.processRenewals() },
    { name: 'provider-health', everyMs: 5 * 60_000, run: () => this.healthChecks() },
    { name: 'popularity-flush', everyMs: 5 * 60_000, run: () => this.flushPopularity() },
    { name: 'alerts', everyMs: 5 * 60_000, run: () => this.evaluateAlerts() },
    { name: 'retention', everyMs: 6 * 3600_000, run: () => this.retention() },
  ];

  onApplicationBootstrap() {
    if (env().DISABLE_BACKGROUND_JOBS || env().NODE_ENV === 'test') return;
    for (const j of this.jobs) {
      const t = setInterval(() => void this.runOnce(j.name), j.everyMs);
      t.unref();
      this.timers.push(t);
    }
    logger.info({ jobs: this.jobs.map((j) => j.name) }, 'background jobs scheduled');
  }

  onModuleDestroy() {
    this.timers.forEach(clearInterval);
  }

  async runOnce(name: string) {
    const j = this.jobs.find((x) => x.name === name);
    if (!j) throw new Error(`Unknown job ${name}`);
    try {
      const r = await this.redis.withLock(`job:${name}`, Math.max(30_000, j.everyMs - 1000), j.run);
      if (r !== undefined) logger.debug({ job: name, result: r }, 'job done');
      return r;
    } catch (e) {
      logger.error({ job: name, err: (e as Error).message }, 'job failed');
    }
  }

  private async settings() {
    const rows = await this.prisma.systemSetting.findMany();
    return SETTINGS_SCHEMA.parse(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  }

  async healthChecks() {
    const ps = await this.prisma.apiProvider.findMany({
      where: { deletedAt: null, status: { not: 'DISABLED' } },
      select: { id: true },
    });
    let checked = 0;
    for (const p of ps) {
      await this.providers.runHealthCheck(p.id).catch(() => undefined);
      checked++;
    }
    return { checked };
  }

  async flushPopularity() {
    let cursor = '0';
    let flushed = 0;
    do {
      const [next, keys] = await this.redis.client.scan(cursor, 'MATCH', 'pop:*', 'COUNT', 200);
      cursor = next;
      for (const k of keys) {
        const v = Number(await this.redis.client.getdel(k));
        if (v > 0) {
          await this.prisma.apiProduct
            .update({ where: { id: k.slice(4) }, data: { popularity: { increment: v } } })
            .catch(() => undefined);
          flushed++;
        }
      }
    } while (cursor !== '0');
    return { flushed };
  }

  /** Retention policy for customer request data and operational logs. */
  async retention() {
    const s = await this.settings();
    const days = Math.min(s.dataRetentionDays, env().DATA_RETENTION_DAYS);
    const cutoff = new Date(Date.now() - days * 86400_000);
    const usage = await this.prisma.apiUsageRecord.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    const sessions = await this.prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { lt: new Date(Date.now() - 7 * 86400_000) } },
        ],
      },
    });
    const health = await this.prisma.providerHealthCheck.deleteMany({
      where: { checkedAt: { lt: new Date(Date.now() - 30 * 86400_000) } },
    });
    const webhooks = await this.prisma.webhookEvent.updateMany({
      where: { receivedAt: { lt: cutoff }, payload: { not: Prisma.DbNull } },
      data: { payload: Prisma.DbNull },
    });
    const auditCutoff = new Date(Date.now() - s.auditRetentionDays * 86400_000);
    const audit = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.retention_purge', 'on', true)`;
      return tx.$executeRaw`DELETE FROM audit_logs WHERE "createdAt" < ${auditCutoff}`;
    });
    return {
      usage: usage.count,
      sessions: sessions.count,
      healthChecks: health.count,
      webhookPayloadsCleared: webhooks.count,
      auditLogs: audit,
    };
  }

  private async fire(
    rule: {
      id: string;
      name: string;
      channel: string;
      target: string | null;
      lastFiredAt: Date | null;
      windowMinutes: number;
    },
    message: string,
    severity = 'warning',
  ) {
    // Do not re-fire the same rule within its window.
    if (rule.lastFiredAt && Date.now() - rule.lastFiredAt.getTime() < rule.windowMinutes * 60_000)
      return;
    await this.prisma.$transaction([
      this.prisma.alertEvent.create({ data: { ruleId: rule.id, message, severity } }),
      this.prisma.alertRule.update({ where: { id: rule.id }, data: { lastFiredAt: new Date() } }),
    ]);
    logger.warn({ alert: rule.name, message }, 'ALERT');
    if (rule.channel === 'WEBHOOK' && rule.target) {
      try {
        const u = new URL(rule.target);
        await sendUpstream({
          url: u,
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            text: `[${env().COMPANY_NAME}] ${rule.name}: ${message}`,
            severity,
          }),
          timeoutMs: 5000,
          allowedHosts: [u.hostname],
          allowPrivate: false,
        });
      } catch (e) {
        logger.error({ err: (e as Error).message }, 'alert webhook failed');
      }
    }
    if (rule.channel === 'EMAIL')
      logger.warn(
        { to: rule.target },
        'EMAIL alert channel: SMTP delivery not configured in this build — event recorded in admin alerts',
      );
  }

  async evaluateAlerts() {
    const rules = await this.prisma.alertRule.findMany({ where: { isActive: true } });
    let fired = 0;
    for (const r of rules) {
      const since = new Date(Date.now() - r.windowMinutes * 60_000);
      const t = money(r.threshold);
      switch (r.metric) {
        case 'PROVIDER_DOWN': {
          const down = await this.prisma.apiProvider.findMany({
            where: {
              deletedAt: null,
              status: 'DOWN',
              ...(r.providerId ? { id: r.providerId } : {}),
            },
            select: { name: true },
          });
          if (down.length) {
            await this.fire(
              r,
              `Provider(s) down: ${down.map((d) => d.name).join(', ')}`,
              'critical',
            );
            fired++;
          }
          break;
        }
        case 'ERROR_RATE': {
          const where = {
            createdAt: { gte: since },
            ...(r.providerId ? { providerId: r.providerId } : {}),
          };
          const [total, failed] = await Promise.all([
            this.prisma.apiUsageRecord.count({ where }),
            this.prisma.apiUsageRecord.count({ where: { ...where, statusCode: { gte: 500 } } }),
          ]);
          if (total >= 20 && (failed / total) * 100 >= t.toNumber()) {
            await this.fire(
              r,
              `5xx error rate ${((failed / total) * 100).toFixed(1)}% over ${r.windowMinutes}m (${failed}/${total})`,
            );
            fired++;
          }
          break;
        }
        case 'LATENCY_MS': {
          const a = await this.prisma.apiUsageRecord.aggregate({
            where: {
              createdAt: { gte: since },
              ...(r.providerId ? { providerId: r.providerId } : {}),
            },
            _avg: { upstreamLatencyMs: true },
            _count: { _all: true },
          });
          if (a._count._all >= 20 && (a._avg.upstreamLatencyMs ?? 0) >= t.toNumber()) {
            await this.fire(
              r,
              `Avg upstream latency ${Math.round(a._avg.upstreamLatencyMs ?? 0)}ms over ${r.windowMinutes}m`,
            );
            fired++;
          }
          break;
        }
        case 'LOW_BALANCE': {
          const low = await this.prisma.$queryRaw<
            { name: string }[]
          >`SELECT o.name FROM wallets w JOIN organizations o ON o.id = w."orgId" WHERE o."deletedAt" IS NULL AND o.type <> 'PLATFORM' AND w.balance - w.reserved < ${t.toFixed(6)}::numeric LIMIT 20`;
          if (low.length) {
            await this.fire(
              r,
              `${low.length} wallet(s) below ${t.toFixed(2)}: ${low.map((l) => l.name).join(', ')}`,
              'info',
            );
            fired++;
          }
          break;
        }
        case 'PROVIDER_SUBSCRIPTION_EXPIRY': {
          const soon = new Date(Date.now() + t.toNumber() * 86400_000);
          const subs = await this.prisma.providerSubscription.findMany({
            where: { status: 'ACTIVE', expiresAt: { lte: soon } },
            include: { provider: { select: { name: true } } },
          });
          if (subs.length) {
            await this.fire(
              r,
              `Supplier subscriptions expiring within ${t.toNumber()} days: ${subs.map((s) => `${s.provider.name} (${s.expiresAt!.toISOString().slice(0, 10)})`).join(', ')}`,
            );
            fired++;
          }
          break;
        }
        case 'LICENSE_EXPIRY': {
          const soon = new Date(Date.now() + t.toNumber() * 86400_000);
          const lic = await this.prisma.providerLicense.findMany({
            where: { status: 'VERIFIED', expiresAt: { lte: soon } },
            include: { provider: { select: { name: true } } },
          });
          if (lic.length) {
            await this.fire(
              r,
              `Redistribution licenses expiring within ${t.toNumber()} days: ${lic.map((l) => l.provider.name).join(', ')}`,
              'critical',
            );
            fired++;
          }
          break;
        }
      }
    }
    // Expire licenses past their end date so the gateway stops routing immediately.
    await this.prisma.providerLicense.updateMany({
      where: { status: 'VERIFIED', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
    await this.prisma.providerSubscription.updateMany({
      where: { status: 'ACTIVE', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
    return { fired };
  }
}
