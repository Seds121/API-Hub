'use client';
import { useState } from 'react';
import { CodeBlock } from '../code-block';
import { MethodBadge } from '../status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Table, TBody, TD, TH, THead, TR } from '../ui/table';
import { Badge } from '../ui/badge';
import { buildRequest, Lang, snippet } from '@/lib/snippets';
import type { ProductDetail } from '@/lib/types';
import { cn, money } from '@/lib/utils';

const LANGS: { id: Lang; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'php', label: 'PHP' },
];

const COMMON_ERRORS = [
  [400, 'VALIDATION_FAILED', 'Missing or invalid parameters (unknown parameters are rejected).'],
  [401, 'INVALID_API_KEY', 'Key missing, invalid, revoked or expired.'],
  [402, 'INSUFFICIENT_BALANCE', 'Wallet balance too low — top up to continue.'],
  [402, 'SUBSCRIPTION_REQUIRED', 'This API requires an active subscription.'],
  [403, 'API_NOT_IN_KEY_SCOPE', 'The key is not permitted to call this API.'],
  [429, 'RATE_LIMITED', 'Too many requests. Respect the Retry-After header.'],
  [502, 'UPSTREAM_ERROR', 'The upstream provider failed. Not billed.'],
  [503, 'UPSTREAM_UNAVAILABLE', 'Provider temporarily unavailable. Not billed.'],
  [504, 'UPSTREAM_TIMEOUT', 'Provider timed out. Not billed.'],
] as const;

export function EndpointDocs({ product, baseUrl }: { product: ProductDetail; baseUrl: string }) {
  const [activeId, setActiveId] = useState(product.endpoints[0]?.id);
  const e = product.endpoints.find((x) => x.id === activeId) ?? product.endpoints[0];
  if (!e) return <p className="text-sm text-muted-foreground">No endpoints published yet.</p>;
  const req = buildRequest(baseUrl, product.slug, e);
  const price = product.pricing.endpoints.find((p) => p.endpointId === e.id)?.pricePerRequest ?? product.pricing.defaultPricePerRequest;
  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <nav className="space-y-1" aria-label="Endpoints">
        {product.endpoints.map((x) => (
          <button key={x.id} onClick={() => setActiveId(x.id)} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted', x.id === e.id && 'bg-accent text-accent-foreground')}>
            <MethodBadge method={x.method} />
            <span className="truncate">{x.name}</span>
          </button>
        ))}
      </nav>
      <div className="min-w-0 space-y-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <MethodBadge method={e.method} />
            <code className="rounded bg-muted px-2 py-1 font-mono text-sm">/v1/{product.slug}{e.path === '/' ? '' : e.path}</code>
            {price && <Badge variant="secondary">{money(price, { digits: 4 })} / successful request</Badge>}
            {e.rateLimitPerMinute && <Badge variant="outline">{e.rateLimitPerMinute} req/min</Badge>}
          </div>
          {e.description && <p className="text-sm text-muted-foreground">{e.description}</p>}
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Parameters</h4>
          {e.params.length ? (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>In</TH>
                    <TH>Type</TH>
                    <TH>Description</TH>
                  </TR>
                </THead>
                <TBody>
                  {e.params.map((p) => (
                    <TR key={p.name + p.in}>
                      <TD className="font-mono text-xs">
                        {p.name}
                        {p.required && <span className="ml-1 text-destructive">*</span>}
                      </TD>
                      <TD className="text-xs">{p.in}</TD>
                      <TD className="text-xs">{p.type}</TD>
                      <TD className="text-xs text-muted-foreground">
                        {p.description ?? '—'}
                        {p.example !== undefined && <span className="ml-1">e.g. <code>{String(p.example)}</code></span>}
                        {p.enum && <span className="ml-1">one of {p.enum.join(', ')}</span>}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No parameters.</p>
          )}
        </div>
        <Tabs defaultValue="curl">
          <TabsList>
            {LANGS.map((l) => (
              <TabsTrigger key={l.id} value={l.id}>
                {l.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {LANGS.map((l) => (
            <TabsContent key={l.id} value={l.id}>
              <CodeBlock code={snippet(l.id, req)} title={`${l.label} request`} />
            </TabsContent>
          ))}
        </Tabs>
        {e.responseExample != null && <CodeBlock code={JSON.stringify(e.responseExample, null, 2)} title="Example response · 200" />}
        <div>
          <h4 className="mb-2 text-sm font-semibold">Error codes</h4>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TBody>
                {COMMON_ERRORS.map(([s, c, d]) => (
                  <TR key={c}>
                    <TD className="w-16 font-mono text-xs">{s}</TD>
                    <TD className="font-mono text-xs">{c}</TD>
                    <TD className="text-xs text-muted-foreground">{d}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
