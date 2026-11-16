import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, FileJson, Gauge, KeyRound, Lock, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CategoryIcon } from '@/components/site/category-icon';
import { EndpointDocs } from '@/components/site/endpoint-docs';
import { serverGet } from '@/lib/server-api';
import { publicApiUrl } from '@/lib/public-url';
import type { ProductDetail } from '@/lib/types';
import { money } from '@/lib/utils';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await serverGet<ProductDetail>(`/api/catalog/products/${(await params).slug}`);
  return p ? { title: p.name, description: p.summary } : { title: 'API not found' };
}

export default async function ProductPage({ params }: Props) {
  const API_PUBLIC_URL = await publicApiUrl();
  const { slug } = await params;
  const p = await serverGet<ProductDetail>(`/api/catalog/products/${slug}`);
  if (!p) notFound();
  return (
    <div className="container py-10">
      <Link href="/marketplace" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Marketplace
      </Link>
      <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
            <CategoryIcon slug={p.category.slug} className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">{p.name}</h1>
              {p.isDemo && <Badge variant="warning">Demo listing</Badge>}
            </div>
            <p className="max-w-2xl text-muted-foreground">{p.summary}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{p.category.name}</Badge>
              {p.publisherName && <Badge variant="outline">by {p.publisherName}</Badge>}
              <Badge variant="outline">ID {p.internalCode}</Badge>
              {p.tags.map((t) => (
                <Badge key={t} variant="outline">
                  #{t}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/docs/${p.slug}`}>
              <FileJson /> Docs & OpenAPI
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/dashboard/playground?api=${p.slug}`}>
              <KeyRound /> Try it
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          {p.docsMarkdown && (
            <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:tracking-tight">
              <ReactMarkdown>{p.docsMarkdown}</ReactMarkdown>
            </div>
          )}
          <EndpointDocs product={p} baseUrl={API_PUBLIC_URL} />
        </div>
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">Default</span>
                <span className="text-xl font-semibold tabular-nums">{money(p.pricing.defaultPricePerRequest, { digits: 4 })}</span>
              </div>
              <p className="text-xs text-muted-foreground">Charged per successful request from your wallet. Failed upstream calls (5xx, timeouts) are never billed. Subscriptions include monthly request quotas and discounts.</p>
              {p.requiresSubscription && (
                <p className="flex items-center gap-2 rounded-md bg-accent p-2 text-xs text-accent-foreground">
                  <Lock className="h-3.5 w-3.5" /> Requires an active subscription plan.
                </p>
              )}
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href="/pricing">See plans</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Authentication</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Send your key as <code className="text-foreground">Authorization: Bearer &lt;key&gt;</code> or <code className="text-foreground">X-API-Key</code>.
              </p>
              <p className="break-all font-mono text-xs text-foreground">{p.baseUrl}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-4 w-4" /> Rate limits
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{p.defaultRateLimitPerMinute} requests/minute per key by default (higher on paid plans). Per-key limits can be set in your dashboard.</CardContent>
          </Card>
          {p.usageRestrictions && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4" /> Usage restrictions
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{p.usageRestrictions}</CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
