import type { Metadata } from 'next';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { serverGet } from '@/lib/server-api';
import type { Plan } from '@/lib/types';
import { money, num } from '@/lib/utils';

export const metadata: Metadata = { title: 'Pricing', description: 'Pay-as-you-go, subscriptions, prepaid credit packs and enterprise pricing.' };
export const revalidate = 60;

const FAQ = [
  ['What counts as a billable request?', 'Only requests that succeed at the upstream provider (2xx/3xx). Upstream errors, timeouts and requests we reject are not charged.'],
  ['How do prepaid credits work?', 'Top up your wallet by card or bank transfer. Each successful request deducts its exact price. Credits never expire.'],
  ['Do subscriptions include requests?', 'Yes. Each plan includes a monthly request quota across all APIs; after that, per-request prices apply (with any plan discount).'],
  ['Can I get invoices?', 'Every payment, subscription and renewal generates a downloadable PDF invoice, plus CSV wallet statements.'],
];

export default async function PricingPage() {
  const plans = (await serverGet<Plan[]>('/api/catalog/plans')) ?? [];
  const display = plans.filter((p) => p.type !== 'PREPAID' && !(p.type === 'SUBSCRIPTION' && p.interval === 'ANNUAL'));
  const packs = plans.filter((p) => p.type === 'PREPAID');
  const annual = plans.filter((p) => p.interval === 'ANNUAL');
  return (
    <div className="container py-16">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Pricing that scales with you</h1>
        <p className="mt-3 text-muted-foreground">Start pay-as-you-go. Add a subscription for included volume and discounts. Talk to us for enterprise terms.</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {display.map((p) => {
          const highlight = p.code === 'GROWTH';
          return (
            <div key={p.id} className={`relative flex flex-col rounded-xl border bg-card p-6 ${highlight ? 'border-primary shadow-lg ring-1 ring-primary' : ''}`}>
              {highlight && <Badge className="absolute -top-2.5 left-6 bg-primary text-primary-foreground">Most popular</Badge>}
              <p className="font-semibold">{p.name}</p>
              <p className="mt-3 text-4xl font-semibold tabular-nums">
                {p.type === 'ENTERPRISE' ? 'Custom' : money(p.price, { digits: 0 })}
                {p.interval === 'MONTHLY' && <span className="text-base font-normal text-muted-foreground">/mo</span>}
              </p>
              <p className="mt-1 h-10 text-sm text-muted-foreground">{p.type === 'PAYG' ? 'Only pay for what you use' : p.type === 'ENTERPRISE' ? 'Volume pricing & credit terms' : `${num(p.includedRequests)} requests / month`}</p>
              <ul className="my-6 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {f}
                  </li>
                ))}
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {p.rateLimitPerMinute} requests/min per key
                </li>
              </ul>
              <Button asChild variant={highlight ? 'default' : 'outline'}>
                <Link href={p.type === 'ENTERPRISE' ? '/contact?topic=enterprise' : '/register'}>{p.type === 'ENTERPRISE' ? 'Contact sales' : 'Get started'}</Link>
              </Button>
            </div>
          );
        })}
      </div>
      {(packs.length > 0 || annual.length > 0) && (
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {[...annual, ...packs].map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl border bg-card p-5">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-muted-foreground">{p.type === 'PREPAID' ? `Pay ${money(p.price, { digits: 0 })}, get ${money(p.creditGrant, { digits: 0 })} credit` : `${money(p.price, { digits: 0 })}/year · ${num(p.includedRequests)} requests`}</p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/register">Choose</Link>
              </Button>
            </div>
          ))}
        </div>
      )}
      <p className="mt-8 text-center text-sm text-muted-foreground">Per-request prices are listed on each API page in the marketplace. All prices in USD, exclusive of applicable taxes.</p>
      <div className="mx-auto mt-16 max-w-3xl">
        <h2 className="mb-6 text-2xl font-semibold tracking-tight">Frequently asked questions</h2>
        <dl className="divide-y rounded-xl border bg-card">
          {FAQ.map(([q, a]) => (
            <div key={q} className="p-5">
              <dt className="font-medium">{q}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
