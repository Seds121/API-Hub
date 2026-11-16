'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Building2, Coins, Handshake, Settings2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { call, useAction, useApi } from '@/lib/query';
import type { Plan } from '@/lib/types';
import { date, money, newIdempotencyKey, num, relative } from '@/lib/utils';

interface OrgDetail {
  id: string; name: string; slug: string; type: string; status: string; billingEmail: string | null; createdAt: string; monthlySpendLimit: string | null; isDemo: boolean;
  wallet: { balance: string; reserved: string; creditLimit: string; lowBalanceThreshold: string };
  parent: { id: string; name: string } | null;
  children: { id: string; name: string; status: string; createdAt: string }[];
  agencyAgreement: { status: string; wholesaleDiscountPercent: string; revenueSharePercent: string; maxSubaccounts: number; allowCustomPricing: boolean; notes: string | null } | null;
  members: { id: string; user: { id: string; name: string; email: string; status: string; lastLoginAt: string | null; mfaEnabled: boolean }; role: { key: string; name: string } }[];
  subscriptions: { id: string; status: string; currentPeriodEnd: string; requestsUsedInPeriod: number; plan: { name: string } }[];
  pricingRules: { id: string; scope: string; pricePerRequest: string; product: { name: string } | null; endpoint: { name: string; path: string } | null }[];
  usage30d: { requests: number; successful: number; failed: number; spend: string };
}

export default function OrgAdmin() {
  const { id } = useParams<{ id: string }>();
  const q = useApi<OrgDetail>(`/api/admin/organizations/${id}`, ['admin-org', id]);
  const plans = useApi<Plan[]>('/api/catalog/plans');
  const inv = [['admin-org', id], ['admin-orgs']];
  const [dlg, setDlg] = useState<'adjust' | 'wallet' | 'agreement' | 'limits' | 'plan' | 'revshare' | null>(null);
  const [adj, setAdj] = useState({ direction: 'credit', amount: '', reason: '' });
  const [idem, setIdem] = useState(() => newIdempotencyKey('adj'));
  const [w, setW] = useState({ creditLimit: '', lowBalanceThreshold: '' });
  const [ag, setAg] = useState({ wholesaleDiscountPercent: '10', revenueSharePercent: '10', maxSubaccounts: '25', allowCustomPricing: true, status: 'ACTIVE', notes: '' });
  const [lim, setLim] = useState('');
  const [planId, setPlanId] = useState('');
  const [month, setMonth] = useState(() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); });

  const adjust = useAction(() => call(`/api/admin/wallets/${id}/adjust`, { method: 'POST', headers: { 'idempotency-key': idem }, body: adj }), { success: 'Wallet adjusted (audited)', invalidate: inv, onSuccess: () => (setDlg(null), setIdem(newIdempotencyKey('adj')), setAdj({ direction: 'credit', amount: '', reason: '' })) });
  const walletSettings = useAction(() => call(`/api/admin/wallets/${id}`, { method: 'PATCH', body: { ...(w.creditLimit ? { creditLimit: w.creditLimit } : {}), ...(w.lowBalanceThreshold ? { lowBalanceThreshold: w.lowBalanceThreshold } : {}) } }), { success: 'Wallet settings saved', invalidate: inv, onSuccess: () => setDlg(null) });
  const patch = useAction((b: object) => call(`/api/admin/organizations/${id}`, { method: 'PATCH', body: b }), { success: 'Organization updated', invalidate: inv, onSuccess: () => setDlg(null) });
  const agreement = useAction(() => call(`/api/admin/organizations/${id}/agency-agreement`, { method: 'POST', body: { ...ag, maxSubaccounts: Number(ag.maxSubaccounts), notes: ag.notes || null } }), { success: 'Agency agreement saved', invalidate: inv, onSuccess: () => setDlg(null) });
  const assign = useAction(() => call(`/api/admin/organizations/${id}/subscription`, { method: 'POST', headers: { 'idempotency-key': newIdempotencyKey('assign') }, body: { planId } }), { success: 'Plan assigned (fee charged to wallet)', invalidate: inv, onSuccess: () => setDlg(null) });
  const revshare = useAction(() => call<{ settled: string }>(`/api/admin/organizations/${id}/revenue-share/settle`, { method: 'POST', body: { month } }), { success: (r) => `Revenue share settled: ${money(r.settled)}`, invalidate: inv, onSuccess: () => setDlg(null) });

  return (
    <>
      <Link href="/admin/organizations" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Organizations</Link>
      <QueryView q={q}>
        {(o) => (
          <>
            <PageHeader
              title={o.name}
              badge={<><StatusBadge status={o.status} /><Badge variant="secondary">{o.parent ? 'subaccount' : o.type.toLowerCase()}</Badge>{o.isDemo && <Badge variant="warning">demo</Badge>}</>}
              description={<span>{o.billingEmail ?? '—'} · since {date(o.createdAt)}{o.parent && <> · agency <Link className="underline" href={`/admin/organizations/${o.parent.id}`}>{o.parent.name}</Link></>}</span>}
              actions={
                <>
                  <Button variant="outline" onClick={() => setDlg('adjust')}><Coins /> Adjust wallet</Button>
                  <Button variant="outline" onClick={() => (setLim(o.monthlySpendLimit ?? ''), setDlg('limits'))}><Settings2 /> Limits</Button>
                  {!o.parent && <Button variant="outline" onClick={() => { if (o.agencyAgreement) setAg({ wholesaleDiscountPercent: o.agencyAgreement.wholesaleDiscountPercent, revenueSharePercent: o.agencyAgreement.revenueSharePercent, maxSubaccounts: String(o.agencyAgreement.maxSubaccounts), allowCustomPricing: o.agencyAgreement.allowCustomPricing, status: o.agencyAgreement.status, notes: o.agencyAgreement.notes ?? '' }); setDlg('agreement'); }}><Handshake /> Agency agreement</Button>}
                  <ConfirmDialog trigger={<Button variant={o.status === 'ACTIVE' ? 'destructive' : 'default'}>{o.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</Button>} title={o.status === 'ACTIVE' ? 'Suspend organization?' : 'Reactivate organization?'} description={o.status === 'ACTIVE' ? 'All API traffic for this organization (and its subaccounts) is refused within seconds.' : 'API traffic will be accepted again.'} destructive={o.status === 'ACTIVE'} onConfirm={() => patch.mutateAsync({ status: o.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }).then(() => undefined)} />
                </>
              }
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Wallet balance" value={money(o.wallet.balance)} hint={`reserved ${money(o.wallet.reserved, { digits: 4 })} · credit limit ${money(o.wallet.creditLimit)}`} />
              <StatCard label="Requests (30d)" value={num(o.usage30d.requests)} hint={`${num(o.usage30d.failed)} failed`} />
              <StatCard label="Spend (30d)" value={money(o.usage30d.spend)} />
              <StatCard label="Monthly cap" value={o.monthlySpendLimit ? money(o.monthlySpendLimit) : 'None'} />
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Subscription</CardTitle><CardDescription>Plan history</CardDescription></div><Button size="sm" variant="outline" onClick={() => setDlg('plan')}>Assign plan</Button></CardHeader>
                <CardContent><DataTable rows={o.subscriptions} rowKey={(s) => s.id} dense empty={{ title: 'Pay as you go' }} columns={[{ header: 'Plan', cell: (s) => s.plan.name }, { header: 'Status', cell: (s) => <StatusBadge status={s.status} /> }, { header: 'Period end', cell: (s) => date(s.currentPeriodEnd) }, { header: 'Used', cell: (s) => num(s.requestsUsedInPeriod) }]} /></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Wallet settings</CardTitle><CardDescription>Credit arrangement & alerts</CardDescription></div><Button size="sm" variant="outline" onClick={() => (setW({ creditLimit: o.wallet.creditLimit, lowBalanceThreshold: o.wallet.lowBalanceThreshold }), setDlg('wallet'))}>Edit</Button></CardHeader>
                <CardContent className="space-y-1 text-sm"><p>Enterprise credit limit: <strong>{money(o.wallet.creditLimit)}</strong> {Number(o.wallet.creditLimit) === 0 && <span className="text-muted-foreground">(negative balances not allowed)</span>}</p><p>Low balance threshold: {money(o.wallet.lowBalanceThreshold)}</p><Link href={`/admin/transactions?orgId=${o.id}`} className="text-xs text-primary underline">View ledger →</Link></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Members</CardTitle></CardHeader>
                <CardContent><DataTable rows={o.members} rowKey={(m) => m.id} dense columns={[{ header: 'User', cell: (m) => (<div><p>{m.user.name}</p><p className="text-xs text-muted-foreground">{m.user.email}</p></div>) }, { header: 'Role', cell: (m) => m.role.name }, { header: 'MFA', cell: (m) => (m.user.mfaEnabled ? 'on' : 'off') }, { header: 'Last login', cell: (m) => relative(m.user.lastLoginAt) }]} /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Custom pricing</CardTitle><CardDescription>Organization overrides (set from Pricing)</CardDescription></CardHeader>
                <CardContent><DataTable rows={o.pricingRules} rowKey={(r) => r.id} dense empty={{ title: 'List prices apply' }} columns={[{ header: 'Scope', cell: (r) => r.scope.toLowerCase().replace('_', ' ') }, { header: 'API / endpoint', cell: (r) => `${r.product?.name ?? ''}${r.endpoint ? ` ${r.endpoint.path}` : ''}` }, { header: 'Price', cell: (r) => money(r.pricePerRequest, { digits: 6 }) }]} /></CardContent>
              </Card>
              {(o.type === 'AGENCY' || o.children.length > 0) && (
                <Card className="lg:col-span-2">
                  <CardHeader className="flex-row items-center justify-between">
                    <div><CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Agency</CardTitle><CardDescription>{o.agencyAgreement ? `Agreement ${o.agencyAgreement.status.toLowerCase()} · ${Number(o.agencyAgreement.wholesaleDiscountPercent)}% wholesale · ${Number(o.agencyAgreement.revenueSharePercent)}% revenue share · max ${o.agencyAgreement.maxSubaccounts} clients` : 'No agreement yet — reseller features are inactive.'}</CardDescription></div>
                    {o.agencyAgreement && <Button size="sm" variant="outline" onClick={() => setDlg('revshare')}>Settle revenue share</Button>}
                  </CardHeader>
                  <CardContent><DataTable rows={o.children} rowKey={(c) => c.id} dense empty={{ title: 'No client subaccounts' }} columns={[{ header: 'Client', cell: (c) => <Link href={`/admin/organizations/${c.id}`} className="hover:underline">{c.name}</Link> }, { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> }, { header: 'Created', cell: (c) => date(c.createdAt) }]} /></CardContent>
                </Card>
              )}
            </div>

            <Dialog open={dlg === 'adjust'} onOpenChange={(x) => !x && setDlg(null)}>
              <DialogContent>
                <DialogHeader><DialogTitle>Adjust wallet</DialogTitle><DialogDescription>Creates an immutable ledger entry with your name and reason. Debits cannot take the balance below the credit limit.</DialogDescription></DialogHeader>
                <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), adjust.mutate())}>
                  <Field label="Type"><Select value={adj.direction} onValueChange={(v) => setAdj({ ...adj, direction: v })} options={[{ value: 'credit', label: 'Add credit' }, { value: 'debit', label: 'Deduct credit' }]} /></Field>
                  <Field label="Amount (USD)" htmlFor="aa"><Input id="aa" required type="number" min={0.000001} step="0.000001" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} /></Field>
                  <Field label="Reason (recorded in audit log)" htmlFor="ar"><Input id="ar" required minLength={5} value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></Field>
                  <Button type="submit" loading={adjust.isPending}>Apply adjustment</Button>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog open={dlg === 'wallet'} onOpenChange={(x) => !x && setDlg(null)}>
              <DialogContent>
                <DialogHeader><DialogTitle>Wallet settings</DialogTitle><DialogDescription>A credit limit &gt; 0 is an explicit enterprise credit arrangement allowing a negative balance down to −limit.</DialogDescription></DialogHeader>
                <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), walletSettings.mutate())}>
                  <Field label="Credit limit (USD)" htmlFor="cl"><Input id="cl" type="number" min={0} step="0.01" value={w.creditLimit} onChange={(e) => setW({ ...w, creditLimit: e.target.value })} /></Field>
                  <Field label="Low balance threshold (USD)" htmlFor="lb"><Input id="lb" type="number" min={0} step="0.01" value={w.lowBalanceThreshold} onChange={(e) => setW({ ...w, lowBalanceThreshold: e.target.value })} /></Field>
                  <Button type="submit" loading={walletSettings.isPending}>Save</Button>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog open={dlg === 'limits'} onOpenChange={(x) => !x && setDlg(null)}>
              <DialogContent>
                <DialogHeader><DialogTitle>Monthly spending cap</DialogTitle></DialogHeader>
                <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), patch.mutate({ monthlySpendLimit: lim || null }))}>
                  <Field label="Cap (USD)" hint="Blank = no cap" htmlFor="lm"><Input id="lm" type="number" min={0} step="0.01" value={lim} onChange={(e) => setLim(e.target.value)} /></Field>
                  <Button type="submit" loading={patch.isPending}>Save</Button>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog open={dlg === 'agreement'} onOpenChange={(x) => !x && setDlg(null)}>
              <DialogContent>
                <DialogHeader><DialogTitle>Agency agreement</DialogTitle><DialogDescription>Saving converts this organization to an agency. Agencies can only resell APIs whose supplier license allows sub-resale.</DialogDescription></DialogHeader>
                <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), agreement.mutate())}>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Wholesale discount %" htmlFor="wd"><Input id="wd" type="number" min={0} max={90} step="0.01" value={ag.wholesaleDiscountPercent} onChange={(e) => setAg({ ...ag, wholesaleDiscountPercent: e.target.value })} /></Field>
                    <Field label="Revenue share %" htmlFor="rs"><Input id="rs" type="number" min={0} max={90} step="0.01" value={ag.revenueSharePercent} onChange={(e) => setAg({ ...ag, revenueSharePercent: e.target.value })} /></Field>
                    <Field label="Max subaccounts" htmlFor="ms"><Input id="ms" type="number" min={1} value={ag.maxSubaccounts} onChange={(e) => setAg({ ...ag, maxSubaccounts: e.target.value })} /></Field>
                    <Field label="Status"><Select value={ag.status} onValueChange={(v) => setAg({ ...ag, status: v })} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'SUSPENDED', label: 'Suspended' }]} /></Field>
                  </div>
                  <label className="flex items-center gap-3 text-sm"><Switch checked={ag.allowCustomPricing} onCheckedChange={(c) => setAg({ ...ag, allowCustomPricing: c })} /> Agency may set its own resale prices</label>
                  <Field label="Notes" htmlFor="an"><Input id="an" value={ag.notes} onChange={(e) => setAg({ ...ag, notes: e.target.value })} /></Field>
                  <Button type="submit" loading={agreement.isPending}>Save agreement</Button>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog open={dlg === 'plan'} onOpenChange={(x) => !x && setDlg(null)}>
              <DialogContent>
                <DialogHeader><DialogTitle>Assign subscription plan</DialogTitle><DialogDescription>The plan fee is charged to the organization’s wallet (credit limit applies).</DialogDescription></DialogHeader>
                <Select value={planId} onValueChange={setPlanId} placeholder="Select plan" options={(plans.data ?? []).filter((p) => p.type === 'SUBSCRIPTION').map((p) => ({ value: p.id, label: `${p.name} — ${money(p.price)}` }))} />
                <Button disabled={!planId} loading={assign.isPending} onClick={() => assign.mutate()}>Assign</Button>
              </DialogContent>
            </Dialog>
            <Dialog open={dlg === 'revshare'} onOpenChange={(x) => !x && setDlg(null)}>
              <DialogContent>
                <DialogHeader><DialogTitle>Settle revenue share</DialogTitle><DialogDescription>Credits the agency wallet with its share of client spend for a completed month. Idempotent per month.</DialogDescription></DialogHeader>
                <Field label="Month" htmlFor="mo"><Input id="mo" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
                <Button loading={revshare.isPending} onClick={() => revshare.mutate()}>Settle</Button>
              </DialogContent>
            </Dialog>
          </>
        )}
      </QueryView>
    </>
  );
}
