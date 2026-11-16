'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { QueryView } from '@/components/states';
import { Input } from '@/components/ui/input';
import { useApi } from '@/lib/query';
import type { Paged } from '@/lib/types';
import { date } from '@/lib/utils';

interface Row { id: string; action: string; actorType: string; targetType: string | null; targetId: string | null; ip: string | null; metadata: Record<string, unknown>; createdAt: string; org: { name: string } | null; actor: { email: string; name: string } | null }

export default function AuditPage() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const d = useApi<Paged<Row>>(`/api/admin/audit-logs?page=${page}&pageSize=50${action ? `&action=${encodeURIComponent(action)}` : ''}`, ['admin-audit', action, page]);
  return (
    <>
      <PageHeader title="Audit logs" description="Append-only record of security, configuration and financial actions. Secrets are redacted before storage." />
      <Input className="mb-3 max-w-xs" placeholder="Filter by action prefix, e.g. admin.wallet" value={action} onChange={(e) => (setAction(e.target.value), setPage(1))} aria-label="Filter actions" />
      <QueryView q={d}>
        {(r) => (
          <DataTable rows={r.items} rowKey={(x) => x.id} dense pagination={{ page: r.page, pageCount: r.pageCount, total: r.total, onPage: setPage }} columns={[
            { header: 'When', cell: (x) => <span className="whitespace-nowrap text-xs">{date(x.createdAt, true)}</span> },
            { header: 'Actor', cell: (x) => <span className="text-xs">{x.actor?.email ?? x.actorType.toLowerCase()}</span> },
            { header: 'Action', cell: (x) => <code className="text-xs">{x.action}</code> },
            { header: 'Organization', cell: (x) => <span className="text-xs">{x.org?.name ?? '—'}</span> },
            { header: 'Target', cell: (x) => <span className="text-xs">{x.targetType ?? ''} <code className="text-[10px] text-muted-foreground">{x.targetId?.slice(0, 8)}</code></span> },
            { header: 'Details', cell: (x) => <code className="line-clamp-2 max-w-xs text-[10px] text-muted-foreground">{Object.keys(x.metadata ?? {}).length ? JSON.stringify(x.metadata) : ''}</code> },
            { header: 'IP', cell: (x) => <code className="text-[10px]">{x.ip ?? ''}</code> },
          ]} />
        )}
      </QueryView>
    </>
  );
}
