'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Info, Send } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeBlock } from '@/components/code-block';
import { HttpStatus, MethodBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/states';
import { useApi } from '@/lib/query';
import { buildRequest, snippet } from '@/lib/snippets';
import type { Paged, ProductDetail, ProductSummary } from '@/lib/types';
import { usePublicConfig } from '@/lib/public-config';

interface Result { status: number; ms: number; headers: Record<string, string>; body: string }

function Playground() {
  const sp = useSearchParams();
  const list = useApi<Paged<ProductSummary>>('/api/catalog/products?pageSize=60&sort=name');
  const [slug, setSlug] = useState(sp.get('api') ?? '');
  const product = useApi<ProductDetail>(slug ? `/api/catalog/products/${slug}` : null);
  const [endpointId, setEndpointId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const API_PUBLIC_URL = usePublicConfig().data?.apiPublicUrl ?? '';
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!slug && list.data?.items[0]) setSlug(list.data.items[0].slug);
  }, [list.data, slug]);
  useEffect(() => {
    const first = product.data?.endpoints[0];
    setEndpointId(first?.id ?? '');
    setValues({});
    setResult(null);
  }, [product.data]);

  const endpoint = product.data?.endpoints.find((e) => e.id === endpointId);
  // Requests go through the same-origin /v1 proxy; shown URLs use the public gateway host.
  const req = useMemo(() => (endpoint && product.data ? buildRequest('', product.data.slug, endpoint, values) : null), [endpoint, product.data, values]);
  const shown = endpoint && product.data ? buildRequest(API_PUBLIC_URL, product.data.slug, endpoint, values) : null;

  async function send() {
    if (!req) return;
    setBusy(true);
    const started = performance.now();
    try {
      const res = await fetch(req.url, { method: req.method, headers: { Authorization: `Bearer ${key.trim()}`, ...(req.body ? { 'content-type': 'application/json' } : {}) }, body: req.body ? JSON.stringify(req.body) : undefined, credentials: 'omit' });
      const text = await res.text();
      let body = text;
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* non-JSON */
      }
      const headers: Record<string, string> = {};
      for (const h of ['x-request-id', 'x-zz-cost', 'x-zz-covered-by-plan', 'x-zz-sandbox', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'retry-after', 'content-type']) {
        const v = res.headers.get(h);
        if (v) headers[h] = v;
      }
      setResult({ status: res.status, ms: Math.round(performance.now() - started), headers, body });
    } catch (e) {
      setResult({ status: 0, ms: 0, headers: {}, body: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="API playground" description="Send real requests through the gateway with one of your keys. Live keys are billed; test keys (zz_test_…) return sample responses for free." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Request</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="API">
                <Select value={slug} onValueChange={setSlug} options={(list.data?.items ?? []).map((p) => ({ value: p.slug, label: p.name }))} placeholder="Select an API" />
              </Field>
              <Field label="Endpoint">
                <Select value={endpointId} onValueChange={(v) => (setEndpointId(v), setValues({}), setResult(null))} options={(product.data?.endpoints ?? []).map((e) => ({ value: e.id, label: `${e.method} ${e.path}` }))} placeholder="Select an endpoint" />
              </Field>
            </div>
            <Field label="API key" hint="Paste a key from the API keys page. It is used only in this browser tab and never stored." htmlFor="pkey">
              <Input id="pkey" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="zz_live_… or zz_test_…" />
            </Field>
            {endpoint && (
              <>
                <div className="flex items-center gap-2 text-sm"><MethodBadge method={endpoint.method} /><code className="truncate text-xs">{shown?.url}</code></div>
                {endpoint.params.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {endpoint.params.map((p) => (
                      <Field key={p.name + p.in} label={`${p.name}${p.required ? ' *' : ''}`} hint={`${p.in} · ${p.type}${p.description ? ` — ${p.description}` : ''}`} htmlFor={`p-${p.name}`}>
                        {p.enum ? (
                          <Select value={values[p.name] ?? ''} onValueChange={(v) => setValues((s) => ({ ...s, [p.name]: v }))} options={[{ value: '', label: '—' }, ...p.enum.map((x) => ({ value: x, label: x }))]} />
                        ) : (
                          <Input id={`p-${p.name}`} value={values[p.name] ?? ''} placeholder={p.example !== undefined ? String(p.example) : ''} onChange={(e) => setValues((s) => ({ ...s, [p.name]: e.target.value }))} />
                        )}
                      </Field>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">This endpoint has no parameters.</p>
                )}
                <Button onClick={send} loading={busy} disabled={!key.trim()}><Send /> Send request</Button>
                {!key.trim() && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5" /> Enter an API key to send.</p>}
              </>
            )}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Response</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {result ? (
                <>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {result.status ? <HttpStatus code={result.status} /> : <span className="text-destructive">Network error</span>}
                    <span className="text-muted-foreground">{result.ms} ms</span>
                    {result.headers['x-zz-cost'] && <span className="text-muted-foreground">cost ${result.headers['x-zz-cost']}</span>}
                    {result.headers['x-zz-sandbox'] && <span className="rounded bg-amber-500/15 px-1.5 text-xs">sandbox</span>}
                  </div>
                  <CodeBlock code={result.body || '(empty body)'} title="Body" className="max-h-96 overflow-auto" />
                  <CodeBlock code={Object.entries(result.headers).map(([k, v]) => `${k}: ${v}`).join('\n')} title="Headers" />
                </>
              ) : (
                <EmptyState icon={Send} title="No request sent yet" description="Fill in parameters and send to see the response, cost and rate-limit headers." />
              )}
            </CardContent>
          </Card>
          {shown && (
            <Tabs defaultValue="curl">
              <TabsList>
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
                <TabsTrigger value="php">PHP</TabsTrigger>
              </TabsList>
              {(['curl', 'javascript', 'python', 'php'] as const).map((l) => (
                <TabsContent key={l} value={l}><CodeBlock code={snippet(l, shown)} title={l} /></TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense><Playground /></Suspense>;
}
