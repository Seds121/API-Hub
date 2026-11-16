import Decimal from 'decimal.js';

/**
 * All monetary math goes through Decimal. Never use JS numbers for money.
 * Scale 6 matches the Decimal(18,6) DB columns.
 */
export const MONEY_SCALE = 6;
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

export type MoneyInput = string | number | Decimal | { toString(): string };

export function money(v: MoneyInput | null | undefined): Decimal {
  if (v === null || v === undefined || v === '') return new D(0);
  const d = new D(
    typeof v === 'object' && !(v instanceof Decimal) ? v.toString() : (v as Decimal.Value),
  );
  if (!d.isFinite()) throw new Error('Invalid monetary value');
  return d.toDecimalPlaces(MONEY_SCALE);
}

export function moneyStr(v: MoneyInput | null | undefined): string {
  return money(v).toFixed(MONEY_SCALE);
}

/** Apply a percentage discount (0-100) and round to scale. */
export function applyDiscount(
  price: MoneyInput,
  discountPercent: MoneyInput | null | undefined,
): Decimal {
  const p = money(price);
  const pct = money(discountPercent ?? 0);
  if (pct.lt(0) || pct.gt(100)) throw new Error('discountPercent must be between 0 and 100');
  return p.mul(new D(100).minus(pct)).div(100).toDecimalPlaces(MONEY_SCALE);
}

export function formatMoney(
  v: MoneyInput | null | undefined,
  currency = 'USD',
  maxFractionDigits = 4,
): string {
  const d = money(v);
  const fixed = d.toDecimalPlaces(maxFractionDigits).toNumber(); // display only
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFractionDigits,
  }).format(fixed);
}

export { Decimal };
