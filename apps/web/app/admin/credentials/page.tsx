'use client';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { useApi } from '@/lib/query';
import type { Credential } from '@/lib/admin-types';
import { date } from '@/lib/utils';

export default function CredentialsPage() {
  const q = useApi<Credential[]>('/api/admin/credentials', ['admin-credentials']);
  return (
    <>
      <PageHeader title="Provider credentials" description="Supplier secrets are encrypted at rest (AES-256-GCM, versioned keys) and are write-only: they are never displayed, returned by the API or logged. Add or rotate credentials from the provider page." />
      <div className="mb-4 flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground"><Lock className="h-4 w-4" /> Only a non-reversible hint is shown for identification.</div>
      <QueryView q={q}>
        {(rows) => (
          <DataTable rows={rows} rowKey={(c) => c.id} searchPlaceholder="Search provider or label" columns={[
            { header: 'Provider', searchValue: (c) => `${c.provider?.name} ${c.label}`, cell: (c) => <Link href={`/admin/providers/${c.provider?.id}`} className="font-medium hover:underline">{c.provider?.name}</Link> },
            { header: 'Label', cell: (c) => c.label },
            { header: 'Type', cell: (c) => c.kind },
            { header: 'Hint', cell: (c) => <code className="text-xs">{c.hint}</code> },
            { header: 'Key version', cell: (c) => `v${c.keyVersion}` },
            { header: 'Created', cell: (c) => date(c.createdAt) },
            { header: 'Expires', cell: (c) => date(c.expiresAt) },
            { header: 'Status', cell: (c) => <StatusBadge status={c.isActive ? (c.expiresAt && new Date(c.expiresAt) < new Date() ? 'EXPIRED' : 'ACTIVE') : 'DISABLED'} /> },
          ]} />
        )}
      </QueryView>
    </>
  );
}
