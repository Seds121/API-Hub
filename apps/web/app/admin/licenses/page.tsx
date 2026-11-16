'use client';
import Link from 'next/link';
import { Scale } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/lib/query';
import type { License } from '@/lib/admin-types';
import { date } from '@/lib/utils';

export default function LicensesPage() {
  const q = useApi<License[]>('/api/admin/licenses', ['admin-licenses']);
  return (
    <>
      <PageHeader title="Redistribution licenses" description="An API can only be published — and the gateway only routes to a provider — when a VERIFIED, unexpired license grants downstream redistribution. Agency resale additionally requires sub-resale rights. Demo licenses are ignored in production." />
      <div className="mb-4 flex items-start gap-2 rounded-md border border-primary/30 bg-accent/50 p-3 text-sm"><Scale className="mt-0.5 h-4 w-4 text-primary" /> Purchasing an API subscription does not by itself grant permission to resell. Record the supplier’s written authorization on the provider page, then verify it.</div>
      <QueryView q={q}>
        {(rows) => (
          <DataTable rows={rows} rowKey={(l) => l.id} searchPlaceholder="Search provider" columns={[
            { header: 'Provider', searchValue: (l) => `${l.provider?.name} ${l.documentRef ?? ''}`, cell: (l) => <Link href={`/admin/providers/${l.provider?.id}`} className="font-medium hover:underline">{l.provider?.name}</Link> },
            { header: 'Scope', cell: (l) => l.apiProduct?.name ?? 'All products' },
            { header: 'Rights', cell: (l) => (<div className="flex flex-wrap gap-1">{l.redistributionAllowed ? <Badge variant="success">resale</Badge> : <Badge variant="destructive">no resale</Badge>}{l.subResaleAllowed && <Badge>sub-resale</Badge>}{l.cachingAllowed && <Badge variant="secondary">cache</Badge>}{l.isDemo && <Badge variant="warning">demo</Badge>}</div>) },
            { header: 'Reference', cell: (l) => <span className="text-xs">{l.documentRef ?? '—'}</span> },
            { header: 'Verified', cell: (l) => date(l.verifiedAt) },
            { header: 'Expires', cell: (l) => date(l.expiresAt) },
            { header: 'Status', cell: (l) => <StatusBadge status={l.status} /> },
          ]} />
        )}
      </QueryView>
    </>
  );
}
