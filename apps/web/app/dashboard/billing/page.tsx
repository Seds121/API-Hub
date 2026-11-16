'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Check, Download, FileText, Landmark, Plus, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { LoadingCards, QueryView } from '@/components/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { download, errorMessage } from '@/lib/api';
import { call, useAction, useApi } from '@/lib/query';
import { can, useMe } from '@/lib/session';
import type { BillingOverview } from '@/lib/dash-types';
import type { Paged, Plan } from '@/lib/types';
import { date, money, newIdempotencyKey, num } from '@/lib/utils';

interface Tx { id: string; type: string; amount: string; balanceAfter: string; description: string; createdAt: string; referenceId: string | null }
interface Invoice { id: string; number: string; status: string; total: string; currency: string; issuedAt: string; paidAt: string | null; lines: { description: string }[] }
interface PaymentRow { id: string; provider: string; purpose: string; status: string; amount: string; refundedAmount: string; checkoutUrl: string | null; bankReference: string | null; instructions: string | null; description: string | null; createdAt: string }
interface Provider { kind: string; label: string; enabled: boolean; requiresCredentials: boolean }

function PaymentReturnNotice() {
  const sp = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const s = sp.get('status');
    if (s === 'success') toast.success('Payment submitted. Your wallet is credited once the provider confirms the payment.');
    if (s === 'cancelled') toast.message('Payment cancelled.');
    if (s) router.replace('/dashboard/billing');
  }, [sp, router]);
  return null;
}

function TopUpDialog({ open, onOpenChange, plan }: { open: boolean; onOpenChange: (o: boolean) => void; plan?: Plan | null }) {
  const providers = useApi<Provider[]>('/api/billing/payments/providers');
  const enabled = (providers.data ?? []).filter((p) => p.enabled);
  const [provider, setProvider] = useState('');
  const [amount, setAmount] = useState('50');
  const [result, setResult] = useState<PaymentRow | null>(null);
  const [idem] = useState(() => newIdempotencyKey('pay'));
  const qc = useQueryClient();
  const sel = provider || enabled[0]?.kind || '';
  const pay = useAction(
    () => call<PaymentRow>('/api/billing/payments', { method: 'POST', headers: { 'idempotency-key': `${idem}-${sel}-${plan?.id ?? amount}` }, body: plan ? { provider: sel, purpose: plan.type === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'WALLET_TOPUP', planId: plan.id } : { provider: sel, purpose: 'WALLET_TOPUP', amount } }),
    {
      onSuccess: (p) => {
        void qc.invalidateQueries({ queryKey: ['payments'] });
        if (p.checkoutUrl) window.location.href = p.checkoutUrl;
        else setResult(p);
      },
    },
  );
  return (
    <Dialog open={open} onOpenChange={(o) => (onOpenChange(o), !o && setResult(null))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{plan ? `Purchase ${plan.name}` : 'Add credits'}</DialogTitle>
          <DialogDescription>Credits are added only after the payment provider confirms the payment.</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2 font-medium"><Landmark className="h-4 w-4" /> Bank transfer instructions</p>
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{result.instructions}</pre>
            <p className="text-muted-foreground">Include reference <strong>{result.bankReference}</strong>. Your wallet is credited when our finance team verifies receipt.</p>
            <Button className="w-full" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {plan ? (
              <div className="rounded-md border p-3 text-sm"><p className="font-medium">{plan.name}</p><p className="text-muted-foreground">{money(plan.price)} {plan.type === 'PREPAID' ? `→ ${money(plan.creditGrant)} credit` : plan.interval === 'ANNUAL' ? 'per year' : 'per month'}</p></div>
            ) : (
              <Field label="Amount (USD)" hint="Between $5 and $50,000." htmlFor="amt">
                <Input id="amt" type="number" min={5} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <div className="flex gap-2">{['25', '50', '100', '500'].map((a) => <Button key={a} type="button" size="sm" variant={amount === a ? 'default' : 'outline'} onClick={() => setAmount(a)}>${a}</Button>)}</div>
              </Field>
            )}
            <Field label="Payment method">
              {providers.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : enabled.length ? <Select value={sel} onValueChange={setProvider} options={enabled.map((p) => ({ value: p.kind, label: p.label }))} /> : <p className="text-sm text-destructive">No payment methods are configured. Contact support.</p>}
            </Field>
            {sel === 'MOCK' && <p className="rounded-md bg-amber-500/10 p-2 text-xs">Demo payment method — available in development only. No real money moves.</p>}
            <Button disabled={!sel} loading={pay.isPending} onClick={() => pay.mutate()}>Continue to payment</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BillingInner() {
  const me = useMe();
  const writable = can(me.data, 'org:billing:write');
  const overview = useApi<BillingOverview>('/api/billing/overview', ['billing']);
  const plans = useApi<Plan[]>('/api/catalog/plans');
  const [txPage, setTxPage] = useState(1);
  const tx = useApi<Paged<Tx>>(`/api/billing/transactions?page=${txPage}&pageSize=20`, ['tx', txPage]);
  const invoices = useApi<Invoice[]>('/api/billing/invoices', ['invoices']);
  const payments = useApi<PaymentRow[]>('/api/billing/payments', ['payments']);
  const [topup, setTopup] = useState(false);
  const [planToBuy, setPlanToBuy] = useState<Plan | null>(null);
  const [subscribeTarget, setSubscribeTarget] = useState<Plan | null>(null);
  const [idem] = useState(() => newIdempotencyKey('sub'));
  const inv = [['billing'], ['tx'], ['invoices'], ['me']];
  const subscribe = useAction((p: Plan) => call('/api/billing/subscription', { method: 'POST', headers: { 'idempotency-key': `${idem}-${p.id}` }, body: { planId: p.id } }), { success: 'Subscription activated', invalidate: inv });
  const cancel = useAction(() => call('/api/billing/subscription/cancel', { method: 'POST' }), { success: 'Subscription will cancel at period end', invalidate: inv });
  const resume = useAction(() => call('/api/billing/subscription/resume', { method: 'POST' }), { success: 'Subscription resumed', invalidate: inv });

  return (
    <>
      <Suspense><PaymentReturnNotice /></Suspense>
      <PageHeader title="Billing & wallet" description="Prepaid wallet, subscriptions, invoices and payments." actions={writable && <Button onClick={() => setTopup(true)}><Plus /> Add credits</Button>} />
      <QueryView q={overview} loading={<LoadingCards />}>
        {(o) => (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Available balance" value={money(o.wallet.available)} icon={Wallet} tone={o.wallet.isLow ? 'warning' : 'default'} hint={Number(o.wallet.reserved) > 0 ? `${money(o.wallet.reserved, { digits: 4 })} held for in-flight requests` : o.wallet.isLow ? 'Low balance' : undefined} />
            <StatCard label="Spent this month" value={money(o.monthToDateSpend)} hint={o.monthlySpendLimit ? `limit ${money(o.monthlySpendLimit)}` : 'no monthly limit'} />
            <StatCard label="Current plan" value={o.subscription?.plan.name ?? 'Pay as you go'} hint={o.subscription ? `renews ${date(o.subscription.currentPeriodEnd)}` : undefined} />
            <StatCard label="Credit arrangement" value={Number(o.wallet.creditLimit) > 0 ? money(o.wallet.creditLimit) : 'None'} hint="Enterprise credit limit" />
          </div>
        )}
      </QueryView>

      <Card id="plans" className="mt-6">
        <CardHeader>
          <CardTitle>Plans</CardTitle>
          <CardDescription>Subscriptions are paid from your wallet balance or by card. Prepaid packs add bonus credit.</CardDescription>
        </CardHeader>
        <CardContent>
          {overview.data?.subscription && (
            <div className="mb-4 flex flex-col gap-3 rounded-lg border bg-muted/40 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{overview.data.subscription.plan.name} · <StatusBadge status={overview.data.subscription.status} /></p>
                <p className="text-muted-foreground">{num(overview.data.subscription.requestsUsedInPeriod)} of {num(overview.data.subscription.plan.includedRequests)} included requests used · period ends {date(overview.data.subscription.currentPeriodEnd)}{overview.data.subscription.cancelAtPeriodEnd && ' · cancels at period end'}</p>
              </div>
              {writable && (overview.data.subscription.cancelAtPeriodEnd ? (
                <Button variant="outline" size="sm" loading={resume.isPending} onClick={() => resume.mutate()}>Resume auto-renew</Button>
              ) : (
                <ConfirmDialog trigger={<Button variant="outline" size="sm">Cancel subscription</Button>} title="Cancel subscription?" description="Your plan stays active until the end of the current period and will not renew." confirmLabel="Cancel at period end" destructive onConfirm={() => cancel.mutateAsync().then(() => undefined)} />
              ))}
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(plans.data ?? []).filter((p) => p.type === 'SUBSCRIPTION' || p.type === 'PREPAID').map((p) => {
              const current = overview.data?.subscription?.plan.id === p.id;
              return (
                <div key={p.id} className="flex flex-col rounded-lg border p-4">
                  <div className="flex items-center justify-between"><p className="font-medium">{p.name}</p>{current && <Badge variant="success"><Check className="h-3 w-3" /> Current</Badge>}</div>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{money(p.price, { digits: 0 })}<span className="text-sm font-normal text-muted-foreground">{p.type === 'PREPAID' ? ' one-time' : p.interval === 'ANNUAL' ? '/yr' : '/mo'}</span></p>
                  <p className="mb-3 text-xs text-muted-foreground">{p.type === 'PREPAID' ? `${money(p.creditGrant, { digits: 0 })} wallet credit` : `${num(p.includedRequests)} requests included${Number(p.discountPercent) ? ` · ${Number(p.discountPercent)}% off` : ''}`}</p>
                  {writable && (
                    <div className="mt-auto flex gap-2">
                      {p.type === 'SUBSCRIPTION' && !current && <Button size="sm" variant="outline" onClick={() => setSubscribeTarget(p)}>Pay from wallet</Button>}
                      {!current && <Button size="sm" onClick={() => setPlanToBuy(p)}>{p.type === 'PREPAID' ? 'Buy pack' : 'Pay by card'}</Button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="tx" className="mt-6">
        <TabsList>
          <TabsTrigger value="tx">Wallet transactions</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>
        <TabsContent value="tx">
          <QueryView q={tx}>
            {(t) => (
              <DataTable
                rows={t.items}
                rowKey={(x) => x.id}
                dense
                pagination={{ page: t.page, pageCount: t.pageCount, total: t.total, onPage: setTxPage }}
                toolbar={<Button variant="outline" size="sm" onClick={() => download('/api/billing/statement.csv', 'statement.csv').catch((e) => toast.error(errorMessage(e)))}><Download /> Statement (CSV, 31 days)</Button>}
                empty={{ title: 'No transactions yet' }}
                columns={[
                  { header: 'Date', cell: (x) => <span className="whitespace-nowrap text-xs">{date(x.createdAt, true)}</span> },
                  { header: 'Type', cell: (x) => <Badge variant={Number(x.amount) >= 0 ? 'success' : 'secondary'}>{x.type.replace(/_/g, ' ').toLowerCase()}</Badge> },
                  { header: 'Description', cell: (x) => <span className="text-sm">{x.description}</span> },
                  { header: 'Amount', className: 'text-right', cell: (x) => <span className={`tabular-nums ${Number(x.amount) >= 0 ? 'text-success' : ''}`}>{Number(x.amount) >= 0 ? '+' : ''}{money(x.amount, { digits: 4 })}</span> },
                  { header: 'Balance', className: 'text-right', cell: (x) => <span className="tabular-nums text-muted-foreground">{money(x.balanceAfter, { digits: 4 })}</span> },
                ]}
              />
            )}
          </QueryView>
        </TabsContent>
        <TabsContent value="invoices">
          <QueryView q={invoices}>
            {(rows) => (
              <DataTable rows={rows} rowKey={(x) => x.id} empty={{ title: 'No invoices yet', description: 'Invoices are issued for payments, subscriptions and renewals.' }} columns={[
                { header: 'Number', cell: (x) => <span className="font-mono text-xs">{x.number}</span> },
                { header: 'Description', cell: (x) => <span className="text-sm">{x.lines[0]?.description}</span> },
                { header: 'Issued', cell: (x) => date(x.issuedAt) },
                { header: 'Status', cell: (x) => <StatusBadge status={x.status} /> },
                { header: 'Total', className: 'text-right', cell: (x) => <span className="tabular-nums">{money(x.total)}</span> },
                { header: '', className: 'w-10', cell: (x) => <Button variant="ghost" size="icon" aria-label={`Download ${x.number}`} onClick={() => download(`/api/billing/invoices/${x.id}/pdf`, `${x.number}.pdf`).catch((e) => toast.error(errorMessage(e)))}><FileText /></Button> },
              ]} />
            )}
          </QueryView>
        </TabsContent>
        <TabsContent value="payments">
          <QueryView q={payments}>
            {(rows) => (
              <DataTable rows={rows} rowKey={(x) => x.id} empty={{ title: 'No payments yet' }} columns={[
                { header: 'Date', cell: (x) => date(x.createdAt, true) },
                { header: 'Description', cell: (x) => x.description ?? x.purpose },
                { header: 'Method', cell: (x) => <span className="text-xs">{x.provider.replace('_', ' ')}{x.bankReference && <code className="ml-1">{x.bankReference}</code>}</span> },
                { header: 'Status', cell: (x) => <StatusBadge status={x.status} /> },
                { header: 'Amount', className: 'text-right', cell: (x) => <span className="tabular-nums">{money(x.amount)}{Number(x.refundedAmount) > 0 && <span className="block text-xs text-muted-foreground">refunded {money(x.refundedAmount)}</span>}</span> },
                { header: '', cell: (x) => (x.status === 'REQUIRES_ACTION' && x.checkoutUrl ? <Button size="sm" variant="outline" asChild><a href={x.checkoutUrl}>Complete</a></Button> : null) },
              ]} />
            )}
          </QueryView>
        </TabsContent>
      </Tabs>
      <TopUpDialog open={topup} onOpenChange={setTopup} />
      <TopUpDialog open={!!planToBuy} onOpenChange={(o) => !o && setPlanToBuy(null)} plan={planToBuy} />
      <ConfirmDialog open={!!subscribeTarget} onOpenChange={(o) => !o && setSubscribeTarget(null)} title={`Subscribe to ${subscribeTarget?.name}?`} description={`${money(subscribeTarget?.price)} will be deducted from your wallet now and on each renewal. Any current plan is replaced.`} confirmLabel="Subscribe" onConfirm={async () => { await subscribe.mutateAsync(subscribeTarget!); setSubscribeTarget(null); }} />
    </>
  );
}

export default function BillingPage() {
  return <BillingInner />;
}
