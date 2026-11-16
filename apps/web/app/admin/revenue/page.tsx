'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { DataTable } from '@/components/data-table';
import { TimeAreaChart } from '@/components/charts';
import { LoadingCards, QueryView } from '@/components/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { useApi } from '@/lib/query';
import type { SeriesRow } from '@/lib/admin-types';
import { money, num } from '@/lib/utils';

interface Data {
  byProduct: { productId: string; name: string; requests: number; revenue: string; costActual: string; costEstimated: string; callsWithoutCostData: number; grossMargin: string; marginPct: string | null }[];
  revenue: { usage: string; subscriptions: string; total: string };
  costs: { actual: string; estimated: string; fixedSubscriptionFeesProrated: string; unknownCount: number };
  series: SeriesRow[];
}

export default function RevenuePage() {
  const [days, setDays] = useState('30');
  const q = useApi<Data>(`/api/admin/analytics/revenue?days=${days}`);
  return (
    <>
      <PageHeader title="Revenue & profit" description="Recognized revenue from the ledger (usage + subscription fees) against supplier costs. Margins only include known costs; calls without cost data are flagged." actions={<Select className="w-36" value={days} onValueChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '12 months' }]} />} />
      <QueryView q={q} loading={<LoadingCards />}>
        {(d) => {
          const varCost = Number(d.costs.actual) + Number(d.costs.estimated);
          const net = Number(d.revenue.total) - varCost - Number(d.costs.fixedSubscriptionFeesProrated);
          return (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Revenue" value={money(d.revenue.total)} hint={`usage ${money(d.revenue.usage)} · subscriptions ${money(d.revenue.subscriptions)}`} />
                <StatCard label="Variable supplier cost" value={money(varCost)} hint={`actual ${money(d.costs.actual)} · estimated ${money(d.costs.estimated)}`} />
                <StatCard label="Fixed supplier fees" value={money(d.costs.fixedSubscriptionFeesProrated)} hint="prorated supplier subscriptions" />
                <StatCard label="Contribution" value={money(net)} tone={net >= 0 ? 'success' : 'danger'} hint={d.costs.unknownCount ? `${num(d.costs.unknownCount)} calls lack cost data` : 'all costs known'} />
              </div>
              <Card className="mt-6">
                <CardHeader><CardTitle>Daily revenue, cost and margin</CardTitle><CardDescription>Per-request revenue vs per-call supplier cost</CardDescription></CardHeader>
                <CardContent><TimeAreaChart data={d.series} valueFormatter={(v) => `$${v.toFixed(2)}`} series={[{ key: 'revenue', label: 'Revenue' }, { key: 'margin', label: 'Margin', color: 'hsl(var(--chart-3))' }, { key: 'costActual', label: 'Cost (actual)', color: 'hsl(var(--chart-4))' }]} /></CardContent>
              </Card>
              <h2 className="mb-3 mt-8 text-sm font-semibold">Profitability by API</h2>
              <DataTable rows={d.byProduct} rowKey={(r) => r.productId} empty={{ title: 'No usage in this period' }} columns={[
                { header: 'API', cell: (r) => <span className="font-medium">{r.name}</span> },
                { header: 'Requests', className: 'text-right', cell: (r) => num(r.requests) },
                { header: 'Revenue', className: 'text-right', cell: (r) => money(r.revenue) },
                { header: 'Cost (actual)', className: 'text-right', cell: (r) => money(r.costActual) },
                { header: 'Cost (est.)', className: 'text-right', cell: (r) => money(r.costEstimated) },
                { header: 'Gross margin', className: 'text-right', cell: (r) => <span className="tabular-nums font-medium">{money(r.grossMargin)}</span> },
                { header: 'Margin %', className: 'text-right', cell: (r) => (r.marginPct ? `${r.marginPct}%` : '—') },
                { header: 'No cost data', className: 'text-right', cell: (r) => (r.callsWithoutCostData ? <span className="text-amber-600">{num(r.callsWithoutCostData)}</span> : '0') },
              ]} />
            </>
          );
        }}
      </QueryView>
    </>
  );
}
