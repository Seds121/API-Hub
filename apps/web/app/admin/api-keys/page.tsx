'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { call, useAction, useApi } from '@/lib/query';
import type { Paged } from '@/lib/types';
import { relative } from '@/lib/utils';

interface Row { id: string; name: string; prefix: string; last4: string; environment: string; scopes: string[]; rateLimitPerMinute: number | null; expiresAt: string | null; lastUsedAt: string | null; revokedAt: string | null; createdAt: string; org: { id: string; name: string } }

export default function AdminKeys() {
  const [q, setQ] = useState('');
  const [state, setState] = useState('active');
  const [page, setPage] = useState(1);
  const data = useApi<Paged<Row>>(`/api/admin/api-keys?page=${page}&pageSize=25&state=${state}${q ? `&q=${encodeURIComponent(q)}` : ''}`, ['admin-keys', q, state, page]);
  const revoke = useAction((id: string) => call(`/api/admin/api-keys/${id}/revoke`, { method: 'POST' }), { success: 'Key revoked', invalidate: [['admin-keys']] });
  return (
    <>
      <PageHeader title="API keys" description="Customer keys across all tenants. Secrets are never stored — only prefix, last 4 characters and an HMAC hash." />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <Input className="sm:max-w-xs" placeholder="Search name or prefix" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} aria-label="Search keys" />
        <Select className="sm:w-36" value={state} onValueChange={(v) => (setState(v), setPage(1))} options={[{ value: 'active', label: 'Active' }, { value: 'revoked', label: 'Revoked' }]} />
      </div>
      <QueryView q={data}>
        {(d) => (
          <DataTable rows={d.items} rowKey={(k) => k.id} pagination={{ page: d.page, pageCount: d.pageCount, total: d.total, onPage: setPage }} columns={[
            { header: 'Key', cell: (k) => (<div><p className="font-medium">{k.name}</p><code className="text-xs text-muted-foreground">{k.prefix}_••••{k.last4}</code></div>) },
            { header: 'Organization', cell: (k) => <Link href={`/admin/organizations/${k.org.id}`} className="hover:underline">{k.org.name}</Link> },
            { header: 'Env', cell: (k) => <StatusBadge status={k.environment} /> },
            { header: 'Scopes', cell: (k) => (k.scopes.includes('*') ? <Badge variant="secondary">all</Badge> : <span className="text-xs">{k.scopes.join(', ')}</span>) },
            { header: 'Last used', cell: (k) => relative(k.lastUsedAt) },
            { header: 'Status', cell: (k) => <StatusBadge status={k.revokedAt ? 'REVOKED' : 'ACTIVE'} /> },
            { header: '', cell: (k) => (!k.revokedAt ? <ConfirmDialog trigger={<Button size="sm" variant="ghost">Revoke</Button>} title="Revoke this key?" description="Use for compromised keys or abuse. The customer’s integrations using it will fail immediately." destructive confirmLabel="Revoke" onConfirm={() => revoke.mutateAsync(k.id).then(() => undefined)} /> : null) },
          ]} />
        )}
      </QueryView>
    </>
  );
}
