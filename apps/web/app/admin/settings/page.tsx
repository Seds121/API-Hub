'use client';
import { useEffect, useState } from 'react';
import { BellRing, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { call, useAction, useApi } from '@/lib/query';
import type { Paged } from '@/lib/types';
import { date, relative } from '@/lib/utils';

interface Settings { maintenanceBanner: string | null; signupsEnabled: boolean; dataRetentionDays: number; auditRetentionDays: number; healthCheckIntervalMinutes: number; defaultLowBalanceThreshold: string; supportEmail: string | null }
interface Rule { id: string; name: string; metric: string; threshold: string; windowMinutes: number; channel: string; target: string | null; isActive: boolean; lastFiredAt: string | null }
interface Ev { id: string; message: string; severity: string; createdAt: string; resolvedAt: string | null; rule: { name: string; metric: string } }

const METRICS = [
  ['PROVIDER_DOWN', 'Provider down (threshold ignored)'],
  ['ERROR_RATE', '5xx error rate % over window'],
  ['LATENCY_MS', 'Avg supplier latency (ms) over window'],
  ['LOW_BALANCE', 'Customer wallet below USD'],
  ['PROVIDER_SUBSCRIPTION_EXPIRY', 'Supplier subscription expires within N days'],
  ['LICENSE_EXPIRY', 'Redistribution license expires within N days'],
];

function General() {
  const q = useApi<Settings>('/api/admin/settings', ['admin-settings']);
  const [v, setV] = useState<Settings | null>(null);
  useEffect(() => { if (q.data) setV(q.data); }, [q.data]);
  const save = useAction(() => call('/api/admin/settings', { method: 'PUT', body: v! }), { success: 'Settings saved', invalidate: [['admin-settings']] });
  if (!v) return <QueryView q={q}>{() => null}</QueryView>;
  return (
    <Card>
      <CardHeader><CardTitle>Platform settings</CardTitle><CardDescription>Changes are audited.</CardDescription></CardHeader>
      <CardContent>
        <form className="grid max-w-2xl gap-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
          <Field label="Maintenance banner" hint="Shown to all users when set" htmlFor="mb"><Input id="mb" value={v.maintenanceBanner ?? ''} onChange={(e) => setV({ ...v, maintenanceBanner: e.target.value || null })} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Request data retention (days)" hint="Usage metadata is purged after this" htmlFor="dr"><Input id="dr" type="number" min={7} value={v.dataRetentionDays} onChange={(e) => setV({ ...v, dataRetentionDays: Number(e.target.value) })} /></Field>
            <Field label="Audit retention (days)" htmlFor="ar"><Input id="ar" type="number" min={90} value={v.auditRetentionDays} onChange={(e) => setV({ ...v, auditRetentionDays: Number(e.target.value) })} /></Field>
            <Field label="Health-check interval (min)" htmlFor="hc"><Input id="hc" type="number" min={1} value={v.healthCheckIntervalMinutes} onChange={(e) => setV({ ...v, healthCheckIntervalMinutes: Number(e.target.value) })} /></Field>
            <Field label="Default low-balance threshold (USD)" htmlFor="lb"><Input id="lb" value={v.defaultLowBalanceThreshold} onChange={(e) => setV({ ...v, defaultLowBalanceThreshold: e.target.value })} /></Field>
          </div>
          <Field label="Support email" htmlFor="se"><Input id="se" type="email" value={v.supportEmail ?? ''} onChange={(e) => setV({ ...v, supportEmail: e.target.value || null })} /></Field>
          <label className="flex items-center gap-3 text-sm"><Switch checked={v.signupsEnabled} onCheckedChange={(c) => setV({ ...v, signupsEnabled: c })} /> Public sign-ups enabled</label>
          <Button type="submit" className="w-fit" loading={save.isPending}>Save settings</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Alerts() {
  const rules = useApi<Rule[]>('/api/admin/alerts', ['admin-alerts']);
  const events = useApi<Paged<Ev>>('/api/admin/alert-events?pageSize=50', ['admin-alert-events'], { refetchInterval: 60_000 });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: '', metric: 'ERROR_RATE', threshold: '10', windowMinutes: '15', channel: 'LOG', target: '' });
  const create = useAction(() => call('/api/admin/alerts', { method: 'POST', body: { ...v, windowMinutes: Number(v.windowMinutes), target: v.target || null } }), { success: 'Alert rule created', invalidate: [['admin-alerts']], onSuccess: () => setOpen(false) });
  const toggle = useAction((r: Rule) => call(`/api/admin/alerts/${r.id}`, { method: 'PATCH', body: { isActive: !r.isActive } }), { invalidate: [['admin-alerts']] });
  const del = useAction((id: string) => call(`/api/admin/alerts/${id}`, { method: 'DELETE' }), { success: 'Rule deleted', invalidate: [['admin-alerts']] });
  const resolve = useAction((id: string) => call(`/api/admin/alert-events/${id}/resolve`, { method: 'POST' }), { invalidate: [['admin-alert-events']] });
  return (
    <div className="space-y-6">
      <QueryView q={rules}>
        {(rows) => (
          <DataTable rows={rows} rowKey={(r) => r.id} toolbar={<Button size="sm" onClick={() => setOpen(true)}><Plus /> New alert</Button>} empty={{ title: 'No alert rules' }} columns={[
            { header: 'Rule', cell: (r) => <span className="font-medium">{r.name}</span> },
            { header: 'Metric', cell: (r) => <code className="text-xs">{r.metric}</code> },
            { header: 'Threshold', cell: (r) => Number(r.threshold) },
            { header: 'Window', cell: (r) => `${r.windowMinutes}m` },
            { header: 'Channel', cell: (r) => <span className="text-xs">{r.channel}{r.target ? ` → ${r.target}` : ''}</span> },
            { header: 'Last fired', cell: (r) => relative(r.lastFiredAt) },
            { header: 'Active', cell: (r) => <Switch checked={r.isActive} onCheckedChange={() => toggle.mutate(r)} aria-label="Toggle rule" /> },
            { header: '', cell: (r) => <ConfirmDialog trigger={<Button variant="ghost" size="icon" aria-label="Delete rule"><Trash2 /></Button>} title="Delete alert rule?" description="Its history is deleted too." destructive onConfirm={() => del.mutateAsync(r.id).then(() => undefined)} /> },
          ]} />
        )}
      </QueryView>
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><BellRing className="h-4 w-4" /> Recent alerts</h2>
        <QueryView q={events}>
          {(d) => (
            <DataTable rows={d.items} rowKey={(e) => e.id} dense empty={{ title: 'No alerts fired' }} columns={[
              { header: 'When', cell: (e) => date(e.createdAt, true) },
              { header: 'Rule', cell: (e) => e.rule.name },
              { header: 'Severity', cell: (e) => <StatusBadge status={e.severity === 'critical' ? 'FAILED' : e.severity === 'warning' ? 'PENDING' : 'OPEN'} /> },
              { header: 'Message', cell: (e) => <span className="text-xs">{e.message}</span> },
              { header: '', cell: (e) => (e.resolvedAt ? <span className="text-xs text-muted-foreground">resolved</span> : <Button size="sm" variant="ghost" onClick={() => resolve.mutate(e.id)}>Resolve</Button>) },
            ]} />
          )}
        </QueryView>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New alert rule</DialogTitle></DialogHeader>
          <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), create.mutate())}>
            <Field label="Name" htmlFor="an"><Input id="an" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
            <Field label="Metric"><Select value={v.metric} onValueChange={(m) => setV({ ...v, metric: m })} options={METRICS.map(([value, label]) => ({ value: value!, label: label! }))} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Threshold" htmlFor="at"><Input id="at" required value={v.threshold} onChange={(e) => setV({ ...v, threshold: e.target.value })} /></Field>
              <Field label="Window / cooldown (min)" htmlFor="aw"><Input id="aw" type="number" min={1} value={v.windowMinutes} onChange={(e) => setV({ ...v, windowMinutes: e.target.value })} /></Field>
            </div>
            <Field label="Channel"><Select value={v.channel} onValueChange={(c) => setV({ ...v, channel: c })} options={[{ value: 'LOG', label: 'Admin console + logs' }, { value: 'WEBHOOK', label: 'Webhook (Slack/Teams/etc.)' }, { value: 'EMAIL', label: 'Email (requires SMTP)' }]} /></Field>
            {v.channel !== 'LOG' && <Field label={v.channel === 'WEBHOOK' ? 'Webhook URL (https)' : 'Email address'} htmlFor="ag"><Input id="ag" required value={v.target} onChange={(e) => setV({ ...v, target: e.target.value })} /></Field>}
            <Button type="submit" loading={create.isPending}>Create rule</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminSettings() {
  return (
    <>
      <PageHeader title="System settings" description="Platform configuration, retention policy and monitoring alerts." />
      <Tabs defaultValue="general">
        <TabsList><TabsTrigger value="general">General</TabsTrigger><TabsTrigger value="alerts">Monitoring & alerts</TabsTrigger></TabsList>
        <TabsContent value="general"><General /></TabsContent>
        <TabsContent value="alerts"><Alerts /></TabsContent>
      </Tabs>
    </>
  );
}
