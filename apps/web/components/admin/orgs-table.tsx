'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DataTable } from '../data-table';
import { StatusBadge } from '../status-badge';
import { QueryView } from '../states';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { useApi } from '@/lib/query';
import type { OrgRow } from '@/lib/admin-types';
import type { Paged } from '@/lib/types';
import { date, money } from '@/lib/utils';

export function OrgsTable({ type, showParent = true, extraFilter }: { type?: 'CUSTOMER' | 'AGENCY'; showParent?: boolean; extraFilter?: (o: OrgRow) => boolean }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const params = new URLSearchParams({ page: String(page), pageSize: '25', ...(type ? { type } : {}), ...(q ? { q } : {}), ...(status ? { status } : {}) });
  const data = useApi<Paged<OrgRow>>(`/api/admin/organizations?${params}`, ['admin-orgs', params.toString()]);
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input className="sm:max-w-xs" placeholder="Search name, email or slug" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} aria-label="Search organizations" />
        <Select className="sm:w-40" value={status} onValueChange={(v) => (setStatus(v), setPage(1))} options={[{ value: '', label: 'All statuses' }, { value: 'ACTIVE', label: 'Active' }, { value: 'SUSPENDED', label: 'Suspended' }]} />
      </div>
      <QueryView q={data}>
        {(d) => (
          <DataTable
            rows={extraFilter ? d.items.filter(extraFilter) : d.items}
            rowKey={(o) => o.id}
            onRowClick={(o) => router.push(`/admin/organizations/${o.id}`)}
            pagination={{ page: d.page, pageCount: d.pageCount, total: d.total, onPage: setPage }}
            empty={{ title: 'No organizations found' }}
            columns={[
              { header: 'Organization', cell: (o) => (<div><Link href={`/admin/organizations/${o.id}`} className="font-medium hover:underline">{o.name}</Link>{o.isDemo && <Badge variant="warning" className="ml-2">demo</Badge>}<p className="text-xs text-muted-foreground">{o.billingEmail ?? o.slug}</p></div>) },
              { header: 'Type', cell: (o) => <Badge variant="secondary">{o.parent ? 'Subaccount' : o.type.toLowerCase()}</Badge> },
              ...(showParent ? [{ header: 'Agency', cell: (o: OrgRow) => (o.parent ? <Link href={`/admin/organizations/${o.parent.id}`} className="text-xs hover:underline">{o.parent.name}</Link> : '—') }] : []),
              { header: 'Plan', cell: (o) => o.subscriptions[0]?.plan.name ?? <span className="text-muted-foreground">PAYG</span> },
              { header: 'Balance', className: 'text-right', cell: (o) => <span className="tabular-nums">{money(o.wallet?.balance)}</span> },
              { header: 'Keys', cell: (o) => o._count.apiKeys },
              { header: 'Members', cell: (o) => o._count.members },
              ...(type === 'AGENCY' ? [{ header: 'Clients', cell: (o: OrgRow) => o._count.children }, { header: 'Agreement', cell: (o: OrgRow) => (o.agencyAgreement ? <StatusBadge status={o.agencyAgreement.status} /> : <Badge variant="warning">pending</Badge>) }] : []),
              { header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
              { header: 'Since', cell: (o) => <span className="text-xs text-muted-foreground">{date(o.createdAt)}</span> },
            ]}
          />
        )}
      </QueryView>
    </div>
  );
}
