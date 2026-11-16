'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { Input } from '@/components/ui/input';
import { useApi } from '@/lib/query';
import type { Paged } from '@/lib/types';
import { money, relative } from '@/lib/utils';

interface Row { id: string; balance: string; reserved: string; creditLimit: string; lowBalanceThreshold: string; updatedAt: string; org: { id: string; name: string; type: string; status: string } }

export default function WalletsPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const d = useApi<Paged<Row>>(`/api/admin/wallets?page=${page}&pageSize=25${q ? `&q=${encodeURIComponent(q)}` : ''}`, ['admin-wallets', q, page]);
  return (
    <>
      <PageHeader title="Wallets" description="Prepaid balances, in-flight reservations and enterprise credit limits. Adjust a wallet from its organization page (every adjustment is audited)." />
      <Input className="mb-3 max-w-xs" placeholder="Search organization" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} aria-label="Search wallets" />
      <QueryView q={d}>
        {(r) => (
          <DataTable rows={r.items} rowKey={(w) => w.id} pagination={{ page: r.page, pageCount: r.pageCount, total: r.total, onPage: setPage }} columns={[
            { header: 'Organization', cell: (w) => <Link href={`/admin/organizations/${w.org.id}`} className="font-medium hover:underline">{w.org.name}</Link> },
            { header: 'Type', cell: (w) => w.org.type.toLowerCase() },
            { header: 'Balance', className: 'text-right', cell: (w) => <span className={`tabular-nums ${Number(w.balance) < 0 ? 'text-destructive' : ''}`}>{money(w.balance)}</span> },
            { header: 'Reserved', className: 'text-right', cell: (w) => <span className="tabular-nums text-muted-foreground">{money(w.reserved, { digits: 4 })}</span> },
            { header: 'Credit limit', className: 'text-right', cell: (w) => money(w.creditLimit) },
            { header: 'Low?', cell: (w) => (Number(w.balance) - Number(w.reserved) < Number(w.lowBalanceThreshold) ? <StatusBadge status="PENDING" /> : '—') },
            { header: 'Updated', cell: (w) => relative(w.updatedAt) },
          ]} />
        )}
      </QueryView>
    </>
  );
}
