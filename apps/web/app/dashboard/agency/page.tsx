'use client';
import { useState } from 'react';
import { ArrowLeftRight, KeyRound, MoreHorizontal, Pencil, Plus, Tag, Trash2, Users } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { StatCard } from '@/components/stat-card';
import { TimeAreaChart } from '@/components/charts';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState, ErrorState, QueryView } from '@/components/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { KeyForm, KeyFormValues, SecretReveal } from '@/components/key-form';
import { ApiError } from '@/lib/api';
import { call, useAction, useApi } from '@/lib/query';
import type { ApiKeyRow } from '@/lib/dash-types';
import type { Paged, ProductSummary } from '@/lib/types';
import { date, money, newIdempotencyKey, num } from '@/lib/utils';

interface Sub { id: string; name: string; status: string; createdAt: string; monthlySpendLimit: string | null; balance: string; activeKeys: number; members: number }
interface Agreement { wholesaleDiscountPercent: string; revenueSharePercent: string; maxSubaccounts: number; allowCustomPricing: boolean; status: string }
interface Report { totalSpend: string; revenueSharePercent: string; revenueShareAccrued: string; subaccounts: { orgId: string; name: string; requests: number; spend: string }[]; series: { bucket: string; requests: number; spend: string }[] }

function KeysDialog({ sub, onClose }: { sub: Sub; onClose: () => void }) {
  const keys = useApi<ApiKeyRow[]>(`/api/agency/subaccounts/${sub.id}/keys`, ['agency-keys', sub.id]);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const create = useAction((v: KeyFormValues) => call<ApiKeyRow>(`/api/agency/subaccounts/${sub.id}/keys`, { method: 'POST', body: v }), { success: 'Key created', invalidate: [['agency-keys', sub.id], ['agency-subs']], onSuccess: (r) => (setCreating(false), setSecret(r.secret ?? null)) });
  const revoke = useAction((id: string) => call(`/api/agency/subaccounts/${sub.id}/keys/${id}`, { method: 'DELETE' }), { success: 'Key revoked', invalidate: [['agency-keys', sub.id], ['agency-subs']] });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader><DialogTitle>API keys · {sub.name}</DialogTitle><DialogDescription>Keys bill the subaccount’s wallet. Hand them to your client securely.</DialogDescription></DialogHeader>
        {secret ? (
          <SecretReveal secret={secret} onDone={() => setSecret(null)} />
        ) : creating ? (
          <KeyForm onSubmit={(v) => create.mutate(v)} submitting={create.isPending} />
        ) : (
          <>
            <QueryView q={keys}>
              {(rows) => (
                <DataTable rows={rows} rowKey={(k) => k.id} dense empty={{ title: 'No keys yet' }} columns={[
                  { header: 'Name', cell: (k) => (<div><p className="font-medium">{k.name}</p><code className="text-xs text-muted-foreground">{k.prefix}_••••{k.last4}</code></div>) },
                  { header: 'Status', cell: (k) => <StatusBadge status={k.revokedAt ? 'REVOKED' : 'ACTIVE'} /> },
                  { header: 'Created', cell: (k) => date(k.createdAt) },
                  { header: '', cell: (k) => (!k.revokedAt ? <Button variant="ghost" size="icon" aria-label="Revoke key" onClick={() => revoke.mutate(k.id)}><Trash2 /></Button> : null) },
                ]} />
              )}
            </QueryView>
            <Button onClick={() => setCreating(true)} className="w-fit"><Plus /> New key</Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AgencyPage() {
  const agreement = useApi<Agreement>('/api/agency/agreement', ['agency-agreement']);
  const subs = useApi<Sub[]>(agreement.data ? '/api/agency/subaccounts' : null, ['agency-subs']);
  const report = useApi<Report>(agreement.data ? '/api/agency/reports?days=30' : null, ['agency-report']);
  const products = useApi<Paged<ProductSummary>>('/api/catalog/products?pageSize=60&sort=name');
  const [createOpen, setCreateOpen] = useState(false);
  const [newSub, setNewSub] = useState({ name: '', monthlySpendLimit: '', ownerEmail: '' });
  const [editing, setEditing] = useState<Sub | null>(null);
  const [editLimit, setEditLimit] = useState('');
  const [transferring, setTransferring] = useState<Sub | null>(null);
  const [transfer, setTransfer] = useState({ amount: '', direction: 'to_child' });
  const [pricing, setPricing] = useState<Sub | null>(null);
  const [price, setPrice] = useState({ productId: '', pricePerRequest: '' });
  const [keysFor, setKeysFor] = useState<Sub | null>(null);
  const [idem, setIdem] = useState(() => newIdempotencyKey('xfer'));
  const inv = [['agency-subs'], ['agency-report'], ['billing']];

  const create = useAction(() => call('/api/agency/subaccounts', { method: 'POST', body: { name: newSub.name, monthlySpendLimit: newSub.monthlySpendLimit || null, ownerEmail: newSub.ownerEmail || null } }), { success: 'Subaccount created', invalidate: [...inv, ['me']], onSuccess: () => (setCreateOpen(false), setNewSub({ name: '', monthlySpendLimit: '', ownerEmail: '' })) });
  const update = useAction((v: { id: string; body: object }) => call(`/api/agency/subaccounts/${v.id}`, { method: 'PATCH', body: v.body }), { success: 'Subaccount updated', invalidate: inv, onSuccess: () => setEditing(null) });
  const doTransfer = useAction(() => call(`/api/agency/subaccounts/${transferring!.id}/transfer`, { method: 'POST', headers: { 'idempotency-key': idem }, body: transfer }), { success: 'Transfer completed', invalidate: inv, onSuccess: () => (setTransferring(null), setIdem(newIdempotencyKey('xfer'))) });
  const setResale = useAction(() => call(`/api/agency/subaccounts/${pricing!.id}/pricing`, { method: 'POST', body: price }), { success: 'Resale price set', onSuccess: () => setPricing(null) });

  if (agreement.error instanceof ApiError && agreement.error.status === 403) {
    return (
      <>
        <PageHeader title="Agency & clients" />
        <EmptyState icon={Users} title="Reseller program not active" description={agreement.error.message} action={<Button asChild variant="outline"><a href="/contact?topic=partnership">Contact partnerships</a></Button>} />
      </>
    );
  }
  if (agreement.error) return <ErrorState error={agreement.error} retry={() => agreement.refetch()} />;

  return (
    <>
      <PageHeader title="Agency & clients" description="Create client subaccounts, fund them, issue keys, set spending caps and resale prices." actions={<Button onClick={() => setCreateOpen(true)}><Plus /> New subaccount</Button>} />
      {agreement.data && report.data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Subaccounts" value={`${subs.data?.length ?? 0} / ${agreement.data.maxSubaccounts}`} icon={Users} />
          <StatCard label="Client spend (30d)" value={money(report.data.totalSpend)} />
          <StatCard label="Wholesale discount" value={`${Number(agreement.data.wholesaleDiscountPercent)}%`} hint="on list prices for your own usage" />
          <StatCard label="Revenue share accrued" value={money(report.data.revenueShareAccrued)} hint={`${Number(agreement.data.revenueSharePercent)}% of client spend, paid monthly`} />
        </div>
      )}
      <div className="mt-6">
        <QueryView q={subs}>
          {(rows) => (
            <DataTable rows={rows} rowKey={(s) => s.id} searchPlaceholder="Search clients" empty={{ title: 'No subaccounts yet', description: 'Create one per client to isolate keys, usage and billing.' }} columns={[
              { header: 'Client', searchValue: (s) => s.name, cell: (s) => (<div><p className="font-medium">{s.name}</p><p className="text-xs text-muted-foreground">since {date(s.createdAt)}</p></div>) },
              { header: 'Status', cell: (s) => <StatusBadge status={s.status} /> },
              { header: 'Balance', className: 'text-right', cell: (s) => <span className="tabular-nums">{money(s.balance)}</span> },
              { header: 'Monthly cap', className: 'text-right', cell: (s) => <span className="tabular-nums">{s.monthlySpendLimit ? money(s.monthlySpendLimit) : '—'}</span> },
              { header: 'Keys', cell: (s) => num(s.activeKeys) },
              { header: '', className: 'w-10', cell: (s) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${s.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setKeysFor(s)}><KeyRound /> API keys</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => (setTransferring(s), setTransfer({ amount: '', direction: 'to_child' }))}><ArrowLeftRight /> Transfer credit</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => (setEditing(s), setEditLimit(s.monthlySpendLimit ?? ''))}><Pencil /> Spending cap</DropdownMenuItem>
                    {agreement.data?.allowCustomPricing && <DropdownMenuItem onSelect={() => (setPricing(s), setPrice({ productId: '', pricePerRequest: '' }))}><Tag /> Resale pricing</DropdownMenuItem>}
                    <DropdownMenuItem onSelect={() => update.mutate({ id: s.id, body: { status: s.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' } })}>{s.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) },
            ]} />
          )}
        </QueryView>
      </div>
      {report.data && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>Client requests (30 days)</CardTitle></CardHeader><CardContent><TimeAreaChart data={report.data.series} series={[{ key: 'requests', label: 'Requests' }]} /></CardContent></Card>
          <Card>
            <CardHeader><CardTitle>Agency report</CardTitle><CardDescription>Usage and spend per client</CardDescription></CardHeader>
            <CardContent>
              <DataTable rows={report.data.subaccounts} rowKey={(r) => r.orgId} dense columns={[{ header: 'Client', cell: (r) => r.name }, { header: 'Requests', className: 'text-right', cell: (r) => num(r.requests) }, { header: 'Spend', className: 'text-right', cell: (r) => money(r.spend) }]} />
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New client subaccount</DialogTitle><DialogDescription>Each subaccount has its own wallet, keys and usage. You’re added as its admin.</DialogDescription></DialogHeader>
          <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), create.mutate())}>
            <Field label="Client name" htmlFor="sn"><Input id="sn" required value={newSub.name} onChange={(e) => setNewSub({ ...newSub, name: e.target.value })} /></Field>
            <Field label="Monthly spending cap (USD)" hint="Optional" htmlFor="sc"><Input id="sc" type="number" min={0} step="0.01" value={newSub.monthlySpendLimit} onChange={(e) => setNewSub({ ...newSub, monthlySpendLimit: e.target.value })} /></Field>
            <Field label="Client owner email" hint="Optional — an existing user who should own the subaccount." htmlFor="so"><Input id="so" type="email" value={newSub.ownerEmail} onChange={(e) => setNewSub({ ...newSub, ownerEmail: e.target.value })} /></Field>
            <Button type="submit" loading={create.isPending}>Create subaccount</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Spending cap · {editing?.name}</DialogTitle></DialogHeader>
          <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), update.mutate({ id: editing!.id, body: { monthlySpendLimit: editLimit || null } }))}>
            <Field label="Monthly cap (USD)" hint="Blank removes the cap." htmlFor="el"><Input id="el" type="number" min={0} step="0.01" value={editLimit} onChange={(e) => setEditLimit(e.target.value)} /></Field>
            <Button type="submit" loading={update.isPending}>Save</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!transferring} onOpenChange={(o) => !o && setTransferring(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transfer credit · {transferring?.name}</DialogTitle><DialogDescription>Moves funds between your agency wallet and the client wallet. Recorded in both ledgers.</DialogDescription></DialogHeader>
          <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), doTransfer.mutate())}>
            <Field label="Direction"><Select value={transfer.direction} onValueChange={(v) => setTransfer({ ...transfer, direction: v })} options={[{ value: 'to_child', label: 'Agency → client' }, { value: 'from_child', label: 'Client → agency' }]} /></Field>
            <Field label="Amount (USD)" htmlFor="ta"><Input id="ta" required type="number" min={0.01} step="0.01" value={transfer.amount} onChange={(e) => setTransfer({ ...transfer, amount: e.target.value })} /></Field>
            <Button type="submit" loading={doTransfer.isPending}>Transfer</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!pricing} onOpenChange={(o) => !o && setPricing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resale price · {pricing?.name}</DialogTitle><DialogDescription>Only APIs whose supplier license allows sub-resale can be resold. Price must be at least your wholesale cost.</DialogDescription></DialogHeader>
          <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), setResale.mutate())}>
            <Field label="API"><Select value={price.productId} onValueChange={(v) => setPrice({ ...price, productId: v })} placeholder="Select API" options={(products.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.name} (list ${money(p.pricePerRequest, { digits: 4 })})` }))} /></Field>
            <Field label="Price per request (USD)" htmlFor="pp"><Input id="pp" required type="number" min={0} step="0.000001" value={price.pricePerRequest} onChange={(e) => setPrice({ ...price, pricePerRequest: e.target.value })} /></Field>
            <Button type="submit" disabled={!price.productId} loading={setResale.isPending}>Set price</Button>
          </form>
        </DialogContent>
      </Dialog>
      {keysFor && <KeysDialog sub={keysFor} onClose={() => setKeysFor(null)} />}
    </>
  );
}
