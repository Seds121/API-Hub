'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, HeartPulse, Pencil, Plus, ShieldCheck, ShieldX, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { HttpStatus, MethodBadge, StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Field } from '@/components/ui/label';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProviderForm } from '@/components/admin/provider-form';
import { connectorDef, type CredentialKindName } from '@zeze/shared';
import { Rocket } from 'lucide-react';
import { IntegrationTester } from '@/components/admin/integration-dialogs';
import { call, useAction, useApi } from '@/lib/query';
import type { Integration, License, Provider } from '@/lib/admin-types';
import type { ParamDef } from '@/lib/types';
import { date, money, relative } from '@/lib/utils';


function CredentialDialog({ provider, onClose }: { provider: Provider; onClose: () => void }) {
  // Credential kinds + field labels come from the connector registry (e.g. "Brave API key").
  const def = connectorDef(provider.kind);
  const fromAuth: Record<string, CredentialKindName> = { API_KEY: 'API_KEY', BEARER: 'BEARER_TOKEN', BASIC: 'BASIC', OAUTH2: 'OAUTH2_CLIENT', CUSTOM_HEADERS: 'HEADERS' };
  const preferred = fromAuth[provider.authType];
  const defaultKind = preferred && def.credential.kinds.includes(preferred) ? preferred : def.credential.kinds[0]!;
  const [kind, setKind] = useState<CredentialKindName>(defaultKind);
  const fields = def.credential.fields[kind] ?? [];
  const [label, setLabel] = useState('Primary');
  const [secret, setSecret] = useState<Record<string, string>>({});
  const [expiresAt, setExpiresAt] = useState('');
  const [keepPrevious, setKeepPrevious] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = useAction((body: object) => call(`/api/admin/providers/${provider.id}/credentials`, { method: 'POST', body }), { success: 'Credential stored (encrypted)', invalidate: [['admin-provider', provider.id], ['admin-providers']], onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add supplier credential</DialogTitle>
          <DialogDescription>{def.credential.help} Encrypted with AES-256-GCM on the server; it can never be viewed again — only replaced. Never paste customer keys here.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            const s: Record<string, unknown> = { ...secret };
            if (kind === 'HEADERS') {
              try {
                s.headers = JSON.parse(secret.headers ?? '{}');
              } catch {
                return setErr('Headers must be JSON');
              }
            }
            setErr(null);
            save.mutate({ label, kind, secret: s, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null, keepPrevious });
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Label" htmlFor="cl"><Input id="cl" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
            <Field label="Type"><Select value={kind} disabled={def.credential.kinds.length === 1} onValueChange={(k) => (setKind(k as CredentialKindName), setSecret({}))} options={def.credential.kinds.map((k) => ({ value: k, label: k.replace('_', ' ') }))} /></Field>
          </div>
          {fields.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`s-${f.key}`}><Input id={`s-${f.key}`} type={f.secret ? 'password' : 'text'} autoComplete="new-password" value={secret[f.key] ?? ''} onChange={(e) => setSecret({ ...secret, [f.key]: e.target.value })} /></Field>
          ))}
          <Field label="Expires" hint="Optional — from the supplier subscription" htmlFor="ce"><Input id="ce" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></Field>
          <label className="flex items-center gap-3 text-sm"><Switch checked={keepPrevious} onCheckedChange={setKeepPrevious} /> Keep previous credentials active (otherwise rotate)</label>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" loading={save.isPending}>Store credential</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LicenseDialog({ provider, onClose }: { provider: Provider; onClose: () => void }) {
  const [v, setV] = useState({ redistributionAllowed: true, subResaleAllowed: false, cachingAllowed: false, cacheTtlSeconds: '', territory: '', restrictions: '', documentRef: '', evidenceNotes: '', expiresAt: '' });
  const save = useAction(() => call(`/api/admin/providers/${provider.id}/licenses`, { method: 'POST', body: { ...v, cacheTtlSeconds: v.cacheTtlSeconds ? Number(v.cacheTtlSeconds) : null, expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : null, territory: v.territory || null, restrictions: v.restrictions || null, documentRef: v.documentRef || null, evidenceNotes: v.evidenceNotes || null } }), { success: 'License recorded as PENDING — verify it to activate', invalidate: [['admin-provider', provider.id], ['admin-providers']], onSuccess: onClose });
  const t = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record redistribution license</DialogTitle>
          <DialogDescription>Purchasing access does not grant resale rights. Record the supplier’s written authorization; an administrator must then verify it before any API can go live.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
          <div className="grid gap-2 text-sm">
            <label className="flex items-center gap-3"><Switch checked={v.redistributionAllowed} onCheckedChange={(c) => setV({ ...v, redistributionAllowed: c })} /> Downstream redistribution permitted</label>
            <label className="flex items-center gap-3"><Switch checked={v.subResaleAllowed} onCheckedChange={(c) => setV({ ...v, subResaleAllowed: c })} /> Agencies may resell to their clients</label>
            <label className="flex items-center gap-3"><Switch checked={v.cachingAllowed} onCheckedChange={(c) => setV({ ...v, cachingAllowed: c })} /> Response caching permitted</label>
          </div>
          {v.cachingAllowed && <Field label="Max cache TTL (seconds)" htmlFor="ttl"><Input id="ttl" type="number" min={1} value={v.cacheTtlSeconds} onChange={t('cacheTtlSeconds')} /></Field>}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Agreement reference" hint="Contract ID / document link" htmlFor="dr"><Input id="dr" value={v.documentRef} onChange={t('documentRef')} /></Field>
            <Field label="Expires" htmlFor="le"><Input id="le" type="date" value={v.expiresAt} onChange={t('expiresAt')} /></Field>
          </div>
          <Field label="Territory" htmlFor="ter"><Input id="ter" placeholder="e.g. Worldwide excl. sanctioned countries" value={v.territory} onChange={t('territory')} /></Field>
          <Field label="Restrictions" htmlFor="res"><Textarea id="res" rows={2} value={v.restrictions} onChange={t('restrictions')} /></Field>
          <Field label="Evidence notes" htmlFor="ev"><Textarea id="ev" rows={2} value={v.evidenceNotes} onChange={t('evidenceNotes')} /></Field>
          <Button type="submit" loading={save.isPending}>Record license</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubscriptionDialog({ provider, onClose }: { provider: Provider; onClose: () => void }) {
  const [v, setV] = useState({ planName: '', externalRef: '', startsAt: new Date().toISOString().slice(0, 10), expiresAt: '', monthlyFee: '', includedCalls: '', usageLimitPerMonth: '', usageLimitPerDay: '', overagePricePerCall: '', notes: '' });
  const n = (s: string) => (s ? Number(s) : null);
  const save = useAction(() => call(`/api/admin/providers/${provider.id}/subscriptions`, { method: 'POST', body: { planName: v.planName, externalRef: v.externalRef || null, startsAt: new Date(v.startsAt).toISOString(), expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : null, monthlyFee: v.monthlyFee || null, includedCalls: n(v.includedCalls), usageLimitPerMonth: n(v.usageLimitPerMonth), usageLimitPerDay: n(v.usageLimitPerDay), overagePricePerCall: v.overagePricePerCall || null, notes: v.notes || null } }), { success: 'Supplier subscription recorded', invalidate: [['admin-provider', provider.id]], onSuccess: onClose });
  const t = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record supplier subscription</DialogTitle><DialogDescription>Quotas set here are enforced by the gateway so we never exceed supplier limits.</DialogDescription></DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Plan name" htmlFor="pl"><Input id="pl" required value={v.planName} onChange={t('planName')} /></Field>
            <Field label="Supplier reference" htmlFor="xr"><Input id="xr" value={v.externalRef} onChange={t('externalRef')} /></Field>
            <Field label="Starts" htmlFor="st"><Input id="st" type="date" required value={v.startsAt} onChange={t('startsAt')} /></Field>
            <Field label="Expires" htmlFor="ex"><Input id="ex" type="date" value={v.expiresAt} onChange={t('expiresAt')} /></Field>
            <Field label="Monthly fee (USD)" htmlFor="mf"><Input id="mf" type="number" step="0.01" value={v.monthlyFee} onChange={t('monthlyFee')} /></Field>
            <Field label="Overage per call" htmlFor="op"><Input id="op" type="number" step="0.000001" value={v.overagePricePerCall} onChange={t('overagePricePerCall')} /></Field>
            <Field label="Limit / day" htmlFor="ld"><Input id="ld" type="number" value={v.usageLimitPerDay} onChange={t('usageLimitPerDay')} /></Field>
            <Field label="Limit / month" htmlFor="lm"><Input id="lm" type="number" value={v.usageLimitPerMonth} onChange={t('usageLimitPerMonth')} /></Field>
          </div>
          <Field label="Notes" htmlFor="sn"><Textarea id="sn" rows={2} value={v.notes} onChange={t('notes')} /></Field>
          <Button type="submit" loading={save.isPending}>Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Connector templates (registry) → one-click DRAFT API bound to this provider. Publishing still needs license + price. */
function QuickStart({ provider }: { provider: Provider }) {
  const router = useRouter();
  const def = connectorDef(provider.kind);
  const create = useAction((templateId: string) => call<{ productId: string; suggestedPricePerRequest: string }>(`/api/admin/providers/${provider.id}/templates/${templateId}`, { method: 'POST' }), {
    success: (r) => `Draft API created. Next: record the license, set a price (suggested $${r.suggestedPricePerRequest}/request), test and publish.`,
    invalidate: [['admin-provider', provider.id], ['admin-products']],
    onSuccess: (r) => router.push(`/admin/products/${r.productId}`),
  });
  if (!def.templates.length) return null;
  return (
    <Card className="mb-6 border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Rocket className="h-4 w-4" /> Quick start</CardTitle>
        <CardDescription>Create a ready-made {def.label} API as a draft. It is not published until a verified redistribution license and a price exist.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {def.templates.map((t) => (
          <div key={t.id} className="flex flex-col gap-2 rounded-lg border p-4">
            <p className="font-medium">{t.label}</p>
            <p className="text-xs text-muted-foreground">{t.description}</p>
            <p className="font-mono text-xs">/v1/{t.product.slug}{t.endpoint.path}</p>
            <Button size="sm" className="mt-auto w-fit" loading={create.isPending} onClick={() => create.mutate(t.id)}>Create draft API from template</Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function ProviderDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const q = useApi<Provider & { integrations: Integration[] }>(`/api/admin/providers/${id}`, ['admin-provider', id]);
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<'cred' | 'lic' | 'sub' | null>(null);
  const [testing, setTesting] = useState<Integration | null>(null);
  const inv = [['admin-provider', id], ['admin-providers']];
  const update = useAction((b: object) => call(`/api/admin/providers/${id}`, { method: 'PATCH', body: b }), { success: 'Provider saved', invalidate: inv, onSuccess: () => setEditing(false) });
  const health = useAction(() => call<{ ok: boolean; statusCode: number | null; error: string | null }>(`/api/admin/providers/${id}/health-check`, { method: 'POST' }), { success: (r) => (r.ok ? 'Provider healthy' : `Unhealthy: ${r.error ?? r.statusCode}`), invalidate: inv });
  const toggleCred = useAction((v: { cid: string; active: boolean }) => call(`/api/admin/providers/${id}/credentials/${v.cid}/${v.active ? 'activate' : 'deactivate'}`, { method: 'POST' }), { success: 'Credential updated', invalidate: inv });
  const decide = useAction((v: { lid: string; decision: string }) => call(`/api/admin/providers/${id}/licenses/${v.lid}/decision`, { method: 'POST', body: { decision: v.decision } }), { success: 'License decision recorded', invalidate: inv });
  const remove = useAction(() => call(`/api/admin/providers/${id}`, { method: 'DELETE' }), { success: 'Provider deleted', invalidate: [['admin-providers']], onSuccess: () => router.push('/admin/providers') });

  return (
    <>
      <Link href="/admin/providers" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Providers</Link>
      <QueryView q={q}>
        {(p) => (
          <>
            <PageHeader
              title={p.name}
              badge={<><StatusBadge status={p.status} />{p.isMock && <Badge variant="warning">mock</Badge>}</>}
              description={<span className="font-mono text-xs">{connectorDef(p.kind).label} · {p.baseUrl} · circuit {p.circuit?.state.toLowerCase()}</span>}
              actions={
                <>
                  <Button variant="outline" onClick={() => health.mutate()} loading={health.isPending}><HeartPulse /> Health check</Button>
                  <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
                  <ConfirmDialog trigger={<Button variant="ghost" size="icon" aria-label="Delete provider"><Trash2 /></Button>} title="Delete provider?" description="Only possible when no published API depends on it." destructive confirmLabel="Delete" onConfirm={() => remove.mutateAsync().then(() => undefined)} />
                </>
              }
            />
            <QuickStart provider={p} />
            <Tabs defaultValue="credentials">
              <TabsList className="flex-wrap">
                <TabsTrigger value="credentials">Credentials</TabsTrigger>
                <TabsTrigger value="licenses">Licenses</TabsTrigger>
                <TabsTrigger value="subscriptions">Supplier subscriptions</TabsTrigger>
                <TabsTrigger value="integrations">Integrations ({p.integrations.length})</TabsTrigger>
                <TabsTrigger value="health">Health</TabsTrigger>
                <TabsTrigger value="config">Configuration</TabsTrigger>
              </TabsList>
              <TabsContent value="credentials">
                <DataTable rows={p.credentials} rowKey={(c) => c.id} toolbar={<Button size="sm" onClick={() => setDialog('cred')}><Plus /> Add / rotate credential</Button>} empty={{ title: 'No credentials', description: 'The gateway cannot call this provider until a credential is stored.' }} columns={[
                  { header: 'Label', cell: (c) => <span className="font-medium">{c.label}</span> },
                  { header: 'Type', cell: (c) => c.kind },
                  { header: 'Hint', cell: (c) => <code className="text-xs">{c.hint}</code> },
                  { header: 'Key version', cell: (c) => `v${c.keyVersion}` },
                  { header: 'Expires', cell: (c) => date(c.expiresAt) },
                  { header: 'Status', cell: (c) => <StatusBadge status={c.isActive ? 'ACTIVE' : 'DISABLED'} /> },
                  { header: '', cell: (c) => <Button size="sm" variant="ghost" onClick={() => toggleCred.mutate({ cid: c.id, active: !c.isActive })}>{c.isActive ? 'Deactivate' : 'Activate'}</Button> },
                ]} />
              </TabsContent>
              <TabsContent value="licenses">
                <DataTable rows={p.licenses as License[]} rowKey={(l) => l.id} toolbar={<Button size="sm" onClick={() => setDialog('lic')}><Plus /> Record license</Button>} empty={{ title: 'No license recorded', description: 'APIs using this provider cannot be published until a redistribution license is verified.' }} columns={[
                  { header: 'Scope', cell: (l) => l.apiProduct?.name ?? 'All products' },
                  { header: 'Rights', cell: (l) => (<div className="flex flex-wrap gap-1">{l.redistributionAllowed && <Badge variant="success">resale</Badge>}{l.subResaleAllowed && <Badge>sub-resale</Badge>}{l.cachingAllowed && <Badge variant="secondary">cache {l.cacheTtlSeconds}s</Badge>}{l.isDemo && <Badge variant="warning">demo</Badge>}</div>) },
                  { header: 'Reference', cell: (l) => <span className="text-xs">{l.documentRef ?? '—'}</span> },
                  { header: 'Expires', cell: (l) => date(l.expiresAt) },
                  { header: 'Status', cell: (l) => <StatusBadge status={l.status} /> },
                  { header: '', cell: (l) => (
                    <div className="flex justify-end gap-1">
                      {l.status !== 'VERIFIED' && <ConfirmDialog trigger={<Button size="sm" variant="outline"><ShieldCheck /> Verify</Button>} title="Verify this license?" description="You confirm you have reviewed the supplier’s written authorization for downstream redistribution. Your name is recorded." confirmLabel="Verify" onConfirm={() => decide.mutateAsync({ lid: l.id, decision: 'VERIFIED' }).then(() => undefined)} />}
                      {l.status === 'VERIFIED' && <ConfirmDialog trigger={<Button size="sm" variant="ghost"><ShieldX /> Revoke</Button>} title="Revoke license?" description="Published APIs that lose license coverage are disabled immediately." destructive confirmLabel="Revoke" onConfirm={() => decide.mutateAsync({ lid: l.id, decision: 'REVOKED' }).then(() => undefined)} />}
                    </div>
                  ) },
                ]} />
              </TabsContent>
              <TabsContent value="subscriptions">
                <DataTable rows={p.subscriptions} rowKey={(s) => s.id} toolbar={<Button size="sm" onClick={() => setDialog('sub')}><Plus /> Record subscription</Button>} empty={{ title: 'No supplier subscription recorded' }} columns={[
                  { header: 'Plan', cell: (s) => <span className="font-medium">{s.planName}</span> },
                  { header: 'Period', cell: (s) => <span className="text-xs">{date(s.startsAt)} → {date(s.expiresAt)}</span> },
                  { header: 'Fee', cell: (s) => (s.monthlyFee ? `${money(s.monthlyFee)}/mo` : '—') },
                  { header: 'Limits', cell: (s) => <span className="text-xs">{s.usageLimitPerDay ? `${s.usageLimitPerDay}/day ` : ''}{s.usageLimitPerMonth ? `${s.usageLimitPerMonth}/mo` : ''}{!s.usageLimitPerDay && !s.usageLimitPerMonth && '—'}</span> },
                  { header: 'Status', cell: (s) => <StatusBadge status={s.status} /> },
                ]} />
              </TabsContent>
              <TabsContent value="integrations">
                <DataTable rows={p.integrations} rowKey={(i) => i.id} empty={{ title: 'Not used by any endpoint yet', description: 'Connect endpoints from API Marketplace → product → endpoints.' }} columns={[
                  { header: 'Product', cell: (i) => <Link className="hover:underline" href={`/admin/products/${i.endpoint?.product.id}`}>{i.endpoint?.product.name}</Link> },
                  { header: 'Public', cell: (i) => <span className="flex items-center gap-2"><MethodBadge method={i.endpoint?.method ?? 'GET'} /><code className="text-xs">{i.endpoint?.path}</code></span> },
                  { header: 'Upstream', cell: (i) => <code className="text-xs">{i.upstreamMethod} {i.upstreamPath}</code> },
                  { header: 'Last test', cell: (i) => (i.lastTestedAt ? <span className="text-xs">{i.lastTestOk ? '✓' : '✗'} {relative(i.lastTestedAt)}</span> : '—') },
                  { header: '', cell: (i) => <Button size="sm" variant="outline" onClick={() => setTesting(i)}>Test</Button> },
                ]} />
              </TabsContent>
              <TabsContent value="health">
                <DataTable rows={p.healthChecks} rowKey={(h) => h.id} dense empty={{ title: 'No health checks yet' }} columns={[
                  { header: 'Checked', cell: (h) => date(h.checkedAt, true) },
                  { header: 'Result', cell: (h) => <StatusBadge status={h.ok ? 'ACTIVE' : 'DOWN'} /> },
                  { header: 'HTTP', cell: (h) => (h.statusCode ? <HttpStatus code={h.statusCode} /> : '—') },
                  { header: 'Latency', cell: (h) => (h.latencyMs ? `${h.latencyMs} ms` : '—') },
                  { header: 'Error', cell: (h) => <span className="text-xs text-muted-foreground">{h.error ?? ''}</span> },
                ]} />
              </TabsContent>
              <TabsContent value="config">
                <Card>
                  <CardHeader><CardTitle>Configuration</CardTitle><CardDescription>Allowed hosts: {p.allowedHosts.join(', ')}</CardDescription></CardHeader>
                  <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                    {[['Auth', connectorDef(p.kind).fixedAuthType ? connectorDef(p.kind).authSummary : p.authType], ['Timeout', `${p.timeoutMs} ms`], ['Retries', `${p.retryMaxAttempts} (backoff ${p.retryBackoffMs} ms, on ${p.retryOnStatuses.join(', ')})`], ['Max concurrency', p.maxConcurrency], ['Supplier rate limit', p.rateLimitPerMinute ? `${p.rateLimitPerMinute}/min` : 'none'], ['Health path', p.healthCheckPath ?? '—']].map(([k, v]) => (
                      <div key={String(k)} className="flex justify-between gap-4 rounded-md bg-muted/50 px-3 py-2"><span className="text-muted-foreground">{k}</span><span className="text-right font-medium">{v}</span></div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
            <Dialog open={editing} onOpenChange={setEditing}>
              <DialogContent wide>
                <DialogHeader><DialogTitle>Edit provider</DialogTitle></DialogHeader>
                <ProviderForm initial={p} onSubmit={(b) => update.mutate(b)} submitting={update.isPending} />
              </DialogContent>
            </Dialog>
            {dialog === 'cred' && <CredentialDialog provider={p} onClose={() => setDialog(null)} />}
            {dialog === 'lic' && <LicenseDialog provider={p} onClose={() => setDialog(null)} />}
            {dialog === 'sub' && <SubscriptionDialog provider={p} onClose={() => setDialog(null)} />}
            {testing && <IntegrationTester integration={{ ...testing, provider: { id: p.id, name: p.name, kind: p.kind, status: p.status } }} params={(testing.endpoint?.params as ParamDef[]) ?? []} onClose={() => setTesting(null)} invalidate={inv} />}
          </>
        )}
      </QueryView>
    </>
  );
}
