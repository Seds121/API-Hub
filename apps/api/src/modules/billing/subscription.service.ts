import { Injectable } from '@nestjs/common';
import type { SubscriptionPlan } from '@prisma/client';
import { money } from '@zeze/shared';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { AuditService } from '../../common/audit.service';
import { AppError, badRequest, notFound } from '../../common/http/app-error';
import { WalletService } from './wallet.service';
import { InvoiceService } from './invoice.service';
import { logger } from '../../common/logging/logger';

function addInterval(d: Date, interval: SubscriptionPlan['interval']) {
  const n = new Date(d);
  if (interval === 'ANNUAL') n.setUTCFullYear(n.getUTCFullYear() + 1);
  else n.setUTCMonth(n.getUTCMonth() + 1);
  return n;
}

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly wallet: WalletService,
    private readonly invoices: InvoiceService,
    private readonly audit: AuditService,
  ) {}

  /** Active subscription (cached briefly for the gateway hot path). */
  async active(orgId: string) {
    const now = new Date();
    return this.prisma.customerSubscription.findFirst({
      where: { orgId, status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { gt: now } },
      include: { plan: true },
      orderBy: { currentPeriodEnd: 'desc' },
    });
  }

  async invalidate(orgId: string) {
    await this.redis.client.del(`gw:sub:${orgId}`);
  }

  /** Atomically consume one included request; false when quota exhausted. */
  async consumeIncluded(subId: string, included: number): Promise<boolean> {
    const n = await this.prisma
      .$executeRaw`UPDATE customer_subscriptions SET "requestsUsedInPeriod" = "requestsUsedInPeriod" + 1 WHERE id = ${subId}::uuid AND "requestsUsedInPeriod" < ${included}`;
    return n === 1;
  }
  async refundIncluded(subId: string) {
    await this.prisma
      .$executeRaw`UPDATE customer_subscriptions SET "requestsUsedInPeriod" = GREATEST(0, "requestsUsedInPeriod" - 1) WHERE id = ${subId}::uuid`;
  }

  /**
   * Subscribe (or switch plan) paying from the wallet. The fee debit, plan credit grant, subscription
   * row and paid invoice are one transaction; idempotency key prevents double charging on retries.
   */
  async subscribeFromWallet(
    orgId: string,
    planId: string,
    actorUserId: string,
    idempotencyKey: string,
  ) {
    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { id: planId, isActive: true },
    });
    if (!plan) throw notFound('Plan');
    if (plan.type !== 'SUBSCRIPTION')
      throw badRequest(
        'Only subscription plans can be subscribed to. Prepaid packs are purchased as top-ups; enterprise plans are assigned by sales.',
      );
    const existingTx = await this.prisma.walletTransaction.findUnique({
      where: { idempotencyKey: `subfee:${idempotencyKey}` },
    });
    if (existingTx) {
      const sub = await this.active(orgId);
      return { subscription: sub, replayed: true };
    }
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.customerSubscription.findFirst({
        where: { orgId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
      });
      if (
        current?.planId === plan.id &&
        current.status === 'ACTIVE' &&
        current.currentPeriodEnd > now
      )
        throw new AppError('CONFLICT', 'Already subscribed to this plan.');
      if (money(plan.price).gt(0)) {
        await this.wallet.apply(
          {
            orgId,
            amount: money(plan.price),
            direction: 'debit',
            type: 'SUBSCRIPTION_FEE',
            description: `${plan.name} subscription (${plan.interval?.toLowerCase()})`,
            idempotencyKey: `subfee:${idempotencyKey}`,
            referenceType: 'SubscriptionPlan',
            referenceId: plan.id,
            actorUserId,
          },
          tx,
        );
      }
      if (money(plan.creditGrant).gt(0)) {
        await this.wallet.apply(
          {
            orgId,
            amount: money(plan.creditGrant),
            direction: 'credit',
            type: 'PLAN_CREDIT_GRANT',
            description: `${plan.name} included credit`,
            idempotencyKey: `subgrant:${idempotencyKey}`,
            referenceType: 'SubscriptionPlan',
            referenceId: plan.id,
            actorUserId,
          },
          tx,
        );
      }
      if (current)
        await tx.customerSubscription.update({
          where: { id: current.id },
          data: { status: 'CANCELLED', currentPeriodEnd: now },
        });
      const sub = await tx.customerSubscription.create({
        data: {
          orgId,
          planId: plan.id,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: addInterval(now, plan.interval),
        },
      });
      await this.invoices.create(tx, {
        orgId,
        status: 'PAID',
        lines: [
          {
            description: `${plan.name} subscription — ${now.toISOString().slice(0, 10)} to ${sub.currentPeriodEnd.toISOString().slice(0, 10)} (paid from wallet)`,
            quantity: 1,
            unitPrice: money(plan.price).toFixed(6),
          },
        ],
        periodStart: now,
        periodEnd: sub.currentPeriodEnd,
      });
      await this.audit.record(
        {
          action: 'subscription.create',
          actor: { userId: actorUserId },
          orgId,
          targetType: 'CustomerSubscription',
          targetId: sub.id,
          metadata: { plan: plan.code, replaced: current?.id },
        },
        tx,
      );
      return sub;
    });
    await this.invalidate(orgId);
    return { subscription: result, replayed: false };
  }

  async cancel(orgId: string, actorUserId: string) {
    const sub = await this.active(orgId);
    if (!sub) throw notFound('Active subscription');
    await this.prisma.customerSubscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true, autoRenew: false },
    });
    await this.audit.record({
      action: 'subscription.cancel',
      actor: { userId: actorUserId },
      orgId,
      targetType: 'CustomerSubscription',
      targetId: sub.id,
    });
    await this.invalidate(orgId);
  }

  async resume(orgId: string, actorUserId: string) {
    const sub = await this.active(orgId);
    if (!sub) throw notFound('Active subscription');
    await this.prisma.customerSubscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: false, autoRenew: true },
    });
    await this.audit.record({
      action: 'subscription.resume',
      actor: { userId: actorUserId },
      orgId,
      targetType: 'CustomerSubscription',
      targetId: sub.id,
    });
  }

  /** Renewal job: renew from wallet, or mark PAST_DUE / EXPIRED. Idempotent per period. */
  async processRenewals(): Promise<{ renewed: number; expired: number; pastDue: number }> {
    const now = new Date();
    const due = await this.prisma.customerSubscription.findMany({
      where: { status: { in: ['ACTIVE', 'PAST_DUE'] }, currentPeriodEnd: { lte: now } },
      include: { plan: true },
      take: 200,
    });
    let renewed = 0,
      expired = 0,
      pastDue = 0;
    for (const s of due) {
      if (
        s.cancelAtPeriodEnd ||
        !s.autoRenew ||
        !s.plan.isActive ||
        (s.status === 'PAST_DUE' && now.getTime() - s.currentPeriodEnd.getTime() > 7 * 86400_000)
      ) {
        await this.prisma.customerSubscription.update({
          where: { id: s.id },
          data: { status: 'EXPIRED' },
        });
        expired++;
        await this.invalidate(s.orgId);
        continue;
      }
      const periodStart = s.currentPeriodEnd;
      const periodEnd = addInterval(periodStart, s.plan.interval);
      const key = `renew:${s.id}:${periodStart.toISOString()}`;
      try {
        await this.prisma.$transaction(async (tx) => {
          if (money(s.plan.price).gt(0))
            await this.wallet.apply(
              {
                orgId: s.orgId,
                amount: money(s.plan.price),
                direction: 'debit',
                type: 'SUBSCRIPTION_FEE',
                description: `${s.plan.name} renewal`,
                idempotencyKey: key,
                referenceType: 'CustomerSubscription',
                referenceId: s.id,
              },
              tx,
            );
          if (money(s.plan.creditGrant).gt(0))
            await this.wallet.apply(
              {
                orgId: s.orgId,
                amount: money(s.plan.creditGrant),
                direction: 'credit',
                type: 'PLAN_CREDIT_GRANT',
                description: `${s.plan.name} included credit`,
                idempotencyKey: `${key}:grant`,
                referenceType: 'CustomerSubscription',
                referenceId: s.id,
              },
              tx,
            );
          await tx.customerSubscription.update({
            where: { id: s.id },
            data: {
              status: 'ACTIVE',
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              requestsUsedInPeriod: 0,
            },
          });
          await this.invoices.create(tx, {
            orgId: s.orgId,
            status: 'PAID',
            lines: [
              {
                description: `${s.plan.name} renewal ${periodStart.toISOString().slice(0, 10)} – ${periodEnd.toISOString().slice(0, 10)}`,
                quantity: 1,
                unitPrice: money(s.plan.price).toFixed(6),
              },
            ],
            periodStart,
            periodEnd,
          });
        });
        renewed++;
      } catch (e) {
        if (e instanceof AppError && e.code === 'INSUFFICIENT_BALANCE') {
          await this.prisma.customerSubscription.update({
            where: { id: s.id },
            data: { status: 'PAST_DUE' },
          });
          pastDue++;
        } else logger.error({ err: (e as Error).message, sub: s.id }, 'renewal failed');
      }
      await this.invalidate(s.orgId);
    }
    return { renewed, expired, pastDue };
  }
}
