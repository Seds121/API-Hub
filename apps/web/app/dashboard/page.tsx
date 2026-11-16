'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Activity, AlertTriangle, CheckCircle2, CreditCard, KeyRound, Wallet, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { TimeAreaChart } from '@/components/charts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data-table';
import { HttpStatus } from '@/components/status-badge';
import { LoadingCards, QueryView } from '@/components/states';
import { useApi } from '@/lib/query';
import { useMe } from '@/lib/session';
import type { BillingOverview, UsageRecord, UsageSummary } from '@/lib/dash-types';
import type { Paged, ProductSummary } from '@/lib/types';
import { money, num, relative } from '@/lib/utils';

function Welcome() {
  const sp = useSearchParams();
  if (!sp.get('welcome')) return null;
  return (
    <Card className="mb-6 border-primary/30 bg-accent/50">
      <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Welcome aboard 🎉</p>
          <p className="text-sm text-muted-foreground">Three steps to your first request: fund your wallet, create a key, try the playground.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/dashboard/billing">Add credits</Link></Button>
          <Button asChild size="sm"><Link href="/dashboard/keys">Create API key</Link></Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Overview() {
  const me = useMe();
  const usage = useApi<UsageSummary>('/api/usage/summary?days=30');
  const canBilling = me.data?.orgPermissions.includes('org:billing:read');
  const billing = useApi<BillingOverview>(canBilling ? '/api/billing/overview' : null);
  const recent = useApi<Paged<UsageRecord>>('/api/usage/records?pageSize=8&days=30');
  const apis = useApi<Paged<ProductSummary>>('/api/catalog/products?pageSize=4&sort=popular');
  return (
    <>
      <PageHeader title={`Hello, ${me.data?.user.name.split(' ')[0] ?? ''}`} description={`Overview of ${me.data?.org?.name ?? 'your organization'} — last 30 days.`} actions={<Button asChild><Link href="/dashboard/keys"><KeyRound /> API keys</Link></Button>} />
      <Suspense><Welcome /></Suspense>
      {billing.data?.wallet.isLow && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> Your available balance is low ({money(billing.data.wallet.available)}). Requests will be declined when it runs out.
          <Button asChild size="sm" variant="outline" className="ml-auto"><Link href="/dashboard/billing">Top up</Link></Button>
        </div>
      )}
      <QueryView q={usage} loading={<LoadingCards />}>
        {(u) => (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total requests" value={num(u.totals.requests)} icon={Activity} hint={`avg ${u.totals.avgLatencyMs} ms latency`} />
            <StatCard label="Successful" value={num(u.totals.successful)} icon={CheckCircle2} tone="success" hint={u.totals.requests ? `${((u.totals.successful / u.totals.requests) * 100).toFixed(1)}% success rate` : '—'} />
            <StatCard label="Failed" value={num(u.totals.failed)} icon={XCircle} tone={u.totals.failed ? 'danger' : 'default'} hint="4xx/5xx, not billed when upstream failed" />
            {canBilling ? (
              <StatCard label="Available credit" value={billing.data ? money(billing.data.wallet.available) : '…'} icon={Wallet} hint={billing.data ? `${money(billing.data.monthToDateSpend)} spent this month` : undefined} tone={billing.data?.wallet.isLow ? 'warning' : 'default'} />
            ) : (
              <StatCard label="API consumption" value={money(u.totals.spend)} icon={CreditCard} />
            )}
          </div>
        )}
      </QueryView>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Requests</CardTitle>
            <CardDescription>Daily successful vs failed requests</CardDescription>
          </CardHeader>
          <CardContent>
            <QueryView q={usage}>{(u) => <TimeAreaChart data={u.series} series={[{ key: 'successful', label: 'Successful' }, { key: 'failed', label: 'Failed', color: 'hsl(var(--destructive))' }]} />}</QueryView>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>Your current plan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!canBilling ? (
              <p className="text-muted-foreground">Ask an owner or billing manager for plan details.</p>
            ) : billing.data?.subscription ? (
              <>
                <p className="text-lg font-semibold">{billing.data.subscription.plan.name}</p>
                <p className="text-muted-foreground">Renews {new Date(billing.data.subscription.currentPeriodEnd).toLocaleDateString()}{billing.data.subscription.cancelAtPeriodEnd ? ' (cancels at period end)' : ''}</p>
                {billing.data.subscription.plan.includedRequests > 0 && (
                  <div>
                    <div className="mb-1 flex justify-between text-xs"><span>Included requests</span><span>{num(billing.data.subscription.requestsUsedInPeriod)} / {num(billing.data.subscription.plan.includedRequests)}</span></div>
                    <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, (billing.data.subscription.requestsUsedInPeriod / billing.data.subscription.plan.includedRequests) * 100)}%` }} /></div>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="font-medium">Pay as you go</p>
                <p className="text-muted-foreground">Subscribe for included requests and discounts.</p>
                <Button asChild variant="outline" size="sm"><Link href="/dashboard/billing#plans">View plans</Link></Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">Recent activity</h2>
          <QueryView q={recent}>
            {(r) => (
              <DataTable
                rows={r.items}
                rowKey={(x) => x.id}
                dense
                empty={{ title: 'No requests yet', description: 'Make your first call from the playground.', action: <Button asChild size="sm"><Link href="/dashboard/playground">Open playground</Link></Button> }}
                columns={[
                  { header: 'API', cell: (x) => <span className="font-medium">{x.product?.name ?? '—'}</span> },
                  { header: 'Endpoint', cell: (x) => <code className="text-xs">{x.method} {x.endpoint?.path ?? x.path}</code> },
                  { header: 'Status', cell: (x) => <HttpStatus code={x.statusCode} /> },
                  { header: 'Cost', cell: (x) => <span className="tabular-nums">{money(x.price, { digits: 4 })}</span>, className: 'text-right' },
                  { header: 'When', cell: (x) => <span className="text-muted-foreground">{relative(x.createdAt)}</span> },
                ]}
              />
            )}
          </QueryView>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">Popular APIs</h2>
          <div className="space-y-2">
            {(apis.data?.items ?? []).map((p) => (
              <Link key={p.id} href={`/marketplace/${p.slug}`} className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm hover:border-primary/40">
                <span className="font-medium">{p.name}</span>
                <span className="tabular-nums text-muted-foreground">{money(p.pricePerRequest, { digits: 4 })}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
