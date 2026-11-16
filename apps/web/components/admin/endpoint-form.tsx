'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Field } from '../ui/label';
import { Input, Textarea } from '../ui/input';
import { Select } from '../ui/select';
import type { ParamDef, PublicEndpoint } from '@/lib/types';

export function EndpointForm({ initial, onSubmit, submitting }: { initial?: Partial<PublicEndpoint> & { maxBodyBytes?: number; isActive?: boolean }; onSubmit: (v: object) => void; submitting?: boolean }) {
  const [v, setV] = useState({
    name: initial?.name ?? '',
    method: initial?.method ?? 'GET',
    path: initial?.path ?? '/',
    description: initial?.description ?? '',
    rateLimitPerMinute: initial?.rateLimitPerMinute ? String(initial.rateLimitPerMinute) : '',
    maxBodyBytes: String(initial?.maxBodyBytes ?? 65536),
    responseExample: initial?.responseExample ? JSON.stringify(initial.responseExample, null, 2) : '',
    requestBodyExample: initial?.requestBodyExample ? JSON.stringify(initial.requestBodyExample, null, 2) : '',
  });
  const [params, setParams] = useState<ParamDef[]>(initial?.params ?? []);
  const [err, setErr] = useState<string | null>(null);
  const t = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const up = (i: number, patch: Partial<ParamDef>) => setParams(params.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onSubmit({
            name: v.name,
            method: v.method,
            path: v.path,
            description: v.description || null,
            rateLimitPerMinute: v.rateLimitPerMinute ? Number(v.rateLimitPerMinute) : null,
            maxBodyBytes: Number(v.maxBodyBytes),
            responseExample: v.responseExample ? JSON.parse(v.responseExample) : null,
            requestBodyExample: v.requestBodyExample ? JSON.parse(v.requestBodyExample) : null,
            params: params.map((p) => ({ ...p, example: p.example === '' ? undefined : p.example, description: p.description || undefined })),
          });
          setErr(null);
        } catch {
          setErr('Examples must be valid JSON');
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Name" className="sm:col-span-2" htmlFor="en"><Input id="en" required value={v.name} onChange={t('name')} /></Field>
        <Field label="Method"><Select value={v.method} onValueChange={(m) => setV({ ...v, method: m as typeof v.method })} options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m }))} /></Field>
        <Field label="Path" hint="/users/{id}" htmlFor="ep"><Input id="ep" required className="font-mono" value={v.path} onChange={t('path')} /></Field>
      </div>
      <Field label="Description" htmlFor="ed"><Textarea id="ed" rows={2} value={v.description} onChange={t('description')} /></Field>
      <div className="space-y-2">
        <div className="flex items-center justify-between"><span className="text-sm font-medium">Parameters</span><Button type="button" size="sm" variant="outline" onClick={() => setParams([...params, { name: '', in: 'query', type: 'string', required: false }])}><Plus /> Add</Button></div>
        {params.length === 0 && <p className="text-xs text-muted-foreground">No parameters. Unknown query parameters are always rejected by the gateway.</p>}
        {params.map((p, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-2">
            <Input className="col-span-3 font-mono text-xs" placeholder="name" value={p.name} onChange={(e) => up(i, { name: e.target.value })} aria-label="Parameter name" />
            <Select className="col-span-2" value={p.in} onValueChange={(x) => up(i, { in: x as ParamDef['in'] })} options={['query', 'path', 'header', 'body'].map((x) => ({ value: x, label: x }))} />
            <Select className="col-span-2" value={p.type} onValueChange={(x) => up(i, { type: x as ParamDef['type'] })} options={['string', 'integer', 'number', 'boolean'].map((x) => ({ value: x, label: x }))} />
            <Input className="col-span-2 text-xs" placeholder="example" value={p.example === undefined ? '' : String(p.example)} onChange={(e) => up(i, { example: e.target.value })} aria-label="Example" />
            <Input className="col-span-1 text-xs" placeholder="max" type="number" value={p.maxLength ?? ''} onChange={(e) => up(i, { maxLength: e.target.value ? Number(e.target.value) : undefined })} aria-label="Max length" />
            <label className="col-span-1 flex items-center gap-1 text-xs"><input type="checkbox" checked={!!p.required} onChange={(e) => up(i, { required: e.target.checked })} /> req</label>
            <Button type="button" size="icon" variant="ghost" className="col-span-1" onClick={() => setParams(params.filter((_, j) => j !== i))} aria-label="Remove parameter"><Trash2 /></Button>
            <Input className="col-span-12 text-xs" placeholder="description" value={p.description ?? ''} onChange={(e) => up(i, { description: e.target.value })} aria-label="Description" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Endpoint rate limit / min (per org)" htmlFor="erl"><Input id="erl" type="number" value={v.rateLimitPerMinute} onChange={t('rateLimitPerMinute')} /></Field>
        <Field label="Max body bytes" htmlFor="emb"><Input id="emb" type="number" value={v.maxBodyBytes} onChange={t('maxBodyBytes')} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Request body example (JSON)" htmlFor="rbe"><Textarea id="rbe" rows={4} className="font-mono text-xs" value={v.requestBodyExample} onChange={t('requestBodyExample')} /></Field>
        <Field label="Response example (JSON)" hint="Also returned to sandbox (test) keys" htmlFor="rse"><Textarea id="rse" rows={4} className="font-mono text-xs" value={v.responseExample} onChange={t('responseExample')} /></Field>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button type="submit" loading={submitting}>{initial?.id ? 'Save endpoint' : 'Add endpoint'}</Button>
    </form>
  );
}
