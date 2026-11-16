'use client';
import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { call, useAction, useApi } from '@/lib/query';
import type { Plan } from '@/lib/types';
import { money, num } from '@/lib/utils';

type AdminPlan = Plan & { isPublic: boolean; isActive: boolean; sortOrder: number; _count: { subscriptions: number } };

function PlanForm({ initial, onSubmit, submitting }: { initial?: AdminPlan; onSubmit: (b: object) => void; submitting?: boolean }) {
  const [v, setV] = useState({ code: initial?.code ?? '', name: initial?.name ?? '', description: initial?.description ?? '', type: initial?.type ?? 'SUBSCRIPTION', interval: initial?.interval ?? 'MONTHLY', price: initial?.price ?? '', includedRequests: String(initial?.includedRequests ?? 0), overagePricePerRequest: initial?.overagePricePerRequest ?? '', creditGrant: initial?.creditGrant ?? '0', discountPercent: initial?.discountPercent ?? '0', rateLimitPerMinute: String(initial?.rateLimitPerMinute ?? 60), features: (initial?.features ?? []).join('\n'), isPublic: initial?.isPublic ?? true, isActive: initial?.isActive ?? true, sortOrder: String(initial?.sortOrder ?? 0) });
  const t = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...(initial ? {} : { code: v.code }), name: v.name, description: v.description || null, type: v.type, interval: v.type === 'SUBSCRIPTION' ? v.interval : null, price: v.price, includedRequests: Number(v.includedRequests), overagePricePerRequest: v.overagePricePerRequest || null, creditGrant: v.creditGrant || '0', discountPercent: v.discountPercent || '0', rateLimitPerMinute: Number(v.rateLimitPerMinute), features: v.features.split('\n').map((s) => s.trim()).filter(Boolean), isPublic: v.isPublic, isActive: v.isActive, sortOrder: Number(v.sortOrder) }); }}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Code" htmlFor="pc"><Input id="pc" required disabled={!!initial} value={v.code} onChange={t('code')} /></Field>
        <Field label="Name" htmlFor="pn"><Input id="pn" required value={v.name} onChange={t('name')} /></Field>
        <Field label="Type"><Select value={v.type} onValueChange={(x) => setV({ ...v, type: x as Plan['type'] })} options={[{ value: 'SUBSCRIPTION', label: 'Subscription' }, { value: 'PREPAID', label: 'Prepaid credit pack' }, { value: 'PAYG', label: 'Pay as you go' }, { value: 'ENTERPRISE', label: 'Enterprise' }]} /></Field>
        {v.type === 'SUBSCRIPTION' ? <Field label="Interval"><Select value={v.interval ?? 'MONTHLY'} onValueChange={(x) => setV({ ...v, interval: x as 'MONTHLY' })} options={[{ value: 'MONTHLY', label: 'Monthly' }, { value: 'ANNUAL', label: 'Annual' }]} /></Field> : <span />}
        <Field label="Price (USD)" htmlFor="pp"><Input id="pp" required type="number" min={0} step="0.01" value={v.price} onChange={t('price')} /></Field>
        <Field label="Included requests / period" htmlFor="ir"><Input id="ir" type="number" min={0} value={v.includedRequests} onChange={t('includedRequests')} /></Field>
        <Field label="Overage price / request" hint="Blank = API list price" htmlFor="op"><Input id="op" type="number" min={0} step="0.000001" value={v.overagePricePerRequest} onChange={t('overagePricePerRequest')} /></Field>
        <Field label="Credit grant (USD)" hint="Wallet credit on purchase" htmlFor="cg"><Input id="cg" type="number" min={0} step="0.01" value={v.creditGrant} onChange={t('creditGrant')} /></Field>
        <Field label="Discount on per-request prices %" htmlFor="dp"><Input id="dp" type="number" min={0} max={100} step="0.01" value={v.discountPercent} onChange={t('discountPercent')} /></Field>
        <Field label="Rate limit / min" htmlFor="rl"><Input id="rl" type="number" min={1} value={v.rateLimitPerMinute} onChange={t('rateLimitPerMinute')} /></Field>
      </div>
      <Field label="Features (one per line)" htmlFor="pf"><Textarea id="pf" rows={3} value={v.features} onChange={t('features')} /></Field>
      <Field label="Description" htmlFor="pd"><Input id="pd" value={v.description} onChange={t('description')} /></Field>
      <div className="flex gap-6 text-sm">
        <label className="flex items-center gap-2"><Switch checked={v.isPublic} onCheckedChange={(c) => setV({ ...v, isPublic: c })} /> Public</label>
        <label className="flex items-center gap-2"><Switch checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} /> Active</label>
      </div>
      <Button type="submit" loading={submitting}>{initial ? 'Save plan' : 'Create plan'}</Button>
    </form>
  );
}

export default function PlansPage() {
  const q = useApi<AdminPlan[]>('/api/admin/plans', ['admin-plans']);
  const [edit, setEdit] = useState<AdminPlan | 'new' | null>(null);
  const save = useAction((b: object) => (edit === 'new' ? call('/api/admin/plans', { method: 'POST', body: b }) : call(`/api/admin/plans/${(edit as AdminPlan).id}`, { method: 'PATCH', body: b })), { success: 'Plan saved', invalidate: [['admin-plans']], onSuccess: () => setEdit(null) });
  return (
    <>
      <PageHeader title="Subscription plans" description="Monthly/annual subscriptions, prepaid credit packs, pay-as-you-go and enterprise offerings." actions={<Button onClick={() => setEdit('new')}><Plus /> New plan</Button>} />
      <QueryView q={q}>
        {(rows) => (
          <DataTable rows={rows} rowKey={(p) => p.id} columns={[
            { header: 'Plan', cell: (p) => (<div><p className="font-medium">{p.name}</p><code className="text-xs text-muted-foreground">{p.code}</code></div>) },
            { header: 'Type', cell: (p) => <Badge variant="secondary">{p.type.toLowerCase()}{p.interval ? ` · ${p.interval.toLowerCase()}` : ''}</Badge> },
            { header: 'Price', className: 'text-right', cell: (p) => money(p.price) },
            { header: 'Included', className: 'text-right', cell: (p) => num(p.includedRequests) },
            { header: 'Discount', cell: (p) => `${Number(p.discountPercent)}%` },
            { header: 'Credit grant', cell: (p) => money(p.creditGrant) },
            { header: 'Subscribers', cell: (p) => p._count.subscriptions },
            { header: 'Status', cell: (p) => <StatusBadge status={p.isActive ? 'ACTIVE' : 'DISABLED'} /> },
            { header: '', cell: (p) => <Button size="icon" variant="ghost" aria-label="Edit plan" onClick={() => setEdit(p)}><Pencil /></Button> },
          ]} />
        )}
      </QueryView>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent wide><DialogHeader><DialogTitle>{edit === 'new' ? 'New plan' : 'Edit plan'}</DialogTitle></DialogHeader>{edit && <PlanForm initial={edit === 'new' ? undefined : edit} onSubmit={(b) => save.mutate(b)} submitting={save.isPending} />}</DialogContent>
      </Dialog>
    </>
  );
}
