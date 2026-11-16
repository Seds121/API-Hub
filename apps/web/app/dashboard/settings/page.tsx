'use client';
import { useEffect, useState } from 'react';
import { Monitor, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { QueryView } from '@/components/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { CodeBlock } from '@/components/code-block';
import { call, useAction, useApi } from '@/lib/query';
import { can, useMe } from '@/lib/session';
import { date, relative } from '@/lib/utils';

interface Org { id: string; name: string; billingEmail: string | null; country: string | null; taxId: string | null; monthlySpendLimit: string | null; parentOrgId: string | null; type: string; slug: string }
interface Member { id: string; user: { id: string; name: string; email: string; lastLoginAt: string | null; mfaEnabled: boolean }; role: { key: string; name: string } }
interface SessionRow { id: string; ip: string | null; userAgent: string | null; createdAt: string; lastSeenAt: string }
interface Audit { items: { id: string; action: string; createdAt: string; ip: string | null; targetType: string | null }[] }

const ROLES = [
  { value: 'ORG_OWNER', label: 'Owner' },
  { value: 'ORG_ADMIN', label: 'Admin' },
  { value: 'ORG_DEVELOPER', label: 'Developer' },
  { value: 'ORG_BILLING', label: 'Billing manager' },
  { value: 'ORG_VIEWER', label: 'Viewer' },
];

function OrgTab() {
  const me = useMe();
  const q = useApi<Org>('/api/org', ['org']);
  const [f, setF] = useState({ name: '', billingEmail: '', country: '', taxId: '', monthlySpendLimit: '' });
  useEffect(() => {
    if (q.data) setF({ name: q.data.name, billingEmail: q.data.billingEmail ?? '', country: q.data.country ?? '', taxId: q.data.taxId ?? '', monthlySpendLimit: q.data.monthlySpendLimit ?? '' });
  }, [q.data]);
  const save = useAction(() => call('/api/org', { method: 'PATCH', body: { name: f.name, billingEmail: f.billingEmail || null, country: f.country || null, taxId: f.taxId || null, ...(q.data?.parentOrgId ? {} : { monthlySpendLimit: f.monthlySpendLimit || null }) } }), { success: 'Organization updated', invalidate: [['org'], ['me']] });
  const writable = can(me.data, 'org:manage');
  return (
    <QueryView q={q}>
      {(o) => (
        <Card>
          <CardHeader><CardTitle>Organization profile</CardTitle><CardDescription>ID <code>{o.id}</code></CardDescription></CardHeader>
          <CardContent>
            <form className="grid max-w-xl gap-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
              <Field label="Name" htmlFor="on"><Input id="on" disabled={!writable} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label="Billing email" htmlFor="be"><Input id="be" type="email" disabled={!writable} value={f.billingEmail} onChange={(e) => setF({ ...f, billingEmail: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Country (ISO-2)" htmlFor="cc"><Input id="cc" maxLength={2} disabled={!writable} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value.toUpperCase() })} /></Field>
                <Field label="Tax ID" htmlFor="tx"><Input id="tx" disabled={!writable} value={f.taxId} onChange={(e) => setF({ ...f, taxId: e.target.value })} /></Field>
              </div>
              <Field label="Monthly spending limit (USD)" hint={o.parentOrgId ? 'Managed by your agency.' : 'Requests are declined once this month’s spend reaches the limit. Blank = no limit.'} htmlFor="sl">
                <Input id="sl" type="number" min={0} step="0.01" disabled={!writable || !!o.parentOrgId} value={f.monthlySpendLimit} onChange={(e) => setF({ ...f, monthlySpendLimit: e.target.value })} />
              </Field>
              {writable && <Button type="submit" loading={save.isPending} className="w-fit">Save changes</Button>}
            </form>
          </CardContent>
        </Card>
      )}
    </QueryView>
  );
}

function TeamTab() {
  const me = useMe();
  const q = useApi<Member[]>('/api/org/members', ['members']);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('ORG_DEVELOPER');
  const add = useAction(() => call('/api/org/members', { method: 'POST', body: { email, roleKey: role } }), { success: 'Member added', invalidate: [['members']], onSuccess: () => setEmail('') });
  const change = useAction((v: { id: string; roleKey: string }) => call(`/api/org/members/${v.id}`, { method: 'PATCH', body: { roleKey: v.roleKey } }), { success: 'Role updated', invalidate: [['members']] });
  const remove = useAction((id: string) => call(`/api/org/members/${id}`, { method: 'DELETE' }), { success: 'Member removed', invalidate: [['members']] });
  const writable = can(me.data, 'org:members:manage');
  return (
    <div className="space-y-4">
      {writable && (
        <Card>
          <CardHeader><CardTitle>Add a team member</CardTitle><CardDescription>They need an existing account. Ask them to register first, then add them by email.</CardDescription></CardHeader>
          <CardContent>
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => (e.preventDefault(), add.mutate())}>
              <Input type="email" required placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
              <Select className="sm:w-48" value={role} onValueChange={setRole} options={ROLES} />
              <Button type="submit" loading={add.isPending}><UserPlus /> Add</Button>
            </form>
          </CardContent>
        </Card>
      )}
      <QueryView q={q}>
        {(rows) => (
          <DataTable rows={rows} rowKey={(m) => m.id} columns={[
            { header: 'Member', cell: (m) => (<div><p className="font-medium">{m.user.name}{m.user.id === me.data?.user.id && <Badge variant="secondary" className="ml-2">you</Badge>}</p><p className="text-xs text-muted-foreground">{m.user.email}</p></div>) },
            { header: 'Role', cell: (m) => (writable && m.user.id !== me.data?.user.id ? <Select className="w-40" value={m.role.key} onValueChange={(v) => change.mutate({ id: m.id, roleKey: v })} options={ROLES} /> : <Badge variant="outline">{m.role.name}</Badge>) },
            { header: 'MFA', cell: (m) => (m.user.mfaEnabled ? <Badge variant="success">On</Badge> : <Badge variant="secondary">Off</Badge>) },
            { header: 'Last login', cell: (m) => <span className="text-muted-foreground">{relative(m.user.lastLoginAt)}</span> },
            { header: '', cell: (m) => (writable && m.user.id !== me.data?.user.id ? <ConfirmDialog trigger={<Button variant="ghost" size="icon" aria-label="Remove member"><Trash2 /></Button>} title={`Remove ${m.user.name}?`} description="They will lose access to this organization immediately." destructive confirmLabel="Remove" onConfirm={() => remove.mutateAsync(m.id).then(() => undefined)} /> : null) },
          ]} />
        )}
      </QueryView>
    </div>
  );
}

function SecurityTab() {
  const sessions = useApi<SessionRow[]>('/api/auth/sessions', ['sessions']);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [mfa, setMfa] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [disable, setDisable] = useState({ code: '', password: '' });
  const members = useApi<Member[]>('/api/org/members', ['members']);
  const me = useMe();
  const mfaOn = members.data?.find((m) => m.user.id === me.data?.user.id)?.user.mfaEnabled;
  const change = useAction(() => call('/api/auth/password', { method: 'POST', body: pw }), { success: 'Password changed. Other sessions were signed out.', onSuccess: () => setPw({ currentPassword: '', newPassword: '' }), invalidate: [['sessions']] });
  const setup = useAction(() => call<{ secret: string; otpauthUrl: string }>('/api/auth/mfa/setup', { method: 'POST' }), { onSuccess: setMfa });
  const enable = useAction(() => call('/api/auth/mfa/enable', { method: 'POST', body: { code } }), { success: 'Two-factor authentication enabled', invalidate: [['members']], onSuccess: () => setMfa(null) });
  const off = useAction(() => call('/api/auth/mfa/disable', { method: 'POST', body: disable }), { success: 'Two-factor authentication disabled', invalidate: [['members']] });
  const revoke = useAction((id: string) => call(`/api/auth/sessions/${id}`, { method: 'DELETE' }), { success: 'Session revoked', invalidate: [['sessions']] });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={(e) => (e.preventDefault(), change.mutate())}>
            <Field label="Current password" htmlFor="cp"><Input id="cp" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
            <Field label="New password" hint="10+ chars, upper & lower case, digit." htmlFor="np"><Input id="np" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
            <Button type="submit" className="w-fit" loading={change.isPending}>Update password</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Two-factor authentication</CardTitle><CardDescription>Time-based one-time codes (TOTP) from an authenticator app.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {mfaOn ? (
            <form className="grid gap-3" onSubmit={(e) => (e.preventDefault(), off.mutate())}>
              <Badge variant="success" className="w-fit">Enabled</Badge>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="6-digit code" value={disable.code} onChange={(e) => setDisable({ ...disable, code: e.target.value })} aria-label="MFA code" />
                <Input type="password" placeholder="Password" value={disable.password} onChange={(e) => setDisable({ ...disable, password: e.target.value })} aria-label="Password" />
              </div>
              <Button type="submit" variant="outline" className="w-fit" loading={off.isPending}>Disable 2FA</Button>
            </form>
          ) : mfa ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Add this secret to your authenticator app (or open the otpauth link on your phone), then enter the 6-digit code.</p>
              <CodeBlock code={mfa.secret} title="Secret" />
              <a className="block break-all text-xs text-primary underline" href={mfa.otpauthUrl}>{mfa.otpauthUrl}</a>
              <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), enable.mutate())}>
                <Input placeholder="123456" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Verification code" />
                <Button type="submit" loading={enable.isPending}>Verify & enable</Button>
              </form>
            </div>
          ) : (
            <Button onClick={() => setup.mutate()} loading={setup.isPending}>Set up 2FA</Button>
          )}
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="flex items-center gap-2"><Monitor className="h-4 w-4" /> Active sessions</CardTitle></CardHeader>
        <CardContent>
          <QueryView q={sessions}>
            {(rows) => (
              <DataTable rows={rows} rowKey={(s) => s.id} dense columns={[
                { header: 'Device', cell: (s) => <span className="line-clamp-1 max-w-md text-xs">{s.userAgent ?? 'Unknown'}</span> },
                { header: 'IP', cell: (s) => <code className="text-xs">{s.ip ?? '—'}</code> },
                { header: 'Signed in', cell: (s) => date(s.createdAt, true) },
                { header: 'Last active', cell: (s) => relative(s.lastSeenAt) },
                { header: '', cell: (s) => <Button variant="ghost" size="sm" onClick={() => revoke.mutate(s.id)}>Revoke</Button> },
              ]} />
            )}
          </QueryView>
        </CardContent>
      </Card>
    </div>
  );
}

function AuditTab() {
  const q = useApi<Audit>('/api/org/audit-logs', ['org-audit']);
  return (
    <QueryView q={q}>
      {(d) => (
        <DataTable rows={d.items} rowKey={(r) => r.id} dense empty={{ title: 'No audit events' }} columns={[
          { header: 'When', cell: (r) => date(r.createdAt, true) },
          { header: 'Action', cell: (r) => <code className="text-xs">{r.action}</code> },
          { header: 'Target', cell: (r) => r.targetType ?? '—' },
          { header: 'IP', cell: (r) => <code className="text-xs">{r.ip ?? '—'}</code> },
        ]} />
      )}
    </QueryView>
  );
}

export default function SettingsPage() {
  const me = useMe();
  return (
    <>
      <PageHeader title="Settings" description="Organization profile, team, security and audit trail." />
      <Tabs defaultValue="org">
        <TabsList>
          <TabsTrigger value="org">Organization</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          {can(me.data, 'org:manage') && <TabsTrigger value="audit">Audit log</TabsTrigger>}
        </TabsList>
        <TabsContent value="org"><OrgTab /></TabsContent>
        <TabsContent value="team"><TeamTab /></TabsContent>
        <TabsContent value="security"><SecurityTab /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </Tabs>
    </>
  );
}
