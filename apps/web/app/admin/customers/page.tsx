'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { OrgsTable } from '@/components/admin/orgs-table';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { call, useAction, useApi } from '@/lib/query';
import type { Paged } from '@/lib/types';
import { relative } from '@/lib/utils';

interface UserRow { id: string; name: string; email: string; status: string; mfaEnabled: boolean; lastLoginAt: string | null; createdAt: string; memberships: { org: { id: string; name: string; type: string }; role: { key: string } }[] }

function Users() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const users = useApi<Paged<UserRow>>(`/api/admin/users?page=${page}&pageSize=25${q ? `&q=${encodeURIComponent(q)}` : ''}`, ['admin-users', q, page]);
  const setStatus = useAction((v: { id: string; status: string }) => call(`/api/admin/users/${v.id}`, { method: 'PATCH', body: { status: v.status } }), { success: 'User updated', invalidate: [['admin-users']] });
  return (
    <div className="space-y-3">
      <Input className="max-w-xs" placeholder="Search users" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} aria-label="Search users" />
      <QueryView q={users}>
        {(d) => (
          <DataTable rows={d.items} rowKey={(u) => u.id} pagination={{ page: d.page, pageCount: d.pageCount, total: d.total, onPage: setPage }} columns={[
            { header: 'User', cell: (u) => (<div><p className="font-medium">{u.name}</p><p className="text-xs text-muted-foreground">{u.email}</p></div>) },
            { header: 'Organizations', cell: (u) => <div className="flex flex-wrap gap-1">{u.memberships.map((m) => <Badge key={m.org.id} variant={m.org.type === 'PLATFORM' ? 'default' : 'outline'}>{m.org.name} · {m.role.key.replace(/^(ORG|PLATFORM)_/, '').toLowerCase()}</Badge>)}</div> },
            { header: 'MFA', cell: (u) => (u.mfaEnabled ? <Badge variant="success">on</Badge> : <Badge variant="secondary">off</Badge>) },
            { header: 'Last login', cell: (u) => relative(u.lastLoginAt) },
            { header: 'Status', cell: (u) => <StatusBadge status={u.status} /> },
            { header: '', cell: (u) => <ConfirmDialog trigger={<Button size="sm" variant="ghost">{u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</Button>} title={`${u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'} ${u.name}?`} description={u.status === 'ACTIVE' ? 'All their sessions are revoked immediately.' : 'They will be able to sign in again.'} destructive={u.status === 'ACTIVE'} onConfirm={() => setStatus.mutateAsync({ id: u.id, status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }).then(() => undefined)} /> },
          ]} />
        )}
      </QueryView>
    </div>
  );
}

export default function CustomersPage() {
  return (
    <>
      <PageHeader title="Customers" description="Direct customer organizations and the people who use the platform." />
      <Tabs defaultValue="orgs">
        <TabsList><TabsTrigger value="orgs">Customer accounts</TabsTrigger><TabsTrigger value="users">Users</TabsTrigger></TabsList>
        <TabsContent value="orgs"><OrgsTable type="CUSTOMER" showParent={false} extraFilter={(o) => !o.parent} /></TabsContent>
        <TabsContent value="users"><Users /></TabsContent>
      </Tabs>
    </>
  );
}
