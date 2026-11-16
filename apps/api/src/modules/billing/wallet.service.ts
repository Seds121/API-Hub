import { Injectable } from '@nestjs/common';
import { Prisma, WalletTxType } from '@prisma/client';
import { Decimal, money, moneyStr } from '@zeze/shared';
import { PrismaService, Tx } from '../../common/prisma.service';
import { AppError, notFound } from '../../common/http/app-error';
import { env } from '../../config/env';

export interface LedgerEntryInput {
  orgId: string;
  /** Positive amount; direction comes from `direction`. */
  amount: Decimal | string;
  direction: 'credit' | 'debit';
  type: WalletTxType;
  description: string;
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
  /** Allow balance to drop to -creditLimit (debits only). Default true: creditLimit is 0 unless an enterprise arrangement is configured. */
  respectCreditLimit?: boolean;
}

interface LockedWallet {
  id: string;
  balance: Prisma.Decimal;
  reserved: Prisma.Decimal;
  creditLimit: Prisma.Decimal;
  currency: string;
}

/**
 * Wallet & immutable ledger. Every balance change:
 *  - runs in a DB transaction with the wallet row locked (SELECT … FOR UPDATE),
 *  - is keyed by a unique idempotencyKey (replays return the original entry, never double-apply),
 *  - writes a WalletTransaction row with balanceAfter (the ledger is append-only, enforced by trigger).
 */
@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async lockByOrg(tx: Tx, orgId: string): Promise<LockedWallet> {
    const rows = await tx.$queryRaw<
      LockedWallet[]
    >`SELECT id, balance, reserved, "creditLimit", currency FROM wallets WHERE "orgId" = ${orgId}::uuid FOR UPDATE`;
    if (!rows[0]) throw notFound('Wallet');
    return rows[0];
  }

  async getSummary(orgId: string) {
    const w = await this.prisma.wallet.findUnique({ where: { orgId } });
    if (!w) throw notFound('Wallet');
    const available = money(w.balance).minus(w.reserved);
    return {
      id: w.id,
      currency: w.currency,
      balance: moneyStr(w.balance),
      reserved: moneyStr(w.reserved),
      available: moneyStr(available),
      creditLimit: moneyStr(w.creditLimit),
      lowBalanceThreshold: moneyStr(w.lowBalanceThreshold),
      isLow: available.lt(w.lowBalanceThreshold),
    };
  }

  /** Apply one ledger entry. Pass `tx` to compose with other writes atomically. */
  async apply(input: LedgerEntryInput, tx?: Tx) {
    if (tx) return this.applyInTx(tx, input);
    try {
      return await this.prisma.$transaction((t) => this.applyInTx(t, input));
    } catch (e) {
      // Concurrent replay of the same idempotency key: return the winner's entry.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.walletTransaction.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) return this.checkReplay(existing, input);
      }
      throw e;
    }
  }

  private checkReplay(
    existing: { amount: Prisma.Decimal; type: WalletTxType },
    input: LedgerEntryInput,
  ) {
    const signed = input.direction === 'credit' ? money(input.amount) : money(input.amount).neg();
    if (!money(existing.amount).eq(signed) || existing.type !== input.type)
      throw new AppError('IDEMPOTENCY_CONFLICT');
    return { ...existing, replayed: true as const };
  }

  private async applyInTx(tx: Tx, input: LedgerEntryInput) {
    const amt = money(input.amount);
    if (amt.lte(0)) throw new AppError('BAD_REQUEST', 'Amount must be positive.');
    const existing = await tx.walletTransaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return this.checkReplay(existing, input);

    const w = await this.lockByOrg(tx, input.orgId);
    const signed = input.direction === 'credit' ? amt : amt.neg();
    const newBalance = money(w.balance).plus(signed);
    if (input.direction === 'debit') {
      const floor = input.respectCreditLimit === false ? money(0) : money(w.creditLimit).neg();
      if (newBalance.minus(w.reserved).lt(floor)) throw new AppError('INSUFFICIENT_BALANCE');
    }
    await tx.wallet.update({
      where: { id: w.id },
      data: { balance: new Prisma.Decimal(newBalance.toFixed(6)) },
    });
    const entry = await tx.walletTransaction.create({
      data: {
        walletId: w.id,
        type: input.type,
        amount: new Prisma.Decimal(signed.toFixed(6)),
        balanceAfter: new Prisma.Decimal(newBalance.toFixed(6)),
        currency: w.currency,
        description: input.description,
        idempotencyKey: input.idempotencyKey,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        actorUserId: input.actorUserId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    return { ...entry, replayed: false as const };
  }

  /**
   * Hold funds for an in-flight gateway call. Single conditional UPDATE → no overdraft under concurrency.
   * `minRemaining` enforces a pricing rule's minimum wallet balance.
   */
  async reserve(
    orgId: string,
    amount: Decimal,
    correlationId: string,
    minRemaining: Decimal = money(0),
  ): Promise<boolean> {
    const amt = moneyStr(amount);
    const min = moneyStr(minRemaining);
    const ttl = env().GATEWAY_RESERVATION_TTL_SECONDS;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.$queryRaw<{ id: string }[]>`
        UPDATE wallets SET reserved = reserved + ${amt}::numeric, "updatedAt" = now()
        WHERE "orgId" = ${orgId}::uuid
          AND balance - reserved - ${amt}::numeric >= GREATEST(-"creditLimit", ${min}::numeric)
        RETURNING id`;
      if (!updated[0]) return false;
      await tx.walletReservation.create({
        data: {
          walletId: updated[0].id,
          correlationId,
          amount: new Prisma.Decimal(amt),
          expiresAt: new Date(Date.now() + ttl * 1000),
        },
      });
      return true;
    });
  }

  /**
   * Settle a reservation: release the hold and (if chargeAmount > 0) debit the wallet with a ledger row.
   * `extra` runs inside the same transaction (usage records), so billing and metering commit together.
   * Idempotent per correlationId.
   */
  async settle(args: {
    orgId: string;
    correlationId: string;
    chargeAmount: Decimal;
    description: string;
    metadata?: Record<string, unknown>;
    extra?: (tx: Tx) => Promise<void>;
  }) {
    const charge = money(args.chargeAmount);
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.$queryRaw<
        { id: string; amount: Prisma.Decimal; status: string; walletId: string }[]
      >`
        SELECT id, amount, status, "walletId" FROM wallet_reservations WHERE "correlationId" = ${args.correlationId} FOR UPDATE`;
      const r = res[0];
      const w = await this.lockByOrg(tx, args.orgId);
      let balance = money(w.balance);
      let reserved = money(w.reserved);
      if (r && r.status === 'HELD') {
        reserved = reserved.minus(r.amount);
        await tx.walletReservation.update({
          where: { id: r.id },
          data: { status: charge.gt(0) ? 'SETTLED' : 'RELEASED' },
        });
      }
      if (charge.gt(0)) {
        const key = `usage:${args.correlationId}`;
        const dup = await tx.walletTransaction.findUnique({ where: { idempotencyKey: key } });
        if (!dup) {
          balance = balance.minus(charge);
          // Reservation guaranteed funds; if it had expired, enforce the floor now.
          if ((!r || r.status !== 'HELD') && balance.minus(reserved).lt(money(w.creditLimit).neg()))
            throw new AppError('INSUFFICIENT_BALANCE');
          await tx.walletTransaction.create({
            data: {
              walletId: w.id,
              type: 'USAGE_DEBIT',
              amount: new Prisma.Decimal(charge.neg().toFixed(6)),
              balanceAfter: new Prisma.Decimal(balance.toFixed(6)),
              currency: w.currency,
              description: args.description,
              idempotencyKey: key,
              referenceType: 'ApiUsageRecord',
              referenceId: args.correlationId,
              metadata: (args.metadata ?? {}) as Prisma.InputJsonValue,
            },
          });
        }
      }
      await tx.wallet.update({
        where: { id: w.id },
        data: {
          balance: new Prisma.Decimal(balance.toFixed(6)),
          reserved: new Prisma.Decimal(reserved.lt(0) ? '0' : reserved.toFixed(6)),
        },
      });
      if (args.extra) await args.extra(tx);
    });
  }

  async release(correlationId: string) {
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.$queryRaw<
        { id: string; amount: Prisma.Decimal; walletId: string; status: string }[]
      >`
        SELECT id, amount, "walletId", status FROM wallet_reservations WHERE "correlationId" = ${correlationId} FOR UPDATE`;
      const r = res[0];
      if (!r || r.status !== 'HELD') return;
      await tx.$executeRaw`UPDATE wallets SET reserved = GREATEST(0, reserved - ${moneyStr(r.amount)}::numeric) WHERE id = ${r.walletId}::uuid`;
      await tx.walletReservation.update({ where: { id: r.id }, data: { status: 'RELEASED' } });
    });
  }

  /** Background sweeper: release holds whose request never settled (crash/timeouts). */
  async sweepExpiredReservations(): Promise<number> {
    const stale = await this.prisma.walletReservation.findMany({
      where: { status: 'HELD', expiresAt: { lt: new Date() } },
      select: { correlationId: true },
      take: 500,
    });
    for (const s of stale) await this.release(s.correlationId);
    return stale.length;
  }

  async transactions(
    orgId: string,
    p: { skip: number; take: number; type?: WalletTxType; from?: Date; to?: Date },
  ) {
    const w = await this.prisma.wallet.findUnique({ where: { orgId } });
    if (!w) throw notFound('Wallet');
    const where: Prisma.WalletTransactionWhereInput = {
      walletId: w.id,
      ...(p.type ? { type: p.type } : {}),
      ...(p.from || p.to ? { createdAt: { gte: p.from, lte: p.to } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);
    return { items, total };
  }
}
