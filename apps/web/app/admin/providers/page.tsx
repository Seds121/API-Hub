'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProviderForm } from '@/components/admin/provider-form';
import { call, useAction, useApi } from '@/lib/query';
import type { Provider } from '@/lib/admin-types';
import { date, relative } from '@/lib/utils';

export default function ProvidersPage() {
  const router = useRouter();
  const q = useApi<Provider[]>('/api/admin/providers', ['admin-providers']);
  const [open, setOpen] = useState(false);
  const create = useAction((b: object) => call<Provider>('/api/admin/providers', { method: 'POST', body: b }), { success: 'Provider created — add a credential and a license next', invalidate: [['admin-providers']], onSuccess: (p) => router.push(`/admin/providers/${p.id}`) });
  return (
    <>
      <PageHeader title="API providers" description="Suppliers we buy authorized access from: RapidAPI listings and direct REST providers." actions={<Button onClick={() => setOpen(true)}><Plus /> Add provider</Button>} />
      <QueryView q={q}>
        {(rows) => (
          <DataTable
            rows={rows}
            rowKey={(p) => p.id}
            onRowClick={(p) => router.push(`/admin/providers/${p.id}`)}
            searchPlaceholder="Search providers"
            empty={{ title: 'No providers yet' }}
            columns={[
              { header: 'Provider', searchValue: (p) => `${p.name} ${p.slug} ${p.baseUrl}`, cell: (p) => (<div><Link href={`/admin/providers/${p.id}`} className="font-medium hover:underline">{p.name}</Link>{p.isMock && <Badge variant="warning" className="ml-2">mock</Badge>}<p className="font-mono text-xs text-muted-foreground">{p.baseUrl}</p></div>) },
              { header: 'Type', cell: (p) => <Badge variant="secondary">{p.kind === 'RAPIDAPI' ? 'RapidAPI' : `Direct · ${p.authType}`}</Badge> },
              { header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
              { header: 'Credential', cell: (p) => (p.credentials.length ? <span className="font-mono text-xs">{p.credentials[0]!.hint}</span> : <Badge variant="destructive">missing</Badge>) },
              { header: 'License', cell: (p) => { const l = p.licenses.find((x) => x.status === 'VERIFIED' && x.redistributionAllowed); return l ? <Badge variant="success">resale OK{l.isDemo ? ' (demo)' : ''}</Badge> : <Badge variant="destructive">not verified</Badge>; } },
              { header: 'Subscription', cell: (p) => (p.subscriptions[0] ? <span className="text-xs">{p.subscriptions[0].planName}{p.subscriptions[0].expiresAt && <span className="block text-muted-foreground">exp. {date(p.subscriptions[0].expiresAt)}</span>}</span> : '—') },
              { header: 'Health', cell: (p) => (p.healthChecks[0] ? <span className="text-xs">{p.healthChecks[0].ok ? '✓' : '✗'} {relative(p.healthChecks[0].checkedAt)}</span> : <span className="text-xs text-muted-foreground">never</span>) },
              { header: 'Integrations', cell: (p) => p._count?.integrations ?? 0 },
            ]}
          />
        )}
      </QueryView>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent wide>
          <DialogHeader><DialogTitle>Add API provider</DialogTitle></DialogHeader>
          <ProviderForm onSubmit={(b) => create.mutate(b)} submitting={create.isPending} />
        </DialogContent>
      </Dialog>
    </>
  );
}
