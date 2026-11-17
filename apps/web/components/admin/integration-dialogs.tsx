'use client';
import { useState } from 'react';
import { CheckCircle2, FlaskConical, XCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Field } from '../ui/label';
import { Input, Textarea } from '../ui/input';
import { Select } from '../ui/select';
import { Switch } from '../ui/switch';
import { CodeBlock } from '../code-block';
import { HttpStatus } from '../status-badge';
import { call, useAction, useApi } from '@/lib/query';
import type { Integration, Provider } from '@/lib/admin-types';
import type { ParamDef } from '@/lib/types';
import { connectorDef } from '@zeze/shared';

const parse = (s: string, label: string) => {
  if (!s.trim()) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
};

/** Create/edit the mapping from a public endpoint to an approved upstream provider call. */
export function IntegrationEditor({ open, onOpenChange, endpointId, initial, invalidate }: { open: boolean; onOpenChange: (o: boolean) => void; endpointId?: string; initial?: Integration | null; invalidate: unknown[][] }) {
  const providers = useApi<Provider[]>('/api/admin/providers', ['admin-providers']);
  const [v, setV] = useState(() => ({
    providerId: initial?.providerId ?? '',
    priority: String(initial?.priority ?? 0),
    upstreamMethod: initial?.upstreamMethod ?? 'GET',
    upstreamPath: initial?.upstreamPath ?? '/',
    queryMap: JSON.stringify(initial?.queryMapping?.map ?? {}),
    queryStatic: JSON.stringify(initial?.queryMapping?.static ?? {}),
    headerStatic: JSON.stringify(initial?.headerMapping?.static ?? {}),
    bodyMode: initial?.bodyMode ?? 'NONE',
    bodyTemplate: initial?.bodyTemplate ? JSON.stringify(initial.bodyTemplate, null, 2) : '',
    responseTransform: initial?.responseTransform ? JSON.stringify(initial.responseTransform) : '',
    timeoutMsOverride: initial?.timeoutMsOverride ? String(initial.timeoutMsOverride) : '',
    costPerCall: initial?.costPerCall ?? '',
    costIsEstimated: initial?.costIsEstimated ?? true,
    isActive: initial?.isActive ?? true,
  }));
  const [err, setErr] = useState<string | null>(null);
  const save = useAction(
    (body: object) => (initial ? call(`/api/admin/integrations/${initial.id}`, { method: 'PATCH', body }) : call('/api/admin/integrations', { method: 'POST', body: { ...body, endpointId } })),
    { success: initial ? 'Integration updated' : 'Integration created', invalidate: invalidate as never, onSuccess: () => onOpenChange(false) },
  );
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit integration' : 'Connect upstream provider'}</DialogTitle>
          <DialogDescription>Customers can never supply upstream URLs: the gateway only calls this admin-approved configuration. Use <code>{'{param}'}</code> for path parameters.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const body = {
                providerId: v.providerId,
                priority: Number(v.priority),
                upstreamMethod: v.upstreamMethod,
                upstreamPath: v.upstreamPath,
                queryMapping: { map: parse(v.queryMap, 'Query mapping') ?? {}, static: parse(v.queryStatic, 'Static query') ?? {} },
                headerMapping: { static: parse(v.headerStatic, 'Static headers') ?? {} },
                bodyMode: v.bodyMode,
                bodyTemplate: v.bodyMode === 'TEMPLATE' ? parse(v.bodyTemplate, 'Body template') ?? {} : null,
                responseTransform: parse(v.responseTransform, 'Response transform') ?? null,
                timeoutMsOverride: v.timeoutMsOverride ? Number(v.timeoutMsOverride) : null,
                costPerCall: v.costPerCall === '' ? null : v.costPerCall,
                costIsEstimated: v.costIsEstimated,
                isActive: v.isActive,
              };
              setErr(null);
              save.mutate(body);
            } catch (x) {
              setErr((x as Error).message);
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Provider" className="sm:col-span-2"><Select value={v.providerId} onValueChange={(p) => setV({ ...v, providerId: p })} placeholder="Select provider" options={(providers.data ?? []).map((p) => ({ value: p.id, label: `${p.name} (${connectorDef(p.kind).shortLabel})` }))} /></Field>
            <Field label="Priority" hint="0 = primary; higher = failover" htmlFor="ip"><Input id="ip" type="number" min={0} value={v.priority} onChange={set('priority')} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Method"><Select value={v.upstreamMethod} onValueChange={(m) => setV({ ...v, upstreamMethod: m })} options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m }))} /></Field>
            <Field label="Upstream path" className="sm:col-span-3" htmlFor="iu"><Input id="iu" required className="font-mono" value={v.upstreamPath} onChange={set('upstreamPath')} placeholder="/profile or /users/{id}" /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Query rename map" hint='{"limit":"count"}' htmlFor="qm"><Input id="qm" className="font-mono text-xs" value={v.queryMap} onChange={set('queryMap')} /></Field>
            <Field label="Static query params" hint='{"format":"json"}' htmlFor="qs"><Input id="qs" className="font-mono text-xs" value={v.queryStatic} onChange={set('queryStatic')} /></Field>
            <Field label="Static headers (non-secret)" htmlFor="hs"><Input id="hs" className="font-mono text-xs" value={v.headerStatic} onChange={set('headerStatic')} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Request body"><Select value={v.bodyMode} onValueChange={(b) => setV({ ...v, bodyMode: b })} options={[{ value: 'NONE', label: 'None' }, { value: 'PASSTHROUGH_VALIDATED', label: 'Validated passthrough' }, { value: 'TEMPLATE', label: 'Template' }]} /></Field>
            <Field label="Response transform" hint='{"root":"data","pick":["a"]}' className="sm:col-span-2" htmlFor="rt"><Input id="rt" className="font-mono text-xs" value={v.responseTransform} onChange={set('responseTransform')} /></Field>
          </div>
          {v.bodyMode === 'TEMPLATE' && <Field label="Body template" hint="Use {{param}} placeholders" htmlFor="bt"><Textarea id="bt" rows={4} className="font-mono text-xs" value={v.bodyTemplate} onChange={set('bodyTemplate')} /></Field>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Supplier cost per call (USD)" hint="Leave blank if unknown — never guess" htmlFor="cc"><Input id="cc" type="number" step="0.000001" min={0} value={v.costPerCall} onChange={set('costPerCall')} /></Field>
            <label className="flex items-center gap-3 pt-6 text-sm"><Switch checked={v.costIsEstimated} onCheckedChange={(c) => setV({ ...v, costIsEstimated: c })} /> Cost is an estimate</label>
            <Field label="Timeout override (ms)" htmlFor="tm"><Input id="tm" type="number" value={v.timeoutMsOverride} onChange={set('timeoutMsOverride')} /></Field>
          </div>
          <label className="flex items-center gap-3 text-sm"><Switch checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} /> Active</label>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" disabled={!v.providerId} loading={save.isPending}>{initial ? 'Save integration' : 'Create integration'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface TestResult { ok: boolean; status: number | null; latencyMs: number; error: string | null; bodyPreview: unknown }

/** Runs a real upstream call through the integration engine (SSRF, auth, limits all enforced). */
export function IntegrationTester({ integration, params, onClose, invalidate }: { integration: Integration; params: ParamDef[]; onClose: () => void; invalidate: unknown[][] }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<TestResult | null>(null);
  const run = useAction(
    () => {
      const by = (where: string) => Object.fromEntries(params.filter((p) => p.in === where && values[p.name]).map((p) => [p.name, values[p.name]!]));
      const body = params.some((p) => p.in === 'body') ? by('body') : undefined;
      return call<TestResult>(`/api/admin/integrations/${integration.id}/test`, { method: 'POST', body: { pathParams: by('path'), query: by('query'), headers: by('header'), body } });
    },
    { invalidate: invalidate as never, onSuccess: setResult },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5" /> Test integration</DialogTitle>
          <DialogDescription>
            {integration.provider?.name} · <code>{integration.upstreamMethod} {integration.upstreamPath}</code>. This performs a real call with stored supplier credentials (not billed to any customer; may incur supplier cost).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {params.map((p) => (
            <Field key={p.name + p.in} label={`${p.name}${p.required ? ' *' : ''}`} hint={`${p.in} · ${p.type}`} htmlFor={`t-${p.name}`}>
              <Input id={`t-${p.name}`} placeholder={p.example !== undefined ? String(p.example) : ''} value={values[p.name] ?? ''} onChange={(e) => setValues({ ...values, [p.name]: e.target.value })} />
            </Field>
          ))}
        </div>
        <Button onClick={() => run.mutate()} loading={run.isPending}>Run test</Button>
        {result && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm">
              {result.ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
              {result.status ? <HttpStatus code={result.status} /> : null}
              <span className="text-muted-foreground">{result.latencyMs} ms</span>
              {result.error && <span className="text-destructive">{result.error}</span>}
            </p>
            <CodeBlock code={JSON.stringify(result.bodyPreview, null, 2) ?? ''} title="Response preview" className="max-h-80 overflow-auto" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
