'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { DataTable } from '@/components/data-table';
import { SimpleBarChart } from '@/components/charts';
import { StatusBadge } from '@/components/status-badge';
import { LoadingCards, QueryView } from '@/components/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { useApi } from '@/lib/query';
import { date, money, num } from '@/lib/utils';

interface Data {
  byProvider: { providerId: string; name: string; calls: number; actualCost: string; estimatedCost: string; callsWithoutCostData: number }[];
  totals: { actual: string; estimated: string; fixedSubscriptionFeesProrated: string; unknownCount: number };
  subscriptions: { id: string; planName: string; status: string; monthlyFee: string | null; expiresAt: string | null; usageLimitPerMonth: number | null; provider: { name: string } }[];
}

export default function SupplierCosts() {
  const [days, setDays] = useState('30');
  const q = useApi<Data>(`/api/admin/analytics/supplier-costs?days=${days}`);
  return (
    <>
      <PageHeader title="Supplier costs" description="Actual (contractual) and estimated per-call costs are reported separately. Calls with no configured cost are counted — never guessed." actions={<Select className="w-36" value={days} onValueChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />} />
      <QueryView q={q} loading={<LoadingCards />}>
        {(d) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Actual per-call cost" value={money(d.totals.actual)} />
              <StatCard label="Estimated per-call cost" value={money(d.totals.estimated)} tone="warning" />
              <StatCard label="Fixed subscription fees" value={money(d.totals.fixedSubscriptionFeesProrated)} hint="prorated for period" />
              <StatCard label="Calls without cost data" value={num(d.totals.unknownCount)} tone={d.totals.unknownCount ? 'danger' : 'default'} />
            </div>
            <Card className="mt-6"><CardHeader><CardTitle>Cost by provider</CardTitle></CardHeader><CardContent><SimpleBarChart data={d.byProvider} xKey="name" valueFormatter={(v) => `$${v.toFixed(2)}`} series={[{ key: 'actualCost', label: 'Actual' }, { key: 'estimatedCost', label: 'Estimated', color: 'hsl(var(--chart-4))' }]} /></CardContent></Card>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div><h2 className="mb-3 text-sm font-semibold">By provider</h2><DataTable rows={d.byProvider} rowKey={(r) => r.providerId} columns={[
                { header: 'Provider', cell: (r) => r.name },
                { header: 'Calls', className: 'text-right', cell: (r) => num(r.calls) },
                { header: 'Actual', className: 'text-right', cell: (r) => money(r.actualCost) },
                { header: 'Estimated', className: 'text-right', cell: (r) => money(r.estimatedCost) },
                { header: 'No cost data', className: 'text-right', cell: (r) => num(r.callsWithoutCostData) },
              ]} /></div>
              <div><h2 className="mb-3 text-sm font-semibold">Active supplier subscriptions</h2><DataTable rows={d.subscriptions} rowKey={(r) => r.id} empty={{ title: 'None recorded' }} columns={[
                { header: 'Provider', cell: (r) => r.provider.name },
                { header: 'Plan', cell: (r) => r.planName },
                { header: 'Fee', cell: (r) => (r.monthlyFee ? `${money(r.monthlyFee)}/mo` : '—') },
                { header: 'Expires', cell: (r) => date(r.expiresAt) },
                { header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
              ]} /></div>
            </div>
          </>
        )}
      </QueryView>
    </>
  );
}
