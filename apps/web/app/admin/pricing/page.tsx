'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { call, useAction, useApi } from '@/lib/query';
import type { OrgRow } from '@/lib/admin-types';
import type { Paged } from '@/lib/types';
import { date, money } from '@/lib/utils';

interface Rule { id: string; scope: string; pricePerRequest: string; discountPercent: string | null; minWalletBalance: string | null; chargeOnClientError: boolean; isActive: boolean; validFrom: string; validTo: string | null; product: { id: string; name: string } | null; endpoint: { id: string; name: string; method: string; path: string } | null; org: { id: string; name: string } | null }
interface Prod { id: string; name: string; endpoints?: { id: string; method: string; path: string }[] }

export default function PricingPage() {
  const [productId, setProductId] = useState('');
  const rules = useApi<Rule[]>(`/api/admin/pricing${productId ? `?productId=${productId}` : ''}`, ['admin-pricing', productId]);
  const products = useApi<Prod[]>('/api/admin/products', ['admin-products', '']);
  const orgs = useApi<Paged<OrgRow>>('/api/admin/organizations?pageSize=200', ['admin-orgs-all']);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ scope: 'ORGANIZATION', productId: '', endpointId: '', orgId: '', pricePerRequest: '', discountPercent: '', minWalletBalance: '', chargeOnClientError: false, validTo: '' });
  const detail = useApi<{ endpoints: { id: string; method: string; path: string }[] }>(v.productId ? `/api/admin/products/${v.productId}` : null, ['admin-product', v.productId]);
  const create = useAction(() => call('/api/admin/pricing', { method: 'POST', body: { scope: v.scope, productId: v.scope === 'ENDPOINT' ? null : v.productId || null, endpointId: v.endpointId || null, orgId: v.orgId || null, pricePerRequest: v.pricePerRequest, discountPercent: v.discountPercent || null, minWalletBalance: v.minWalletBalance || null, chargeOnClientError: v.chargeOnClientError, validTo: v.validTo ? new Date(v.validTo).toISOString() : null } }), { success: 'Pricing rule created', invalidate: [['admin-pricing']], onSuccess: () => setOpen(false) });
  const deactivate = useAction((id: string) => call(`/api/admin/pricing/${id}`, { method: 'DELETE' }), { success: 'Rule deactivated', invalidate: [['admin-pricing']] });
  const needsOrg = v.scope === 'ORGANIZATION' || v.scope === 'AGENCY_WHOLESALE';
  return (
    <>
      <PageHeader title="Pricing" description="Customer prices per API, per endpoint, per organization (enterprise / custom) and agency wholesale. Most specific active rule wins. Supplier cost is configured on integrations." actions={<Button onClick={() => setOpen(true)}><Plus /> New rule</Button>} />
      <div className="mb-3 w-64"><Select value={productId} onValueChange={setProductId} options={[{ value: '', label: 'All APIs' }, ...(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} /></div>
      <QueryView q={rules}>
        {(rows) => (
          <DataTable rows={rows} rowKey={(r) => r.id} searchPlaceholder="Search API or organization" columns={[
            { header: 'Scope', searchValue: (r) => `${r.product?.name} ${r.org?.name ?? ''} ${r.scope}`, cell: (r) => <Badge variant="secondary">{r.scope.toLowerCase().replace('_', ' ')}</Badge> },
            { header: 'API / endpoint', cell: (r) => (<div className="text-sm">{r.product?.name ?? '—'}{r.endpoint && <code className="ml-1 text-xs">{r.endpoint.method} {r.endpoint.path}</code>}</div>) },
            { header: 'Organization', cell: (r) => r.org?.name ?? <span className="text-muted-foreground">everyone</span> },
            { header: 'Price / request', className: 'text-right', cell: (r) => <span className="tabular-nums">{money(r.pricePerRequest, { digits: 6 })}</span> },
            { header: 'Discount', cell: (r) => (r.discountPercent ? `${Number(r.discountPercent)}%` : '—') },
            { header: 'Bills 4xx', cell: (r) => (r.chargeOnClientError ? 'yes' : 'no') },
            { header: 'Valid', cell: (r) => <span className="text-xs">{date(r.validFrom)} → {r.validTo ? date(r.validTo) : '∞'}</span> },
            { header: 'Status', cell: (r) => <StatusBadge status={r.isActive ? 'ACTIVE' : 'EXPIRED'} /> },
            { header: '', cell: (r) => (r.isActive ? <ConfirmDialog trigger={<Button variant="ghost" size="icon" aria-label="Deactivate rule"><Trash2 /></Button>} title="Deactivate pricing rule?" description="If this is the only price for an API, requests will be refused until a new price is set." destructive onConfirm={() => deactivate.mutateAsync(r.id).then(() => undefined)} /> : null) },
          ]} />
        )}
      </QueryView>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New pricing rule</DialogTitle><DialogDescription>Example: supplier cost $0.005 → customer price $0.015 = $0.010 gross spread per request. Prices use exact decimals (6 places).</DialogDescription></DialogHeader>
          <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), create.mutate())}>
            <Field label="Scope"><Select value={v.scope} onValueChange={(s) => setV({ ...v, scope: s })} options={[{ value: 'PRODUCT_DEFAULT', label: 'API default (list price)' }, { value: 'ENDPOINT', label: 'Endpoint price' }, { value: 'ORGANIZATION', label: 'Organization custom price' }, { value: 'AGENCY_WHOLESALE', label: 'Agency wholesale price' }]} /></Field>
            <Field label="API"><Select value={v.productId} onValueChange={(p) => setV({ ...v, productId: p, endpointId: '' })} placeholder="Select API" options={(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))} /></Field>
            {(v.scope === 'ENDPOINT' || v.scope === 'ORGANIZATION') && <Field label={v.scope === 'ENDPOINT' ? 'Endpoint' : 'Endpoint (optional)'}><Select value={v.endpointId} onValueChange={(x) => setV({ ...v, endpointId: x })} options={[...(v.scope === 'ORGANIZATION' ? [{ value: '', label: 'Whole API' }] : []), ...(detail.data?.endpoints ?? []).map((e) => ({ value: e.id, label: `${e.method} ${e.path}` }))]} /></Field>}
            {needsOrg && <Field label="Organization"><Select value={v.orgId} onValueChange={(x) => setV({ ...v, orgId: x })} placeholder="Select organization" options={(orgs.data?.items ?? []).filter((o) => v.scope !== 'AGENCY_WHOLESALE' || o.type === 'AGENCY').map((o) => ({ value: o.id, label: o.name }))} /></Field>}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Price per request (USD)" htmlFor="pr"><Input id="pr" required type="number" min={0} step="0.000001" value={v.pricePerRequest} onChange={(e) => setV({ ...v, pricePerRequest: e.target.value })} /></Field>
              <Field label="Extra discount %" htmlFor="dc"><Input id="dc" type="number" min={0} max={100} step="0.01" value={v.discountPercent} onChange={(e) => setV({ ...v, discountPercent: e.target.value })} /></Field>
              <Field label="Min wallet balance" htmlFor="mb"><Input id="mb" type="number" min={0} step="0.01" value={v.minWalletBalance} onChange={(e) => setV({ ...v, minWalletBalance: e.target.value })} /></Field>
              <Field label="Valid until" htmlFor="vt"><Input id="vt" type="date" value={v.validTo} onChange={(e) => setV({ ...v, validTo: e.target.value })} /></Field>
            </div>
            <label className="flex items-center gap-3 text-sm"><Switch checked={v.chargeOnClientError} onCheckedChange={(c) => setV({ ...v, chargeOnClientError: c })} /> Charge for upstream 4xx responses</label>
            <Button type="submit" loading={create.isPending}>Create rule</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
