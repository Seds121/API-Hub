'use client';
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';
import { Field } from './ui/label';
import { Input, Textarea } from './ui/input';
import { Select } from './ui/select';
import { CodeBlock } from './code-block';
import { useApi } from '@/lib/query';
import type { Paged, ProductSummary } from '@/lib/types';
import type { ApiKeyRow } from '@/lib/dash-types';
import { cn } from '@/lib/utils';

export interface KeyFormValues {
  name: string;
  environment: 'LIVE' | 'TEST';
  scopes: string[];
  allowedIps: string[];
  rateLimitPerMinute: number | null;
  expiresAt: string | null;
}

export function KeyForm({ initial, onSubmit, submitting, isEdit }: { initial?: Partial<ApiKeyRow>; onSubmit: (v: KeyFormValues) => void; submitting?: boolean; isEdit?: boolean }) {
  const products = useApi<Paged<ProductSummary>>('/api/catalog/products?pageSize=60&sort=name');
  const [name, setName] = useState(initial?.name ?? '');
  const [env, setEnv] = useState<'LIVE' | 'TEST'>(initial?.environment ?? 'LIVE');
  const [all, setAll] = useState(!initial?.scopes || initial.scopes.includes('*'));
  const [scopes, setScopes] = useState<string[]>(initial?.scopes?.filter((s) => s !== '*') ?? []);
  const [ips, setIps] = useState((initial?.allowedIps ?? []).join('\n'));
  const [rate, setRate] = useState(initial?.rateLimitPerMinute ? String(initial.rateLimitPerMinute) : '');
  const [exp, setExp] = useState(initial?.expiresAt ? initial.expiresAt.slice(0, 10) : '');
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim().length < 1) return setErr('Name is required');
        if (!all && !scopes.length) return setErr('Select at least one API or allow all');
        setErr(null);
        onSubmit({ name: name.trim(), environment: env, scopes: all ? ['*'] : scopes, allowedIps: ips.split(/[\s,]+/).filter(Boolean), rateLimitPerMinute: rate ? Number(rate) : null, expiresAt: exp ? new Date(`${exp}T23:59:59Z`).toISOString() : null });
      }}
    >
      <Field label="Key name" htmlFor="kname">
        <Input id="kname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production server" />
      </Field>
      {!isEdit && (
        <Field label="Environment" hint="Test keys return documented sample responses and are never billed.">
          <Select value={env} onValueChange={(v) => setEnv(v as 'LIVE' | 'TEST')} options={[{ value: 'LIVE', label: 'Live (billed)' }, { value: 'TEST', label: 'Test / sandbox' }]} />
        </Field>
      )}
      <div className="grid gap-2">
        <span className="text-sm font-medium">Permissions</span>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Allow all available APIs
        </label>
        {!all && (
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
            {(products.data?.items ?? []).map((p) => (
              <label key={p.slug} className={cn('flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted')}>
                <input type="checkbox" checked={scopes.includes(p.slug)} onChange={(e) => setScopes((s) => (e.target.checked ? [...s, p.slug] : s.filter((x) => x !== p.slug)))} />
                {p.name} <code className="ml-auto text-[11px] text-muted-foreground">{p.slug}</code>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rate limit (req/min)" hint="Blank = plan default" htmlFor="rate">
          <Input id="rate" type="number" min={1} value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field label="Expires on" hint="Blank = never" htmlFor="exp">
          <Input id="exp" type="date" value={exp} onChange={(e) => setExp(e.target.value)} min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} />
        </Field>
      </div>
      <Field label="IP allowlist" hint="One IP or CIDR per line. Blank = any IP." htmlFor="ips">
        <Textarea id="ips" rows={2} value={ips} onChange={(e) => setIps(e.target.value)} placeholder="203.0.113.10&#10;198.51.100.0/24" />
      </Field>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button type="submit" loading={submitting}>{isEdit ? 'Save changes' : 'Create key'}</Button>
    </form>
  );
}

export function SecretReveal({ secret, onDone }: { secret: string; onDone: () => void }) {
  return (
    <div className="grid gap-4">
      <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        <span>Copy this key now. For your security it is stored only as a hash and <strong>will not be shown again</strong>.</span>
      </div>
      <CodeBlock code={secret} title="API key" />
      <Button onClick={onDone}>I’ve stored it safely</Button>
    </div>
  );
}
