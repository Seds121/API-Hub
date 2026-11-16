'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { call, useAction, useApi } from '@/lib/query';
import { date, relative } from '@/lib/utils';

interface Ticket { id: string; number: number; subject: string; status: string; priority: string; category: string; updatedAt: string; org: { id: string; name: string }; createdBy: { name: string; email: string }; _count: { messages: number } }
interface Contact { id: string; name: string; email: string; company: string | null; topic: string; message: string; handled: boolean; createdAt: string }

export default function AdminSupport() {
  const router = useRouter();
  const [status, setStatus] = useState('OPEN');
  const q = useApi<Ticket[]>(`/api/admin/support/tickets${status ? `?status=${status}` : ''}`, ['admin-tickets', status]);
  const contacts = useApi<Contact[]>('/api/admin/support/contact-messages', ['admin-contacts']);
  const handled = useAction((id: string) => call(`/api/admin/support/contact-messages/${id}/handled`, { method: 'POST' }), { success: 'Marked handled', invalidate: [['admin-contacts']] });
  return (
    <>
      <PageHeader title="Support tickets" description="Customer tickets and website contact requests." />
      <Tabs defaultValue="tickets">
        <TabsList><TabsTrigger value="tickets">Tickets</TabsTrigger><TabsTrigger value="contacts">Contact requests</TabsTrigger></TabsList>
        <TabsContent value="tickets">
          <div className="mb-3 w-44"><Select value={status} onValueChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'OPEN', label: 'Open' }, { value: 'PENDING', label: 'Pending customer' }, { value: 'RESOLVED', label: 'Resolved' }, { value: 'CLOSED', label: 'Closed' }]} /></div>
          <QueryView q={q}>
            {(rows) => (
              <DataTable rows={rows} rowKey={(t) => t.id} onRowClick={(t) => router.push(`/admin/support/${t.id}`)} empty={{ title: 'No tickets' }} columns={[
                { header: '#', cell: (t) => <span className="font-mono text-xs">#{t.number}</span> },
                { header: 'Subject', cell: (t) => <Link href={`/admin/support/${t.id}`} className="font-medium hover:underline">{t.subject}</Link> },
                { header: 'Organization', cell: (t) => t.org.name },
                { header: 'From', cell: (t) => <span className="text-xs">{t.createdBy.email}</span> },
                { header: 'Priority', cell: (t) => <span className="text-xs">{t.priority}</span> },
                { header: 'Status', cell: (t) => <StatusBadge status={t.status} /> },
                { header: 'Updated', cell: (t) => relative(t.updatedAt) },
              ]} />
            )}
          </QueryView>
        </TabsContent>
        <TabsContent value="contacts">
          <QueryView q={contacts}>
            {(rows) => (
              <DataTable rows={rows} rowKey={(c) => c.id} empty={{ title: 'No contact requests' }} columns={[
                { header: 'Received', cell: (c) => date(c.createdAt, true) },
                { header: 'From', cell: (c) => (<div><p className="font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{c.email}{c.company && ` · ${c.company}`}</p></div>) },
                { header: 'Topic', cell: (c) => c.topic },
                { header: 'Message', cell: (c) => <p className="line-clamp-3 max-w-md text-xs">{c.message}</p> },
                { header: '', cell: (c) => (c.handled ? <StatusBadge status="RESOLVED" /> : <Button size="sm" variant="outline" onClick={() => handled.mutate(c.id)}>Mark handled</Button>) },
              ]} />
            )}
          </QueryView>
        </TabsContent>
      </Tabs>
    </>
  );
}
