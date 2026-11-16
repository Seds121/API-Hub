'use client';
import { useState } from 'react';
import { Activity, AlertTriangle, Boxes, DollarSign, Server, TrendingUp, Users, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { DonutChart, SimpleBarChart, TimeAreaChart } from '@/components/charts';
import { LoadingCards, QueryView } from '@/components/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { useApi } from '@/lib/query';
import type { Overview, SeriesRow } from '@/lib/admin-types';
import { money, num } from '@/lib/utils';

interface Breakdown { popularity: { name: string; requests: number }[]; providers: { name: string; status: string; availabilityPct: number | null }[]; topCustomers: { org: { name: string } | undefined; requests: number; revenue: string }[] }

export default function AdminOverview() {
  const [gran, setGran] = useState<'minute' | 'hour' | 'day'>('day');
  const ov = useApi<Overview>('/api/admin/analytics/overview', ['admin-overview'], { refetchInterval: 30_000 });
  const ts = useApi<SeriesRow[]>(`/api/admin/analytics/timeseries?granularity=${gran}&days=30`, ['admin-ts', gran], { refetchInterval: gran === 'minute' ? 15_000 : undefined });
  const bd = useApi<Breakdown>('/api/admin/analytics/breakdown?days=30');
  return (
    <>
      <PageHeader title="Platform overview" description="Live commercial and operational health. Supplier costs distinguish actual, estimated and unknown." actions={<Select className="w-40" value={gran} onValueChange={(v) => setGran(v as typeof gran)} options={[{ value: 'minute', label: 'Per minute (1h)' }, { value: 'hour', label: 'Per hour (14d)' }, { value: 'day', label: 'Per day (30d)' }]} />} />
      <QueryView q={ov} loading={<LoadingCards count={8} />}>
        {(o) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Customers" value={num(o.totalCustomers)} hint={`${num(o.activeCustomers)} active (30d)`} icon={Users} />
              <StatCard label="Active APIs" value={num(o.activeApis)} hint={`${num(o.totalProviders)} providers`} icon={Boxes} />
              <StatCard label="Requests today" value={num(o.requestsToday)} hint={`${num(o.requestsThisMonth)} this month`} icon={Activity} />
              <StatCard label="Failed (month)" value={num(o.failedRequestsThisMonth)} icon={XCircle} tone={o.failedRequestsThisMonth ? 'warning' : 'default'} hint={o.requestsThisMonth ? `${((o.failedRequestsThisMonth / o.requestsThisMonth) * 100).toFixed(1)}% of requests` : undefined} />
              <StatCard label="Revenue (month)" value={money(o.revenueThisMonth)} icon={DollarSign} hint={`usage ${money(o.revenueBreakdown.usage)} · subs ${money(o.revenueBreakdown.subscriptions)}`} />
              <StatCard label="Supplier spend (month)" value={money(Number(o.supplierCostThisMonth.actual) + Number(o.supplierCostThisMonth.estimated))} icon={Server} hint={`actual ${money(o.supplierCostThisMonth.actual)} · est. ${money(o.supplierCostThisMonth.estimated)} · fixed fees ${money(o.supplierCostThisMonth.fixedSubscriptionFeesProrated)}`} />
              <StatCard label="Gross margin (usage)" value={money(o.grossMarginThisMonth)} icon={TrendingUp} tone="success" hint={o.grossMarginNote ?? 'on per-call supplier costs'} />
              <StatCard label="Payments collected" value={money(o.paymentsCollectedThisMonth)} hint="this month" />
            </div>
            {o.supplierCostThisMonth.unknownCount > 0 && (
              <p className="mt-4 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><AlertTriangle className="h-4 w-4 text-amber-600" /> {o.grossMarginNote} Configure supplier costs on integrations to include them.</p>
            )}
          </>
        )}
      </QueryView>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Requests</CardTitle><CardDescription>Successful vs failed</CardDescription></CardHeader>
          <CardContent><QueryView q={ts}>{(d) => <TimeAreaChart data={d} granularity={gran} series={[{ key: 'successful', label: 'Successful' }, { key: 'failed', label: 'Failed', color: 'hsl(var(--destructive))' }]} />}</QueryView></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Revenue vs supplier cost</CardTitle><CardDescription>Per-request revenue, actual and estimated costs</CardDescription></CardHeader>
          <CardContent><QueryView q={ts}>{(d) => <TimeAreaChart data={d} granularity={gran} valueFormatter={(v) => `$${v.toFixed(2)}`} series={[{ key: 'revenue', label: 'Revenue' }, { key: 'costActual', label: 'Cost (actual)', color: 'hsl(var(--chart-4))' }, { key: 'costEstimated', label: 'Cost (estimated)', color: 'hsl(var(--chart-5))' }]} />}</QueryView></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Latency</CardTitle><CardDescription>Gateway total vs supplier response time (ms)</CardDescription></CardHeader>
          <CardContent><QueryView q={ts}>{(d) => <TimeAreaChart data={d} granularity={gran} series={[{ key: 'avgLatencyMs', label: 'Total' }, { key: 'avgUpstreamLatencyMs', label: 'Supplier', color: 'hsl(var(--chart-2))' }]} />}</QueryView></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>API popularity</CardTitle><CardDescription>Requests by API (30 days)</CardDescription></CardHeader>
          <CardContent><QueryView q={bd}>{(d) => <SimpleBarChart data={d.popularity} xKey="name" horizontal series={[{ key: 'requests', label: 'Requests' }]} />}</QueryView></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Provider availability</CardTitle><CardDescription>Health-check success rate (30 days)</CardDescription></CardHeader>
          <CardContent><QueryView q={bd}>{(d) => <SimpleBarChart data={d.providers.map((p) => ({ name: p.name, availability: p.availabilityPct ?? 0 }))} xKey="name" horizontal series={[{ key: 'availability', label: 'Availability %', color: 'hsl(var(--chart-3))' }]} />}</QueryView></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Provider status</CardTitle></CardHeader>
          <CardContent><QueryView q={ov}>{(o) => <DonutChart data={Object.entries(o.providerAvailability).map(([name, value]) => ({ name, value }))} />}</QueryView></CardContent>
        </Card>
      </div>
    </>
  );
}
