import { Controller, Get, Headers, HttpCode, Param, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { money, moneyStr, PERMISSIONS as P } from '@zeze/shared';
import { Auth, OrgId, RequirePermissions } from '../../common/decorators';
import type { AuthContext } from '../../common/auth-context';
import { ApiZodBody, ZBody, ZQuery, uuidParam } from '../../common/http/zod';
import { paged, pageArgs, serialize } from '../../common/http/pagination';
import { badRequest } from '../../common/http/app-error';
import { PrismaService } from '../../common/prisma.service';
import { WalletService } from './wallet.service';
import { SubscriptionService } from './subscription.service';
import { InvoiceService } from './invoice.service';
import { SpendTracker } from './spend-tracker.service';

const txQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  type: z
    .enum([
      'TOPUP',
      'USAGE_DEBIT',
      'ADMIN_CREDIT',
      'ADMIN_DEBIT',
      'REFUND',
      'SUBSCRIPTION_FEE',
      'PLAN_CREDIT_GRANT',
      'TRANSFER_IN',
      'TRANSFER_OUT',
      'REVERSAL',
    ])
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
const subscribeSchema = z.object({ planId: z.string().uuid() });

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  // Neutralize spreadsheet formula injection and quote.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

@ApiTags('billing')
@Controller('api/billing')
export class BillingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly subs: SubscriptionService,
    private readonly invoices: InvoiceService,
    private readonly spend: SpendTracker,
  ) {}

  @RequirePermissions(P.ORG_BILLING_READ)
  @Get('overview')
  async overview(@OrgId() orgId: string) {
    const [wallet, sub, org, mtd] = await Promise.all([
      this.wallet.getSummary(orgId),
      this.subs.active(orgId),
      this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
      this.spend.monthToDate(orgId),
    ]);
    return serialize({
      wallet,
      subscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            plan: sub.plan,
            currentPeriodStart: sub.currentPeriodStart,
            currentPeriodEnd: sub.currentPeriodEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            requestsUsedInPeriod: sub.requestsUsedInPeriod,
          }
        : null,
      monthToDateSpend: mtd.toFixed(6),
      monthlySpendLimit: org.monthlySpendLimit ? moneyStr(org.monthlySpendLimit) : null,
    });
  }

  @RequirePermissions(P.ORG_BILLING_READ)
  @Get('transactions')
  async transactions(@OrgId() orgId: string, @ZQuery(txQuery) q: z.infer<typeof txQuery>) {
    const { items, total } = await this.wallet.transactions(orgId, {
      ...pageArgs(q),
      type: q.type,
      from: q.from,
      to: q.to,
    });
    return serialize(paged(items, total, q));
  }

  @RequirePermissions(P.ORG_BILLING_READ)
  @Get('statement.csv')
  async statement(
    @OrgId() orgId: string,
    @ZQuery(txQuery) q: z.infer<typeof txQuery>,
    @Res() res: Response,
  ) {
    const from = q.from ?? new Date(Date.now() - 31 * 86400_000);
    const to = q.to ?? new Date();
    if (to.getTime() - from.getTime() > 400 * 86400_000)
      throw badRequest('Statement range is limited to 400 days.');
    const { items } = await this.wallet.transactions(orgId, {
      skip: 0,
      take: 50_000,
      type: q.type,
      from,
      to,
    });
    const header = [
      'date',
      'type',
      'description',
      'amount',
      'balance_after',
      'currency',
      'reference',
    ];
    const lines = [
      header.join(','),
      ...items.map((t) =>
        [
          t.createdAt.toISOString(),
          t.type,
          t.description,
          moneyStr(t.amount),
          moneyStr(t.balanceAfter),
          t.currency,
          t.referenceId ?? '',
        ]
          .map(csvCell)
          .join(','),
      ),
    ];
    const sum = items.reduce((s, t) => s.plus(t.amount.toString()), money(0));
    lines.push(
      [
        '',
        'NET',
        `Net change ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`,
        sum.toFixed(6),
        '',
        'USD',
        '',
      ]
        .map(csvCell)
        .join(','),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="statement-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"`,
    );
    res.send(lines.join('\n'));
  }

  @RequirePermissions(P.ORG_BILLING_READ)
  @Get('invoices')
  async invoicesList(@OrgId() orgId: string) {
    return serialize(await this.invoices.list(orgId));
  }

  @RequirePermissions(P.ORG_BILLING_READ)
  @Get('invoices/:id/pdf')
  async invoicePdf(@OrgId() orgId: string, @Param('id') id: string, @Res() res: Response) {
    const { filename, buffer } = await this.invoices.pdf(orgId, uuidParam.parse(id));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @RequirePermissions(P.ORG_BILLING_WRITE)
  @Post('subscription')
  @ApiZodBody(subscribeSchema)
  async subscribe(
    @OrgId() orgId: string,
    @Auth() a: AuthContext,
    @ZBody(subscribeSchema) b: z.infer<typeof subscribeSchema>,
    @Headers('idempotency-key') idem?: string,
  ) {
    if (!idem || !/^[A-Za-z0-9_-]{8,100}$/.test(idem))
      throw badRequest('A valid Idempotency-Key header is required.');
    return serialize(
      await this.subs.subscribeFromWallet(orgId, b.planId, a.userId, `${orgId}:${idem}`),
    );
  }

  @RequirePermissions(P.ORG_BILLING_WRITE)
  @HttpCode(204)
  @Post('subscription/cancel')
  async cancel(@OrgId() orgId: string, @Auth() a: AuthContext) {
    await this.subs.cancel(orgId, a.userId);
  }

  @RequirePermissions(P.ORG_BILLING_WRITE)
  @HttpCode(204)
  @Post('subscription/resume')
  async resume(@OrgId() orgId: string, @Auth() a: AuthContext) {
    await this.subs.resume(orgId, a.userId);
  }
}
