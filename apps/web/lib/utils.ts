import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const COMPANY = process.env.NEXT_PUBLIC_COMPANY_NAME || 'Ze-Ze Technologies';

/** Money display only — values arrive as exact decimal strings from the API. */
export function money(v: string | number | null | undefined, opts: { currency?: string; digits?: number } = {}) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  const digits = opts.digits ?? (Math.abs(n) > 0 && Math.abs(n) < 0.1 ? 4 : 2);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: opts.currency ?? 'USD', minimumFractionDigits: 2, maximumFractionDigits: Math.max(2, digits) }).format(n);
}

export const num = (v: number | string | null | undefined) => (v === null || v === undefined ? '—' : new Intl.NumberFormat('en-US').format(Number(v)));
export const compact = (v: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

export function date(v: string | Date | null | undefined, withTime = false) {
  if (!v) return '—';
  const d = new Date(v);
  return withTime ? d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : d.toLocaleDateString('en-US', { dateStyle: 'medium' });
}

export function relative(v: string | Date | null | undefined) {
  if (!v) return 'never';
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function newIdempotencyKey(prefix = 'web') {
  return `${prefix}-${crypto.randomUUID()}`;
}
