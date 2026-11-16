'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { CheckCircle2, FileText, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { download, errorMessage } from '@/lib/api';
import { call, useAction, useApi } from '@/lib/query';
import type { Paged } from '@/lib/types';
import { date, money } from '@/lib/utils';

interface Tx { id: string; type: string; amount: string; balanceAfter: string; description: string; idempotencyKey: string; createdAt: string; wallet: { org: { id: string; name: string } } }
interface Pay { id: string; provider: string; purpose: string; status: string; amount: string; refundedAmount: string; bankReference: string | null; description: string | null; createdAt: string; org: { id: string; name: string } }
interface Inv { id: string; number: string; status: string; total: string; issuedAt: string; org: { id: string; name: string } }
interface Hook { id: string; provider: string; eventId: string; type: string; status: string; error: string | null; receivedAt: string }

const TYPES = ['', 'TOPUP', 'USAGE_DEBIT', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'REFUND', 'SUBSCRIPTION_FEE', 'PLAN_CREDIT_GRANT', 'TRANSFER_IN', 'TRANSFER_OUT'];

function Ledger() {
  const sp = useSearchParams();
  const orgId = sp.get('orgId') ?? '';
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const d = useApi<Paged<Tx>>(`/api/admin/transactions?page=${page}&pageSize=50${type ? `&type=${type}` : ''}${orgId ? `&orgId=${orgId}` : ''}`, ['admin-tx', type, page, orgId]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><Select className="w-56" value={type} onValueChange={(v) => (setType(v), setPage(1))} options={TYPES.map((t) => ({ value: t, label: t ? t.replace(/_/g, ' ').toLowerCase() : 'All types' }))} />{orgId && <Badge variant="outline">filtered by organization <Link href="/admin/transactions" className="ml-1 underline">clear</Link></Badge>}</div>
      <QueryView q={d}>
        {(r) => (
          <DataTable rows={r.items} rowKey={(x) => x.id} dense pagination={{ page: r.page, pageCount: r.pageCount, total: r.total, onPage: setPage }} columns={[
            { header: 'Date', cell: (x) => <span className="whitespace-nowrap text-xs">{date(x.createdAt, true)}</span> },
            { header: 'Organization', cell: (x) => <Link href={`/admin/organizations/${x.wallet.org.id}`} className="hover:underline">{x.wallet.org.name}</Link> },
            { header: 'Type', cell: (x) => <Badge variant={Number(x.amount) >= 0 ? 'success' : 'secondary'}>{x.type.replace(/_/g, ' ').toLowerCase()}</Badge> },
            { header: 'Description', cell: (x) => <span className="text-xs">{x.description}</span> },
            { header: 'Amount', className: 'text-right', cell: (x) => <span className="tabular-nums">{money(x.amount, { digits: 6 })}</span> },
            { header: 'Balance after', className: 'text-right', cell: (x) => <span className="tabular-nums text-muted-foreground">{money(x.balanceAfter, { digits: 4 })}</span> },
            { header: 'Idempotency key', cell: (x) => <code className="text-[10px] text-muted-foreground" title={x.idempotencyKey}>{x.idempotencyKey.slice(0, 18)}…</code> },
          ]} />
        )}
      </QueryView>
    </div>
  );
}

function Payments() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const d = useApi<Paged<Pay>>(`/api/admin/payments?page=${page}&pageSize=25${status ? `&status=${status}` : ''}`, ['admin-payments', status, page]);
  const [verifying, setVerifying] = useState<Pay | null>(null);
  const [refunding, setRefunding] = useState<Pay | null>(null);
  const [ref, setRef] = useState('');
  const [refund, setRefund] = useState({ amount: '', reason: '' });
  const verify = useAction(() => call(`/api/admin/payments/${verifying!.id}/verify`, { method: 'POST', body: { bankReference: ref || undefined } }), { success: 'Payment verified — wallet credited', invalidate: [['admin-payments'], ['admin-tx']], onSuccess: () => setVerifying(null) });
  const doRefund = useAction(() => call(`/api/admin/payments/${refunding!.id}/refund`, { method: 'POST', body: refund }), { success: 'Refund issued', invalidate: [['admin-payments'], ['admin-tx']], onSuccess: () => setRefunding(null) });
  return (
    <div className="space-y-3">
      <Select className="w-48" value={status} onValueChange={(v) => (setStatus(v), setPage(1))} options={['', 'PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'].map((s) => ({ value: s, label: s ? s.replace('_', ' ').toLowerCase() : 'All statuses' }))} />
      <QueryView q={d}>
        {(r) => (
          <DataTable rows={r.items} rowKey={(x) => x.id} pagination={{ page: r.page, pageCount: r.pageCount, total: r.total, onPage: setPage }} columns={[
            { header: 'Date', cell: (x) => <span className="text-xs">{date(x.createdAt, true)}</span> },
            { header: 'Organization', cell: (x) => <Link href={`/admin/organizations/${x.org.id}`} className="hover:underline">{x.org.name}</Link> },
            { header: 'Description', cell: (x) => <span className="text-xs">{x.description}</span> },
            { header: 'Method', cell: (x) => <span className="text-xs">{x.provider.replace('_', ' ')}{x.bankReference && <code className="ml-1">{x.bankReference}</code>}</span> },
            { header: 'Amount', className: 'text-right', cell: (x) => <span className="tabular-nums">{money(x.amount)}{Number(x.refundedAmount) > 0 && <span className="block text-xs text-muted-foreground">−{money(x.refundedAmount)}</span>}</span> },
            { header: 'Status', cell: (x) => <StatusBadge status={x.status} /> },
            { header: '', cell: (x) => (
              <div className="flex justify-end gap-1">
                {x.provider === 'MANUAL_BANK' && x.status === 'PENDING' && <Button size="sm" variant="outline" onClick={() => (setVerifying(x), setRef(x.bankReference ?? ''))}><CheckCircle2 /> Verify</Button>}
                {(x.status === 'SUCCEEDED' || x.status === 'PARTIALLY_REFUNDED') && <Button size="sm" variant="ghost" onClick={() => (setRefunding(x), setRefund({ amount: String(Number(x.amount) - Number(x.refundedAmount)), reason: '' }))}><Undo2 /> Refund</Button>}
              </div>
            ) },
          ]} />
        )}
      </QueryView>
      <Dialog open={!!verifying} onOpenChange={(o) => !o && setVerifying(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Verify bank transfer</DialogTitle><DialogDescription>Only verify after the funds ({money(verifying?.amount)}) are visible in the company bank account. This credits the customer wallet.</DialogDescription></DialogHeader>
          <Field label="Bank transaction reference" htmlFor="br"><Input id="br" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
          <Button loading={verify.isPending} onClick={() => verify.mutate()}>Confirm funds received</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!refunding} onOpenChange={(o) => !o && setRefunding(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Refund payment</DialogTitle><DialogDescription>Debits the customer wallet and (for card/PayPal) refunds via the provider. Fails if the credit was already spent.</DialogDescription></DialogHeader>
          <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), doRefund.mutate())}>
            <Field label="Amount (USD)" htmlFor="ra"><Input id="ra" required type="number" min={0.01} step="0.01" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} /></Field>
            <Field label="Reason" htmlFor="rr"><Input id="rr" required minLength={5} value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} /></Field>
            <Button type="submit" variant="destructive" loading={doRefund.isPending}>Issue refund</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Invoices() {
  const [page, setPage] = useState(1);
  const d = useApi<Paged<Inv>>(`/api/admin/invoices?page=${page}&pageSize=25`, ['admin-invoices', page]);
  return (
    <QueryView q={d}>
      {(r) => (
        <DataTable rows={r.items} rowKey={(x) => x.id} pagination={{ page: r.page, pageCount: r.pageCount, total: r.total, onPage: setPage }} columns={[
          { header: 'Number', cell: (x) => <code className="text-xs">{x.number}</code> },
          { header: 'Organization', cell: (x) => x.org.name },
          { header: 'Issued', cell: (x) => date(x.issuedAt) },
          { header: 'Status', cell: (x) => <StatusBadge status={x.status} /> },
          { header: 'Total', className: 'text-right', cell: (x) => money(x.total) },
          { header: '', cell: (x) => <Button size="icon" variant="ghost" aria-label="Download invoice" onClick={() => download(`/api/admin/invoices/${x.id}/pdf`, `${x.number}.pdf`).catch((e) => toast.error(errorMessage(e)))}><FileText /></Button> },
        ]} />
      )}
    </QueryView>
  );
}

function Webhooks() {
  const d = useApi<Hook[]>('/api/admin/webhook-events', ['admin-hooks']);
  return (
    <QueryView q={d}>
      {(rows) => (
        <DataTable rows={rows} rowKey={(x) => x.id} dense empty={{ title: 'No webhook events received' }} columns={[
          { header: 'Received', cell: (x) => date(x.receivedAt, true) },
          { header: 'Provider', cell: (x) => x.provider },
          { header: 'Type', cell: (x) => <code className="text-xs">{x.type}</code> },
          { header: 'Event ID', cell: (x) => <code className="text-xs">{x.eventId}</code> },
          { header: 'Status', cell: (x) => <StatusBadge status={x.status} /> },
          { header: 'Error', cell: (x) => <span className="text-xs text-destructive">{x.error ?? ''}</span> },
        ]} />
      )}
    </QueryView>
  );
}

export default function TransactionsPage() {
  return (
    <>
      <PageHeader title="Transactions" description="Immutable wallet ledger, payments (with manual bank verification and refunds), invoices and verified payment webhooks." />
      <Tabs defaultValue="ledger">
        <TabsList><TabsTrigger value="ledger">Ledger</TabsTrigger><TabsTrigger value="payments">Payments</TabsTrigger><TabsTrigger value="invoices">Invoices</TabsTrigger><TabsTrigger value="webhooks">Webhooks</TabsTrigger></TabsList>
        <TabsContent value="ledger"><Suspense><Ledger /></Suspense></TabsContent>
        <TabsContent value="payments"><Payments /></TabsContent>
        <TabsContent value="invoices"><Invoices /></TabsContent>
        <TabsContent value="webhooks"><Webhooks /></TabsContent>
      </Tabs>
    </>
  );
}
