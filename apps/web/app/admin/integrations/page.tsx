'use client';
import Link from 'next/link';
import { useState } from 'react';
import { FlaskConical, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { MethodBadge, StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { IntegrationEditor, IntegrationTester } from '@/components/admin/integration-dialogs';
import { useApi } from '@/lib/query';
import type { Integration } from '@/lib/admin-types';
import type { ParamDef } from '@/lib/types';
import { money, relative } from '@/lib/utils';

export default function IntegrationsPage() {
  const q = useApi<Integration[]>('/api/admin/integrations', ['admin-integrations']);
  const [test, setTest] = useState<Integration | null>(null);
  const [edit, setEdit] = useState<Integration | null>(null);
  const inv = [['admin-integrations']];
  return (
    <>
      <PageHeader title="API integrations" description="Mappings from public endpoints to upstream provider calls (RapidAPI connector or direct REST). Test any integration with stored credentials." />
      <QueryView q={q}>
        {(rows) => (
          <DataTable rows={rows} rowKey={(i) => i.id} searchPlaceholder="Search API, provider or path" columns={[
            { header: 'Public endpoint', searchValue: (i) => `${i.endpoint?.product.name} ${i.provider?.name} ${i.upstreamPath} ${i.endpoint?.path}`, cell: (i) => (<div><Link href={`/admin/products/${i.endpoint?.product.id}`} className="text-sm font-medium hover:underline">{i.endpoint?.product.name}</Link><span className="flex items-center gap-2"><MethodBadge method={i.endpoint?.method ?? 'GET'} /><code className="text-xs">{i.endpoint?.path}</code></span></div>) },
            { header: 'Provider', cell: (i) => <Link href={`/admin/providers/${i.provider?.id}`} className="hover:underline">{i.provider?.name}</Link> },
            { header: 'Upstream', cell: (i) => <code className="text-xs">{i.upstreamMethod} {i.upstreamPath}</code> },
            { header: 'Priority', cell: (i) => i.priority },
            { header: 'Cost', cell: (i) => (i.costPerCall ? <span className="text-xs">{money(i.costPerCall, { digits: 6 })}{i.costIsEstimated ? ' est.' : ''}</span> : <span className="text-xs text-muted-foreground">unknown</span>) },
            { header: 'Last test', cell: (i) => (i.lastTestedAt ? <span className="text-xs" title={i.lastTestError ?? ''}>{i.lastTestOk ? '✓' : '✗'} {relative(i.lastTestedAt)}</span> : '—') },
            { header: 'Status', cell: (i) => <StatusBadge status={i.isActive ? 'ACTIVE' : 'DISABLED'} /> },
            { header: '', cell: (i) => (<div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setTest(i)}><FlaskConical /> Test</Button><Button size="icon" variant="ghost" aria-label="Edit integration" onClick={() => setEdit(i)}><Pencil /></Button></div>) },
          ]} />
        )}
      </QueryView>
      {test && <IntegrationTester integration={test} params={(test.endpoint?.params as ParamDef[]) ?? []} onClose={() => setTest(null)} invalidate={inv} />}
      {edit && <IntegrationEditor key={edit.id} open onOpenChange={(o) => !o && setEdit(null)} initial={edit} invalidate={inv} />}
    </>
  );
}
