'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LifeBuoy, Plus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { call, useAction, useApi } from '@/lib/query';
import { relative } from '@/lib/utils';

interface Ticket { id: string; number: number; subject: string; status: string; priority: string; category: string; updatedAt: string; createdBy: { name: string } }

export default function SupportPage() {
  const router = useRouter();
  const q = useApi<Ticket[]>('/api/support/tickets', ['tickets']);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: '', category: 'general', priority: 'NORMAL', message: '' });
  const create = useAction(() => call<Ticket>('/api/support/tickets', { method: 'POST', body: form }), { success: 'Ticket created', invalidate: [['tickets']], onSuccess: (t) => (setOpen(false), router.push(`/dashboard/support/${t.id}`)) });
  return (
    <>
      <PageHeader title="Support" description="Get help from our team about billing, integrations or new API requests." actions={<Button onClick={() => setOpen(true)}><Plus /> New ticket</Button>} />
      <QueryView q={q}>
        {(rows) => (
          <DataTable rows={rows} rowKey={(t) => t.id} onRowClick={(t) => router.push(`/dashboard/support/${t.id}`)} empty={{ title: 'No tickets', description: 'We’re here if you need anything.' }} columns={[
            { header: '#', cell: (t) => <span className="font-mono text-xs">#{t.number}</span> },
            { header: 'Subject', cell: (t) => <Link href={`/dashboard/support/${t.id}`} className="font-medium hover:underline">{t.subject}</Link> },
            { header: 'Category', cell: (t) => <span className="text-sm capitalize">{t.category}</span> },
            { header: 'Priority', cell: (t) => <span className="text-xs">{t.priority}</span> },
            { header: 'Status', cell: (t) => <StatusBadge status={t.status} /> },
            { header: 'Updated', cell: (t) => <span className="text-muted-foreground">{relative(t.updatedAt)}</span> },
          ]} />
        )}
      </QueryView>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><LifeBuoy className="h-5 w-5" /> New support ticket</DialogTitle></DialogHeader>
          <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), create.mutate())}>
            <Field label="Subject" htmlFor="subj"><Input id="subj" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required minLength={4} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category"><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })} options={['general', 'billing', 'technical', 'api-request', 'account'].map((c) => ({ value: c, label: c.replace('-', ' ') }))} /></Field>
              <Field label="Priority"><Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })} options={['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((c) => ({ value: c, label: c.toLowerCase() }))} /></Field>
            </div>
            <Field label="Message" hint="Include request IDs (X-Request-Id) for API issues." htmlFor="msg"><Textarea id="msg" rows={6} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required minLength={10} /></Field>
            <Button type="submit" loading={create.isPending}>Submit ticket</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
