'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { SimpleBarChart } from '@/components/charts';
import { HttpStatus, MethodBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { useApi } from '@/lib/query';
import type { Paged } from '@/lib/types';
import { date, money, num } from '@/lib/utils';

interface Rec { id: string; correlationId: string; method: string; path: string; statusCode: number; upstreamStatus: number | null; errorCode: string | null; latencyMs: number; upstreamLatencyMs: number | null; price: string; createdAt: string; org: { id: string; name: string }; product: { name: string } | null; supplierUsage: { cost: string | null; costIsEstimated: boolean } | null }
interface Breakdown { topCustomers: { org?: { id: string; name: string }; requests: number; revenue: string }[]; topEndpoints: { endpoint?: { name: string; method: string; path: string; product: { name: string } }; requests: number; revenue: string; avgLatencyMs: number }[] }

export default function AdminUsage() {
  const [days, setDays] = useState('1');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const recs = useApi<Paged<Rec>>(`/api/admin/usage?days=${days}&page=${page}&pageSize=50${status ? `&status=${status}` : ''}`, ['admin-usage', days, status, page]);
  const bd = useApi<Breakdown>(`/api/admin/analytics/breakdown?days=${days}`, ['admin-bd', days]);
  return (
    <>
      <PageHeader title="API usage" description="Every gateway request across tenants: status, upstream status, latency, price and supplier cost. Request bodies are never stored." actions={<Select className="w-36" value={days} onValueChange={(v) => (setDays(v), setPage(1))} options={[{ value: '1', label: '24 hours' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }]} />} />
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Consumption by customer</CardTitle></CardHeader><CardContent><QueryView q={bd}>{(d) => <SimpleBarChart data={d.topCustomers.map((c) => ({ name: c.org?.name ?? '—', requests: c.requests }))} xKey="name" horizontal series={[{ key: 'requests', label: 'Requests' }]} />}</QueryView></CardContent></Card>
        <Card><CardHeader><CardTitle>Consumption by endpoint</CardTitle></CardHeader><CardContent><QueryView q={bd}>{(d) => <DataTable rows={d.topEndpoints} rowKey={(e) => `${e.endpoint?.product.name}${e.endpoint?.path}${e.endpoint?.method}`} dense columns={[{ header: 'Endpoint', cell: (e) => (<span className="text-xs">{e.endpoint?.product.name} <code>{e.endpoint?.method} {e.endpoint?.path}</code></span>) }, { header: 'Requests', className: 'text-right', cell: (e) => num(e.requests) }, { header: 'Revenue', className: 'text-right', cell: (e) => money(e.revenue) }, { header: 'Avg ms', className: 'text-right', cell: (e) => e.avgLatencyMs }]} />}</QueryView></CardContent></Card>
      </div>
      <div className="mb-3 flex justify-end"><Select className="w-36" value={status} onValueChange={(v) => (setStatus(v), setPage(1))} options={[{ value: '', label: 'All' }, { value: 'success', label: 'Successful' }, { value: 'error', label: 'Errors' }]} /></div>
      <QueryView q={recs}>
        {(r) => (
          <DataTable rows={r.items} rowKey={(x) => x.id} dense pagination={{ page: r.page, pageCount: r.pageCount, total: r.total, onPage: setPage }} empty={{ title: 'No requests in this period' }} columns={[
            { header: 'Time', cell: (x) => <span className="whitespace-nowrap text-xs">{date(x.createdAt, true)}</span> },
            { header: 'Org', cell: (x) => <Link href={`/admin/organizations/${x.org.id}`} className="text-xs hover:underline">{x.org.name}</Link> },
            { header: 'Request', cell: (x) => (<span className="flex items-center gap-1.5"><MethodBadge method={x.method} /><code className="max-w-[220px] truncate text-xs">{x.path}</code></span>) },
            { header: 'Status', cell: (x) => (<span className="flex items-center gap-1"><HttpStatus code={x.statusCode} />{x.upstreamStatus !== null && x.upstreamStatus !== x.statusCode && <span className="text-[10px] text-muted-foreground">up {x.upstreamStatus}</span>}</span>) },
            { header: 'Error', cell: (x) => <span className="text-[11px] text-muted-foreground">{x.errorCode ?? ''}</span> },
            { header: 'Latency', className: 'text-right', cell: (x) => <span className="text-xs tabular-nums">{x.latencyMs}{x.upstreamLatencyMs !== null && <span className="text-muted-foreground"> / {x.upstreamLatencyMs}</span>} ms</span> },
            { header: 'Price', className: 'text-right', cell: (x) => <span className="text-xs tabular-nums">{money(x.price, { digits: 4 })}</span> },
            { header: 'Supplier cost', className: 'text-right', cell: (x) => (x.supplierUsage ? (x.supplierUsage.cost !== null ? <span className="text-xs tabular-nums">{money(x.supplierUsage.cost, { digits: 4 })}{x.supplierUsage.costIsEstimated && ' est.'}</span> : <span className="text-xs text-amber-600">unknown</span>) : '—') },
            { header: 'ID', cell: (x) => <code className="text-[10px] text-muted-foreground" title={x.correlationId}>{x.correlationId.slice(0, 8)}</code> },
          ]} />
        )}
      </QueryView>
    </>
  );
}
