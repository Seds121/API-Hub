'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, FlaskConical, Pencil, Plug, Plus, Rocket, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { MethodBadge, StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ProductForm } from '@/components/admin/product-form';
import { EndpointForm } from '@/components/admin/endpoint-form';
import { IntegrationEditor, IntegrationTester } from '@/components/admin/integration-dialogs';
import { ApiError } from '@/lib/api';
import { call, useAction, useApi } from '@/lib/query';
import type { Integration } from '@/lib/admin-types';
import type { ParamDef, PublicEndpoint } from '@/lib/types';
import { money, relative } from '@/lib/utils';
import { toast } from 'sonner';

type Ep = PublicEndpoint & { isActive: boolean; maxBodyBytes: number; integrations: Integration[] };
interface Rule { id: string; scope: string; endpointId: string | null; orgId: string | null; pricePerRequest: string; discountPercent: string | null; isActive: boolean; chargeOnClientError: boolean; org: { name: string } | null }
interface Detail {
  id: string; internalCode: string; slug: string; name: string; summary: string; description: string | null; docsMarkdown: string | null; categoryId: string; tags: string[]; publisherName: string | null; usageRestrictions: string | null; isFeatured: boolean; requiresSubscription: boolean; defaultRateLimitPerMinute: number; status: string; isDemo: boolean;
  endpoints: Ep[]; pricingRules: Rule[]; licensing: { ok: boolean; missing: { providerId: string; providerName: string }[] };
}

export default function ProductAdmin() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const q = useApi<Detail>(`/api/admin/products/${id}`, ['admin-product', id]);
  const inv = [['admin-product', id], ['admin-products']];
  const [edit, setEdit] = useState(false);
  const [epEdit, setEpEdit] = useState<Ep | 'new' | null>(null);
  const [integ, setInteg] = useState<{ endpointId: string; initial: Integration | null } | null>(null);
  const [test, setTest] = useState<{ i: Integration; params: ParamDef[] } | null>(null);
  const [price, setPrice] = useState<{ endpointId: string | null } | null>(null);
  const [priceV, setPriceV] = useState({ pricePerRequest: '', chargeOnClientError: false, minWalletBalance: '' });
  const [publishProblems, setPublishProblems] = useState<string[] | null>(null);

  const update = useAction((b: object) => call(`/api/admin/products/${id}`, { method: 'PATCH', body: b }), { success: 'Saved', invalidate: inv, onSuccess: () => setEdit(false) });
  const publish = useAction(() => call(`/api/admin/products/${id}/publish`, { method: 'POST' }).catch((e) => { if (e instanceof ApiError && Array.isArray(e.details)) setPublishProblems(e.details as string[]); throw e; }), { success: 'API published', invalidate: inv });
  const setStatus = useAction((s: 'disable' | 'unpublish') => call(`/api/admin/products/${id}/${s}`, { method: 'POST' }), { success: 'Status updated', invalidate: inv });
  const del = useAction(() => call(`/api/admin/products/${id}`, { method: 'DELETE' }), { success: 'API deleted', invalidate: [['admin-products']], onSuccess: () => router.push('/admin/products') });
  const saveEp = useAction((b: object) => (epEdit === 'new' ? call(`/api/admin/products/${id}/endpoints`, { method: 'POST', body: b }) : call(`/api/admin/endpoints/${(epEdit as Ep).id}`, { method: 'PATCH', body: b })), { success: 'Endpoint saved', invalidate: inv, onSuccess: () => setEpEdit(null) });
  const delEp = useAction((eid: string) => call(`/api/admin/endpoints/${eid}`, { method: 'DELETE' }), { success: 'Endpoint deactivated', invalidate: inv });
  const savePrice = useAction(() => call('/api/admin/pricing', { method: 'POST', body: { scope: price?.endpointId ? 'ENDPOINT' : 'PRODUCT_DEFAULT', productId: price?.endpointId ? null : id, endpointId: price?.endpointId ?? null, pricePerRequest: priceV.pricePerRequest, chargeOnClientError: priceV.chargeOnClientError, minWalletBalance: priceV.minWalletBalance || null } }), { success: 'Price saved', invalidate: inv, onSuccess: () => setPrice(null) });

  return (
    <>
      <Link href="/admin/products" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Catalog</Link>
      <QueryView q={q}>
        {(p) => {
          const def = p.pricingRules.find((r) => r.scope === 'PRODUCT_DEFAULT' && r.isActive);
          const epPrice = (eid: string) => p.pricingRules.find((r) => r.scope === 'ENDPOINT' && r.endpointId === eid && r.isActive);
          return (
            <>
              <PageHeader
                title={p.name}
                badge={<><StatusBadge status={p.status} />{p.isDemo && <Badge variant="warning">demo</Badge>}</>}
                description={<span><code>{p.internalCode}</code> · <code>/v1/{p.slug}</code> · {p.summary}</span>}
                actions={
                  <>
                    {p.status === 'PUBLISHED' && <Button asChild variant="ghost"><Link href={`/marketplace/${p.slug}`} target="_blank"><ExternalLink /> View</Link></Button>}
                    <Button variant="outline" onClick={() => setEdit(true)}><Pencil /> Edit</Button>
                    {p.status !== 'PUBLISHED' ? (
                      <Button onClick={() => (setPublishProblems(null), publish.mutate())} loading={publish.isPending}><Rocket /> Publish</Button>
                    ) : (
                      <>
                        <Button variant="outline" onClick={() => setStatus.mutate('unpublish')}>Unpublish</Button>
                        <ConfirmDialog trigger={<Button variant="destructive">Disable</Button>} title="Disable this API?" description="Customers will immediately receive 404 for this API." destructive confirmLabel="Disable" onConfirm={() => setStatus.mutateAsync('disable').then(() => undefined)} />
                      </>
                    )}
                    <ConfirmDialog trigger={<Button variant="ghost" size="icon" aria-label="Delete API"><Trash2 /></Button>} title="Delete API?" description="The API is removed from the catalog. Historical usage is retained." destructive confirmLabel="Delete" onConfirm={() => del.mutateAsync().then(() => undefined)} />
                  </>
                }
              />
              {publishProblems && (
                <Card className="mb-4 border-destructive/40">
                  <CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-4 w-4" /> Cannot publish yet</CardTitle></CardHeader>
                  <CardContent><ul className="list-disc space-y-1 pl-5 text-sm">{publishProblems.map((x) => <li key={x}>{x}</li>)}</ul></CardContent>
                </Card>
              )}
              <div className="mb-6 grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader><CardTitle>Licensing</CardTitle><CardDescription>Redistribution rights for upstream providers</CardDescription></CardHeader>
                  <CardContent className="text-sm">
                    {p.licensing.ok ? (
                      <p className="flex items-center gap-2 text-success"><CheckCircle2 className="h-4 w-4" /> All upstream providers licensed</p>
                    ) : p.licensing.missing.length ? (
                      <ul className="space-y-1">{p.licensing.missing.map((m) => <li key={m.providerId} className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-4 w-4" /><Link className="underline" href={`/admin/providers/${m.providerId}`}>{m.providerName}</Link> — license not verified</li>)}</ul>
                    ) : (
                      <p className="text-muted-foreground">Add an integration to see license coverage.</p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Default price</CardTitle><CardDescription>Per successful request</CardDescription></CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <span className="text-2xl font-semibold tabular-nums">{def ? money(def.pricePerRequest, { digits: 6 }) : '—'}</span>
                    <Button size="sm" variant="outline" onClick={() => (setPrice({ endpointId: null }), setPriceV({ pricePerRequest: def?.pricePerRequest ?? '', chargeOnClientError: def?.chargeOnClientError ?? false, minWalletBalance: '' }))}>Set price</Button>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Customer overrides</CardTitle><CardDescription>Enterprise / agency pricing</CardDescription></CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {p.pricingRules.filter((r) => r.isActive && (r.scope === 'ORGANIZATION' || r.scope === 'AGENCY_WHOLESALE')).map((r) => <p key={r.id} className="flex justify-between"><span>{r.org?.name}</span><span className="tabular-nums">{money(r.pricePerRequest, { digits: 6 })}</span></p>)}
                    <Link href="/admin/pricing" className="text-xs text-primary underline">Manage pricing →</Link>
                  </CardContent>
                </Card>
              </div>
              <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Endpoints</h2><Button size="sm" onClick={() => setEpEdit('new')}><Plus /> Add endpoint</Button></div>
              <div className="space-y-3">
                {p.endpoints.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No endpoints yet.</p>}
                {p.endpoints.map((e) => (
                  <Card key={e.id} className={e.isActive ? '' : 'opacity-60'}>
                    <CardContent className="space-y-3 pt-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <MethodBadge method={e.method} />
                        <code className="text-sm">/v1/{p.slug}{e.path === '/' ? '' : e.path}</code>
                        <span className="text-sm text-muted-foreground">{e.name}</span>
                        {!e.isActive && <Badge variant="secondary">inactive</Badge>}
                        <span className="ml-auto text-sm tabular-nums">{epPrice(e.id) ? money(epPrice(e.id)!.pricePerRequest, { digits: 6 }) : <span className="text-muted-foreground">default price</span>}</span>
                        <Button size="sm" variant="ghost" onClick={() => (setPrice({ endpointId: e.id }), setPriceV({ pricePerRequest: epPrice(e.id)?.pricePerRequest ?? '', chargeOnClientError: false, minWalletBalance: '' }))}>Price</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEpEdit(e)}><Pencil /></Button>
                        {e.isActive && <ConfirmDialog trigger={<Button size="sm" variant="ghost" aria-label="Deactivate endpoint"><Trash2 /></Button>} title="Deactivate endpoint?" description="Customers will receive 404 for this route." destructive onConfirm={() => delEp.mutateAsync(e.id).then(() => undefined)} />}
                      </div>
                      <div className="rounded-md border">
                        {e.integrations.length === 0 ? (
                          <div className="flex items-center justify-between p-3 text-sm"><span className="flex items-center gap-2 text-amber-600"><AlertTriangle className="h-4 w-4" /> No upstream integration</span><Button size="sm" onClick={() => setInteg({ endpointId: e.id, initial: null })}><Plug /> Connect provider</Button></div>
                        ) : (
                          <DataTable rows={e.integrations} rowKey={(i) => i.id} dense columns={[
                            { header: 'Priority', cell: (i) => i.priority },
                            { header: 'Provider', cell: (i) => (<span>{i.provider?.name} <StatusBadge status={i.provider?.status} /></span>) },
                            { header: 'Upstream', cell: (i) => <code className="text-xs">{i.upstreamMethod} {i.upstreamPath}</code> },
                            { header: 'Supplier cost', cell: (i) => (i.costPerCall ? <span className="text-xs">{money(i.costPerCall, { digits: 6 })} {i.costIsEstimated ? '(est.)' : '(actual)'}</span> : <span className="text-xs text-muted-foreground">unknown</span>) },
                            { header: 'Last test', cell: (i) => (i.lastTestedAt ? <span className="text-xs">{i.lastTestOk ? '✓' : '✗'} {relative(i.lastTestedAt)}</span> : '—') },
                            { header: '', cell: (i) => (<div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setTest({ i, params: e.params })}><FlaskConical /> Test</Button><Button size="sm" variant="ghost" onClick={() => setInteg({ endpointId: e.id, initial: i })}><Pencil /></Button></div>) },
                          ]} />
                        )}
                        {e.integrations.length > 0 && <div className="border-t p-2 text-right"><Button size="sm" variant="ghost" onClick={() => setInteg({ endpointId: e.id, initial: null })}><Plus /> Failover provider</Button></div>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Dialog open={edit} onOpenChange={setEdit}><DialogContent wide><DialogHeader><DialogTitle>Edit API</DialogTitle></DialogHeader><ProductForm isEdit initial={p} onSubmit={(b) => update.mutate(b)} submitting={update.isPending} /></DialogContent></Dialog>
              <Dialog open={!!epEdit} onOpenChange={(o) => !o && setEpEdit(null)}><DialogContent wide><DialogHeader><DialogTitle>{epEdit === 'new' ? 'Add endpoint' : 'Edit endpoint'}</DialogTitle></DialogHeader>{epEdit && <EndpointForm initial={epEdit === 'new' ? undefined : epEdit} onSubmit={(b) => saveEp.mutate(b)} submitting={saveEp.isPending} />}</DialogContent></Dialog>
              {integ && <IntegrationEditor key={integ.initial?.id ?? `new-${integ.endpointId}`} open onOpenChange={(o) => !o && setInteg(null)} endpointId={integ.endpointId} initial={integ.initial} invalidate={inv} />}
              {test && <IntegrationTester integration={test.i} params={test.params} onClose={() => setTest(null)} invalidate={inv} />}
              <Dialog open={!!price} onOpenChange={(o) => !o && setPrice(null)}>
                <DialogContent>
                  <DialogHeader><DialogTitle>{price?.endpointId ? 'Endpoint price' : 'Default price'}</DialogTitle></DialogHeader>
                  <form className="grid gap-4" onSubmit={(ev) => { ev.preventDefault(); if (!priceV.pricePerRequest) return toast.error('Enter a price'); savePrice.mutate(); }}>
                    <Field label="Customer price per request (USD)" hint="Up to 6 decimals. Replaces the current active price; history is kept." htmlFor="pp"><Input id="pp" type="number" min={0} step="0.000001" value={priceV.pricePerRequest} onChange={(ev) => setPriceV({ ...priceV, pricePerRequest: ev.target.value })} /></Field>
                    <Field label="Minimum wallet balance after charge (USD)" hint="Optional" htmlFor="mw"><Input id="mw" type="number" min={0} step="0.01" value={priceV.minWalletBalance} onChange={(ev) => setPriceV({ ...priceV, minWalletBalance: ev.target.value })} /></Field>
                    <label className="flex items-center gap-3 text-sm"><Switch checked={priceV.chargeOnClientError} onCheckedChange={(c) => setPriceV({ ...priceV, chargeOnClientError: c })} /> Also charge for upstream 4xx responses</label>
                    <Button type="submit" loading={savePrice.isPending}>Save price</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          );
        }}
      </QueryView>
    </>
  );
}
