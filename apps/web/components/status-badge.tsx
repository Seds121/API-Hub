import { Badge } from './ui/badge';

const MAP: Record<string, 'success' | 'warning' | 'destructive' | 'secondary' | 'default'> = {
  ACTIVE: 'success', PUBLISHED: 'success', SUCCEEDED: 'success', PAID: 'success', VERIFIED: 'success', PROCESSED: 'success', RESOLVED: 'success', LIVE: 'default',
  DEGRADED: 'warning', PENDING: 'warning', REQUIRES_ACTION: 'warning', PAST_DUE: 'warning', DRAFT: 'secondary', OPEN: 'default', TRIALING: 'default', TEST: 'secondary', PARTIALLY_REFUNDED: 'warning',
  DOWN: 'destructive', DISABLED: 'destructive', FAILED: 'destructive', SUSPENDED: 'destructive', REVOKED: 'destructive', REJECTED: 'destructive', EXPIRED: 'secondary', CANCELLED: 'secondary', CLOSED: 'secondary', REFUNDED: 'secondary', VOID: 'secondary', IGNORED: 'secondary',
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge variant="secondary">—</Badge>;
  return <Badge variant={MAP[status] ?? 'secondary'}>{status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}

export function HttpStatus({ code }: { code: number }) {
  const v = code < 300 ? 'success' : code < 400 ? 'default' : code < 500 ? 'warning' : 'destructive';
  return <Badge variant={v} className="font-mono">{code}</Badge>;
}

export function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = { GET: 'bg-sky-500/12 text-sky-600 dark:text-sky-300', POST: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300', PUT: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', PATCH: 'bg-violet-500/12 text-violet-600 dark:text-violet-300', DELETE: 'bg-rose-500/12 text-rose-600 dark:text-rose-300' };
  return <span className={`inline-flex min-w-[3.3rem] justify-center rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${colors[method] ?? ''}`}>{method}</span>;
}
