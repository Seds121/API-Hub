import { Injectable } from '@nestjs/common';
import type { PricingRule, Prisma } from '@prisma/client';
import { applyDiscount, Decimal, money } from '@zeze/shared';
import { PrismaService, Tx } from '../../common/prisma.service';

export interface PriceQuote {
  unitPrice: Decimal;
  currency: string;
  ruleId: string;
  ruleScope: PricingRule['scope'];
  chargeOnClientError: boolean;
  minWalletBalance: Decimal;
  appliedDiscounts: { source: string; percent: string }[];
}

const activeWindow = (now: Date): Prisma.PricingRuleWhereInput => ({
  isActive: true,
  validFrom: { lte: now },
  OR: [{ validTo: null }, { validTo: { gt: now } }],
});

/**
 * Resolves the customer price for one request. Precedence (most specific first):
 *   org+endpoint override → org+product override → agency wholesale (for agency orgs) →
 *   endpoint price → product default.
 * Then rule discount, agency wholesale discount, and subscription-plan discount are applied.
 * Returns null when no price is configured — the gateway then refuses the call (never free by accident).
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(
    args: {
      orgId: string;
      orgType: string;
      productId: string;
      endpointId: string;
      planDiscountPercent?: Decimal | string | null;
    },
    db: Tx | PrismaService = this.prisma,
  ): Promise<PriceQuote | null> {
    const now = new Date();
    const rules = await db.pricingRule.findMany({
      where: {
        ...activeWindow(now),
        OR: [
          {
            scope: 'ORGANIZATION',
            orgId: args.orgId,
            OR: [{ endpointId: args.endpointId }, { productId: args.productId, endpointId: null }],
          },
          { scope: 'AGENCY_WHOLESALE', orgId: args.orgId, productId: args.productId },
          { scope: 'ENDPOINT', endpointId: args.endpointId },
          { scope: 'PRODUCT_DEFAULT', productId: args.productId },
        ],
      },
      orderBy: { validFrom: 'desc' },
    });
    const pick =
      rules.find((r) => r.scope === 'ORGANIZATION' && r.endpointId === args.endpointId) ??
      rules.find(
        (r) => r.scope === 'ORGANIZATION' && r.productId === args.productId && !r.endpointId,
      ) ??
      rules.find((r) => r.scope === 'AGENCY_WHOLESALE' && r.productId === args.productId) ??
      rules.find((r) => r.scope === 'ENDPOINT') ??
      rules.find((r) => r.scope === 'PRODUCT_DEFAULT');
    if (!pick) return null;

    const discounts: { source: string; percent: string }[] = [];
    let price = money(pick.pricePerRequest);
    if (pick.discountPercent && money(pick.discountPercent).gt(0)) {
      price = applyDiscount(price, pick.discountPercent);
      discounts.push({ source: 'rule', percent: money(pick.discountPercent).toString() });
    }
    // Agency wholesale discount (agreement) applies to base list prices only.
    if (
      args.orgType === 'AGENCY' &&
      (pick.scope === 'ENDPOINT' || pick.scope === 'PRODUCT_DEFAULT')
    ) {
      const ag = await db.agencyAgreement.findUnique({ where: { agencyOrgId: args.orgId } });
      if (ag && ag.status === 'ACTIVE' && money(ag.wholesaleDiscountPercent).gt(0)) {
        price = applyDiscount(price, ag.wholesaleDiscountPercent);
        discounts.push({
          source: 'agency_wholesale',
          percent: money(ag.wholesaleDiscountPercent).toString(),
        });
      }
    }
    if (
      args.planDiscountPercent &&
      money(args.planDiscountPercent).gt(0) &&
      pick.scope !== 'ORGANIZATION'
    ) {
      price = applyDiscount(price, args.planDiscountPercent);
      discounts.push({ source: 'plan', percent: money(args.planDiscountPercent).toString() });
    }
    return {
      unitPrice: price,
      currency: pick.currency,
      ruleId: pick.id,
      ruleScope: pick.scope,
      chargeOnClientError: pick.chargeOnClientError,
      minWalletBalance: money(pick.minWalletBalance ?? 0),
      appliedDiscounts: discounts,
    };
  }

  /** Public list price per endpoint for marketplace display. */
  async listPrices(productId: string) {
    const now = new Date();
    const rules = await this.prisma.pricingRule.findMany({
      where: { ...activeWindow(now), productId, scope: 'PRODUCT_DEFAULT' },
    });
    const endpointRules = await this.prisma.pricingRule.findMany({
      where: { ...activeWindow(now), scope: 'ENDPOINT', endpoint: { productId } },
    });
    const def = rules[0] ? money(rules[0].pricePerRequest).toFixed(6) : null;
    return {
      defaultPricePerRequest: def,
      currency: rules[0]?.currency ?? 'USD',
      endpoints: Object.fromEntries(
        endpointRules.map((r) => [r.endpointId!, money(r.pricePerRequest).toFixed(6)]),
      ),
    };
  }
}
