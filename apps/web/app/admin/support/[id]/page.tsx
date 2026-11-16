'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { TicketThread, TicketMsg } from '@/components/ticket-thread';
import { Select } from '@/components/ui/select';
import { call, useAction, useApi } from '@/lib/query';

interface Ticket { id: string; number: number; subject: string; status: string; priority: string; org: { id: string; name: string }; messages: TicketMsg[] }

export default function AdminTicket() {
  const { id } = useParams<{ id: string }>();
  const q = useApi<Ticket>(`/api/admin/support/tickets/${id}`, ['admin-ticket', id]);
  const inv = [['admin-ticket', id], ['admin-tickets']];
  const reply = useAction((v: { body: string; isInternal: boolean }) => call(`/api/admin/support/tickets/${id}/messages`, { method: 'POST', body: v }), { invalidate: inv });
  const patch = useAction((b: object) => call(`/api/admin/support/tickets/${id}`, { method: 'PATCH', body: b }), { success: 'Ticket updated', invalidate: inv });
  return (
    <>
      <Link href="/admin/support" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Tickets</Link>
      <QueryView q={q}>
        {(t) => (
          <>
            <PageHeader
              title={t.subject}
              badge={<StatusBadge status={t.status} />}
              description={<span>#{t.number} · <Link className="underline" href={`/admin/organizations/${t.org.id}`}>{t.org.name}</Link></span>}
              actions={
                <>
                  <Select className="w-40" value={t.priority} onValueChange={(v) => patch.mutate({ priority: v })} options={['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => ({ value: p, label: `Priority: ${p.toLowerCase()}` }))} />
                  <Select className="w-40" value={t.status} onValueChange={(v) => patch.mutate({ status: v })} options={['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'].map((s) => ({ value: s, label: s.toLowerCase() }))} />
                </>
              }
            />
            <TicketThread messages={t.messages} canInternal sending={reply.isPending} onReply={(body, isInternal) => reply.mutateAsync({ body, isInternal })} />
          </>
        )}
      </QueryView>
    </>
  );
}
