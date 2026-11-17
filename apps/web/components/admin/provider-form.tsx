'use client';
import { useState } from 'react';
import { Button } from '../ui/button';
import { Field } from '../ui/label';
import { Input, Textarea } from '../ui/input';
import { Select } from '../ui/select';
import { Switch } from '../ui/switch';
import type { Provider } from '@/lib/admin-types';
import { CONNECTOR_KINDS, connectorDef, type ConnectorKind } from '@zeze/shared';
import { Info } from 'lucide-react';

export type ProviderInput = Record<string, unknown>;

function otherHosts(p?: Partial<Provider>) {
  let base = '';
  try {
    base = new URL(p?.baseUrl ?? '').hostname;
  } catch {
    /* empty */
  }
  return (p?.allowedHosts ?? []).filter((h) => h !== base).join(', ');
}

/** Provider configuration form. Secrets are NOT entered here — they are stored as encrypted credentials. */
export function ProviderForm({ initial, onSubmit, submitting }: { initial?: Partial<Provider>; onSubmit: (v: ProviderInput) => void; submitting?: boolean }) {
  const [v, setV] = useState({
    name: initial?.name ?? '',
    slug: initial?.slug ?? '',
    kind: (initial?.kind ?? 'RAPIDAPI') as ConnectorKind,
    description: initial?.description ?? '',
    website: initial?.website ?? '',
    baseUrl: initial?.baseUrl ?? '',
    additionalAllowedHosts: otherHosts(initial),
    authType: initial?.authType ?? 'API_KEY',
    rapidApiHost: initial?.authConfig?.rapidApiHost ?? '',
    keyIn: initial?.authConfig?.in ?? 'header',
    keyName: initial?.authConfig?.name ?? '',
    tokenUrl: initial?.authConfig?.tokenUrl ?? '',
    scope: initial?.authConfig?.scope ?? '',
    defaultHeaders: JSON.stringify(initial?.defaultHeaders ?? {}),
    timeoutMs: String(initial?.timeoutMs ?? 10000),
    retryMaxAttempts: String(initial?.retryMaxAttempts ?? 1),
    retryBackoffMs: String(initial?.retryBackoffMs ?? 300),
    retryOnStatuses: (initial?.retryOnStatuses ?? [502, 503, 504]).join(','),
    maxConcurrency: String(initial?.maxConcurrency ?? 20),
    rateLimitPerMinute: initial?.rateLimitPerMinute ? String(initial.rateLimitPerMinute) : '',
    healthCheckPath: initial?.healthCheckPath ?? '',
    status: initial?.status ?? 'ACTIVE',
    isMock: initial?.isMock ?? false,
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const def = connectorDef(v.kind);
  const rapid = def.formHints.showRapidApiHost;
  const authChoosable = def.formHints.showAuthMethod;
  /** Switching connector pre-fills registry defaults without overwriting values the admin typed. */
  const chooseKind = (k: ConnectorKind) => {
    const next = connectorDef(k);
    const prevDefault = connectorDef(v.kind).defaultBaseUrl;
    setV({
      ...v,
      kind: k,
      baseUrl: !v.baseUrl || v.baseUrl === prevDefault ? (next.defaultBaseUrl ?? '') : v.baseUrl,
      timeoutMs: next.defaults?.timeoutMs && !initial?.id ? String(next.defaults.timeoutMs) : v.timeoutMs,
      rateLimitPerMinute: next.defaults?.rateLimitPerMinute && !v.rateLimitPerMinute && !initial?.id ? String(next.defaults.rateLimitPerMinute) : v.rateLimitPerMinute,
    });
  };
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        let headers: Record<string, string> = {};
        try {
          headers = v.defaultHeaders.trim() ? JSON.parse(v.defaultHeaders) : {};
        } catch {
          return setErr('Default headers must be a JSON object');
        }
        const authConfig: Record<string, string> = {};
        if (rapid && v.rapidApiHost) authConfig.rapidApiHost = v.rapidApiHost;
        if (authChoosable && v.authType === 'API_KEY') Object.assign(authConfig, { in: v.keyIn, ...(v.keyName ? { name: v.keyName } : {}) });
        if (authChoosable && v.authType === 'OAUTH2') Object.assign(authConfig, { tokenUrl: v.tokenUrl, ...(v.scope ? { scope: v.scope } : {}) });
        setErr(null);
        onSubmit({
          name: v.name,
          ...(initial?.id ? {} : { slug: v.slug }),
          kind: v.kind,
          description: v.description || null,
          website: v.website || null,
          baseUrl: v.baseUrl,
          additionalAllowedHosts: v.additionalAllowedHosts.split(/[\s,]+/).filter(Boolean),
          authType: def.fixedAuthType ?? v.authType,
          authConfig,
          defaultHeaders: headers,
          timeoutMs: Number(v.timeoutMs),
          retryMaxAttempts: Number(v.retryMaxAttempts),
          retryBackoffMs: Number(v.retryBackoffMs),
          retryOnStatuses: v.retryOnStatuses.split(',').map((s) => Number(s.trim())).filter(Boolean),
          maxConcurrency: Number(v.maxConcurrency),
          rateLimitPerMinute: v.rateLimitPerMinute ? Number(v.rateLimitPerMinute) : null,
          healthCheckPath: v.healthCheckPath || null,
          status: v.status,
          isMock: v.isMock,
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="pn"><Input id="pn" required value={v.name} onChange={set('name')} /></Field>
        <Field label="Slug" hint="lowercase letters, digits and dashes" htmlFor="ps"><Input id="ps" required value={v.slug} onChange={set('slug')} disabled={!!initial?.id} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Connector type">
          <Select value={v.kind} onValueChange={(k) => chooseKind(k as ConnectorKind)} options={CONNECTOR_KINDS.map((k) => ({ value: k, label: connectorDef(k).label }))} />
        </Field>
        <Field label="Status">
          <Select value={v.status} onValueChange={(s) => setV({ ...v, status: s })} options={['ACTIVE', 'DEGRADED', 'DOWN', 'DISABLED'].map((s) => ({ value: s, label: s }))} />
        </Field>
      </div>
      {def.formHints.onboarding.length > 0 && (
        <div className="space-y-1 rounded-md border border-primary/30 bg-accent/50 p-3 text-xs" role="note">
          <p className="flex items-center gap-1.5 font-medium text-accent-foreground"><Info className="h-3.5 w-3.5" /> {def.label}: {def.authSummary}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            {def.formHints.onboarding.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
      )}
      <Field label="Base URL" hint={def.formHints.baseUrlHelp} htmlFor="pb">
        <Input id="pb" required type="url" value={v.baseUrl} onChange={set('baseUrl')} />
      </Field>
      {rapid ? (
        <Field label="X-RapidAPI-Host" hint="Defaults to the base URL host." htmlFor="rh"><Input id="rh" value={v.rapidApiHost} onChange={set('rapidApiHost')} /></Field>
      ) : !authChoosable ? (
        <p className="text-xs text-muted-foreground">Authentication: <strong>{def.authSummary}</strong> — {def.credential.help}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Auth method">
            <Select value={v.authType} onValueChange={(a) => setV({ ...v, authType: a })} options={['NONE', 'API_KEY', 'BEARER', 'BASIC', 'OAUTH2', 'CUSTOM_HEADERS'].map((s) => ({ value: s, label: s.replace('_', ' ') }))} />
          </Field>
          {v.authType === 'API_KEY' && (
            <>
              <Field label="Key location"><Select value={v.keyIn} onValueChange={(k) => setV({ ...v, keyIn: k })} options={[{ value: 'header', label: 'Header' }, { value: 'query', label: 'Query parameter' }]} /></Field>
              <Field label="Header / parameter name" htmlFor="kn"><Input id="kn" placeholder="X-API-Key" value={v.keyName} onChange={set('keyName')} /></Field>
            </>
          )}
          {v.authType === 'OAUTH2' && (
            <>
              <Field label="Token URL" htmlFor="tu"><Input id="tu" type="url" value={v.tokenUrl} onChange={set('tokenUrl')} /></Field>
              <Field label="Scope" htmlFor="sc"><Input id="sc" value={v.scope} onChange={set('scope')} /></Field>
            </>
          )}
        </div>
      )}
      <Field label="Additional allowed hosts" hint="SSRF allowlist beyond the base URL host (comma separated)." htmlFor="ah"><Input id="ah" value={v.additionalAllowedHosts} onChange={set('additionalAllowedHosts')} /></Field>
      <Field label="Default headers (JSON, non-secret)" hint="Secrets must be stored as credentials, never here." htmlFor="dh"><Textarea id="dh" rows={2} className="font-mono text-xs" value={v.defaultHeaders} onChange={set('defaultHeaders')} /></Field>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Timeout (ms)" htmlFor="to"><Input id="to" type="number" value={v.timeoutMs} onChange={set('timeoutMs')} /></Field>
        <Field label="Retries" hint="GET/PUT/DELETE only" htmlFor="rt"><Input id="rt" type="number" min={0} max={5} value={v.retryMaxAttempts} onChange={set('retryMaxAttempts')} /></Field>
        <Field label="Backoff (ms)" htmlFor="bo"><Input id="bo" type="number" value={v.retryBackoffMs} onChange={set('retryBackoffMs')} /></Field>
        <Field label="Retry on statuses" htmlFor="ro"><Input id="ro" value={v.retryOnStatuses} onChange={set('retryOnStatuses')} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Max concurrency" htmlFor="mc"><Input id="mc" type="number" min={1} value={v.maxConcurrency} onChange={set('maxConcurrency')} /></Field>
        <Field label="Supplier rate limit / min" hint="Gateway never exceeds this" htmlFor="rl"><Input id="rl" type="number" min={1} value={v.rateLimitPerMinute} onChange={set('rateLimitPerMinute')} /></Field>
        <Field label="Health-check path" htmlFor="hp"><Input id="hp" placeholder="/health" value={v.healthCheckPath} onChange={set('healthCheckPath')} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Website" htmlFor="pw"><Input id="pw" type="url" value={v.website} onChange={set('website')} /></Field>
        <label className="flex items-center gap-3 pt-6 text-sm">
          <Switch checked={v.isMock} onCheckedChange={(c) => setV({ ...v, isMock: c })} /> Mock / demo provider (development only)
        </label>
      </div>
      <Field label="Description" htmlFor="pd"><Textarea id="pd" rows={2} value={v.description} onChange={set('description')} /></Field>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button type="submit" loading={submitting}>{initial?.id ? 'Save provider' : 'Create provider'}</Button>
    </form>
  );
}
