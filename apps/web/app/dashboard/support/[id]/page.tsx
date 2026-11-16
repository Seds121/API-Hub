'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { TicketThread, TicketMsg } from '@/components/ticket-thread';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { call, useAction, useApi } from '@/lib/query';

interface Ticket { id: string; number: number; subject: string; status: string; priority: string; messages: TicketMsg[] }

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const q = useApi<Ticket>(`/api/support/tickets/${id}`, ['ticket', id]);
  const reply = useAction((body: string) => call(`/api/support/tickets/${id}/messages`, { method: 'POST', body: { body } }), { invalidate: [['ticket', id], ['tickets']] });
  const close = useAction(() => call(`/api/support/tickets/${id}/close`, { method: 'POST' }), { success: 'Ticket closed', invalidate: [['ticket', id], ['tickets']] });
  return (
    <>
      <Link href="/dashboard/support" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All tickets</Link>
      <QueryView q={q}>
        {(t) => (
          <>
            <PageHeader title={t.subject} description={`Ticket #${t.number} · ${t.priority.toLowerCase()} priority`} badge={<StatusBadge status={t.status} />} actions={t.status !== 'CLOSED' && <ConfirmDialog trigger={<Button variant="outline">Close ticket</Button>} title="Close this ticket?" description="You can open a new ticket at any time." onConfirm={() => close.mutateAsync().then(() => undefined)} />} />
            <TicketThread messages={t.messages} closed={t.status === 'CLOSED'} sending={reply.isPending} onReply={(b) => reply.mutateAsync(b)} />
          </>
        )}
      </QueryView>
    </>
  );
}
