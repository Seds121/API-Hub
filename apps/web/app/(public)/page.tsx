import Link from 'next/link';
import { ArrowRight, BadgeCheck, BarChart3, Building2, CreditCard, KeyRound, Layers, Network, ShieldCheck, Sparkles, Users, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HeroSearch } from '@/components/site/hero-search';
import { ProductCard } from '@/components/site/product-card';
import { CategoryIcon } from '@/components/site/category-icon';
import { CodeBlock } from '@/components/code-block';
import { serverGet } from '@/lib/server-api';
import type { Category, Paged, Plan, ProductSummary } from '@/lib/types';
import { COMPANY, money, num } from '@/lib/utils';
import { publicApiUrl } from '@/lib/public-url';

export const revalidate = 60;

const BENEFITS = [
  { icon: KeyRound, title: 'One key for every API', text: 'Stop juggling dozens of supplier accounts. A single scoped key works across the whole catalog.' },
  { icon: CreditCard, title: 'One bill, prepaid wallet', text: 'Top up once, pay per successful request. Precise metering, invoices and statements included.' },
  { icon: ShieldCheck, title: 'Authorized & compliant', text: 'Every listing is backed by a verified redistribution agreement with the upstream supplier.' },
  { icon: Zap, title: 'Reliable gateway', text: 'Timeouts, retries, circuit breakers and provider failover keep your integrations stable.' },
  { icon: BarChart3, title: 'Real-time analytics', text: 'Usage by API, key and day — with latency, errors and spend visible as they happen.' },
  { icon: Users, title: 'Built for agencies', text: 'Create client subaccounts, set spending caps, resell with your own pricing and see agency reports.' },
];

const steps = (API_PUBLIC_URL: string) => [
  { n: '01', title: 'Create an account', text: 'Register your organization in under a minute and invite your team.' },
  { n: '02', title: 'Fund your wallet', text: 'Pay by card or bank transfer, or choose a subscription with included requests.' },
  { n: '03', title: 'Generate an API key', text: 'Scope keys to specific APIs, set rate limits, IP allowlists and expiry.' },
  { n: '04', title: 'Call any API', text: `Send requests to ${API_PUBLIC_URL.replace(/^https?:\/\//, '')}/v1/… — we handle suppliers, retries and billing.` },
];

export default async function HomePage() {
  const API_PUBLIC_URL = await publicApiUrl();
  const STEPS = steps(API_PUBLIC_URL);
  const [featured, categories, plans] = await Promise.all([serverGet<Paged<ProductSummary>>('/api/catalog/products?sort=popular&pageSize=6'), serverGet<Category[]>('/api/catalog/categories'), serverGet<Plan[]>('/api/catalog/plans')]);
  const sample = `curl "${API_PUBLIC_URL}/v1/social-profiles/profile?username=acme" \\\n  -H "Authorization: Bearer zz_live_••••••••"`;
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-950 text-white">
        <div className="bg-grid absolute inset-0 opacity-[0.15]" />
        <div className="absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-blue-600/30 blur-3xl" />
        <div className="container relative flex flex-col items-center gap-8 py-24 text-center md:py-32">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-300">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" /> {COMPANY} API Hub
          </span>
          <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-tight md:text-6xl">
            Every API your business needs. <span className="bg-gradient-to-r from-blue-300 to-sky-200 bg-clip-text text-transparent">One gateway.</span>
          </h1>
          <p className="max-w-2xl text-balance text-lg text-slate-300">Access authorized social, identity, AI, business-data and geolocation APIs through a single endpoint, a single key and a single bill.</p>
          <HeroSearch />
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-500">
              <Link href="/register">
                Start building free <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link href="/marketplace">Browse the marketplace</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Featured */}
      <section className="container py-20">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Featured APIs</h2>
            <p className="text-muted-foreground">Production-ready listings with transparent per-request pricing.</p>
          </div>
          <Button asChild variant="ghost">
            <Link href="/marketplace">
              View all <ArrowRight />
            </Link>
          </Button>
        </div>
        {featured?.items.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.items.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">The catalog is being prepared. Check back soon.</p>
        )}
      </section>

      {/* Categories */}
      <section className="border-y bg-muted/40 py-20">
        <div className="container">
          <h2 className="mb-8 text-3xl font-semibold tracking-tight">Popular categories</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(categories ?? []).map((c) => (
              <Link key={c.id} href={`/marketplace?category=${c.slug}`} className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40">
                <div className="grid h-10 w-10 place-items-center rounded-md bg-accent text-accent-foreground">
                  <CategoryIcon slug={c.slug} className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.productCount} APIs</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="container py-20">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Why teams choose {COMPANY}</h2>
          <p className="mt-2 text-muted-foreground">Agencies, SaaS companies and enterprises use one commercial layer instead of managing dozens of suppliers.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-xl border bg-card p-6">
              <b.icon className="mb-4 h-6 w-6 text-primary" />
              <h3 className="font-semibold">{b.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works + developer */}
      <section className="bg-navy-950 py-20 text-white">
        <div className="container grid items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
            <ol className="mt-8 space-y-6">
              {STEPS.map((s) => (
                <li key={s.n} className="flex gap-4">
                  <span className="font-mono text-sm text-blue-400">{s.n}</span>
                  <div>
                    <p className="font-medium">{s.title}</p>
                    <p className="text-sm text-slate-400">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-4">
            <CodeBlock code={sample} title="cURL" />
            <div className="grid grid-cols-3 gap-3 text-center text-sm">
              {[
                [Layers, 'OpenAPI specs'],
                [Network, 'Interactive playground'],
                [BadgeCheck, 'Normalized errors'],
              ].map(([I, t]) => {
                const Icon = I as React.ElementType;
                return (
                  <div key={t as string} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <Icon className="mx-auto mb-1 h-4 w-4 text-blue-400" />
                    {t as string}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing overview */}
      <section className="container py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Simple, usage-based pricing</h2>
          <p className="mt-2 text-muted-foreground">Pay only for successful requests. Subscriptions add included volume and discounts.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {(plans ?? []).filter((p) => ['PAYG', 'STARTER', 'GROWTH'].includes(p.code)).map((p) => (
            <div key={p.id} className="rounded-xl border bg-card p-6">
              <p className="font-semibold">{p.name}</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">
                {money(p.price, { digits: 0 })}
                <span className="text-sm font-normal text-muted-foreground">{p.interval === 'MONTHLY' ? '/mo' : ''}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{p.includedRequests ? `${num(p.includedRequests)} requests included` : 'No commitment'}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button asChild variant="outline">
            <Link href="/pricing">Compare plans</Link>
          </Button>
        </div>
      </section>

      {/* Enterprise CTA */}
      <section className="container pb-24">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-900 to-blue-700 p-10 text-white md:p-14">
          <div className="bg-grid absolute inset-0 opacity-10" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl space-y-2">
              <Building2 className="h-7 w-7 text-blue-200" />
              <h2 className="text-3xl font-semibold tracking-tight">Enterprise & agency programs</h2>
              <p className="text-blue-100">Custom pricing, credit terms, invoicing, dedicated support and white-label reseller tools for your clients.</p>
            </div>
            <Button asChild size="lg" className="bg-white text-navy-900 hover:bg-white/90">
              <Link href="/contact?topic=enterprise">Talk to sales</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
