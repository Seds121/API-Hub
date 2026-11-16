'use client';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { MethodBadge, StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/lib/query';
import type { ParamDef } from '@/lib/types';

interface Row { id: string; name: string; method: string; path: string; isActive: boolean; params: ParamDef[]; rateLimitPerMinute: number | null; product: { id: string; name: string; slug: string; status: string }; _count: { integrations: number } }

export default function EndpointsPage() {
  const q = useApi<Row[]>('/api/admin/endpoints', ['admin-endpoints']);
  return (
    <>
      <PageHeader title="API endpoints" description="All public routes across the catalog. Edit endpoints from their API’s page." />
      <QueryView q={q}>
        {(rows) => (
          <DataTable rows={rows} rowKey={(e) => e.id} searchPlaceholder="Search path, name or API" columns={[
            { header: 'Route', searchValue: (e) => `${e.path} ${e.name} ${e.product.name} ${e.product.slug}`, cell: (e) => (<span className="flex items-center gap-2"><MethodBadge method={e.method} /><code className="text-xs">/v1/{e.product.slug}{e.path === '/' ? '' : e.path}</code></span>) },
            { header: 'Name', cell: (e) => e.name },
            { header: 'API', cell: (e) => <Link href={`/admin/products/${e.product.id}`} className="hover:underline">{e.product.name}</Link> },
            { header: 'Params', cell: (e) => <span className="text-xs text-muted-foreground">{e.params.map((p) => p.name).join(', ') || '—'}</span> },
            { header: 'Upstreams', cell: (e) => (e._count.integrations ? e._count.integrations : <Badge variant="destructive">none</Badge>) },
            { header: 'Status', cell: (e) => <StatusBadge status={!e.isActive ? 'DISABLED' : e.product.status} /> },
          ]} />
        )}
      </QueryView>
    </>
  );
}
