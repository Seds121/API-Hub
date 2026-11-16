'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { SimpleBarChart, TimeAreaChart } from '@/components/charts';
import { DataTable } from '@/components/data-table';
import { HttpStatus, MethodBadge } from '@/components/status-badge';
import { LoadingCards, QueryView } from '@/components/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/lib/query';
import type { ApiKeyRow, UsageRecord, UsageSummary } from '@/lib/dash-types';
import type { Paged } from '@/lib/types';
import { date, money, num } from '@/lib/utils';

export default function UsagePage() {
  const [days, setDays] = useState('30');
  const [productId, setProductId] = useState('');
  const [apiKeyId, setApiKeyId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const f = new URLSearchParams({ days, ...(productId ? { productId } : {}), ...(apiKeyId ? { apiKeyId } : {}) });
  const summary = useApi<UsageSummary>(`/api/usage/summary?${f}`);
  const records = useApi<Paged<UsageRecord>>(`/api/usage/records?${f}&page=${page}&pageSize=25${status ? `&status=${status}` : ''}`);
  const keys = useApi<ApiKeyRow[]>('/api/keys', ['keys']);
  const apiOptions = [{ value: '', label: 'All APIs' }, ...(summary.data?.byApi ?? []).map((a) => ({ value: a.productId, label: a.name }))];
  return (
    <>
      <PageHeader
        title="Usage"
        description="Request history, consumption by API and spend over time. Data is retained according to the platform retention policy."
        actions={
          <div className="flex flex-wrap gap-2">
            <Select className="w-36" value={days} onValueChange={(v) => (setDays(v), setPage(1))} options={[{ value: '1', label: 'Last 24 hours' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} />
            <Select className="w-44" value={productId} onValueChange={(v) => (setProductId(v), setPage(1))} options={apiOptions} />
            <Select className="w-44" value={apiKeyId} onValueChange={(v) => (setApiKeyId(v), setPage(1))} options={[{ value: '', label: 'All keys' }, ...(keys.data ?? []).map((k) => ({ value: k.id, label: k.name }))]} />
          </div>
        }
      />
      <QueryView q={summary} loading={<LoadingCards />}>
        {(s) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Requests" value={num(s.totals.requests)} />
              <StatCard label="Successful" value={num(s.totals.successful)} tone="success" />
              <StatCard label="Failed" value={num(s.totals.failed)} tone={s.totals.failed ? 'danger' : 'default'} />
              <StatCard label="Spend" value={money(s.totals.spend)} hint={`avg latency ${s.totals.avgLatencyMs} ms`} />
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Requests by date</CardTitle></CardHeader>
                <CardContent><TimeAreaChart data={s.series} series={[{ key: 'successful', label: 'Successful' }, { key: 'failed', label: 'Failed', color: 'hsl(var(--destructive))' }]} /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Spend by date</CardTitle></CardHeader>
                <CardContent><TimeAreaChart data={s.series} series={[{ key: 'spend', label: 'Spend (USD)' }]} valueFormatter={(v) => `$${v.toFixed(2)}`} /></CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>Usage by API</CardTitle></CardHeader>
                <CardContent><SimpleBarChart data={s.byApi} xKey="name" horizontal series={[{ key: 'requests', label: 'Requests' }]} height={Math.max(160, s.byApi.length * 44)} /></CardContent>
              </Card>
            </div>
          </>
        )}
      </QueryView>
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Request history</h2>
          <Select className="w-36" value={status} onValueChange={(v) => (setStatus(v), setPage(1))} options={[{ value: '', label: 'All statuses' }, { value: 'success', label: 'Successful' }, { value: 'error', label: 'Errors' }]} />
        </div>
        <QueryView q={records}>
          {(r) => (
            <DataTable
              rows={r.items}
              rowKey={(x) => x.id}
              dense
              pagination={{ page: r.page, pageCount: r.pageCount, total: r.total, onPage: setPage }}
              empty={{ title: 'No requests in this period' }}
              columns={[
                { header: 'Timestamp', cell: (x) => <span className="whitespace-nowrap text-xs">{date(x.createdAt, true)}</span> },
                { header: 'API', cell: (x) => x.product?.name ?? '—' },
                { header: 'Endpoint', cell: (x) => (<span className="flex items-center gap-2"><MethodBadge method={x.method} /><code className="text-xs">{x.endpoint?.path ?? x.path}</code></span>) },
                { header: 'Status', cell: (x) => (<span className="flex items-center gap-1.5"><HttpStatus code={x.statusCode} />{x.errorCode && <span className="text-[11px] text-muted-foreground">{x.errorCode}</span>}</span>) },
                { header: 'Latency', cell: (x) => <span className="tabular-nums">{x.latencyMs} ms</span>, className: 'text-right' },
                { header: 'Cost', cell: (x) => (<span className="tabular-nums">{money(x.price, { digits: 4 })}{x.coveredBySubscription && <Badge variant="secondary" className="ml-1">plan</Badge>}</span>), className: 'text-right' },
                { header: 'Key', cell: (x) => <code className="text-[11px] text-muted-foreground">{x.apiKey?.prefix ?? '—'}</code> },
                { header: 'Request ID', cell: (x) => <code className="text-[11px] text-muted-foreground" title={x.correlationId}>{x.correlationId.slice(0, 8)}</code> },
              ]}
            />
          )}
        </QueryView>
      </div>
    </>
  );
}
