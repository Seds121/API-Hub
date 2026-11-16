import type { Metadata } from 'next';
import { Handshake, Scale, ShieldCheck, Workflow } from 'lucide-react';
import { COMPANY } from '@/lib/utils';

export const metadata: Metadata = { title: 'About us' };

const VALUES = [
  { icon: Scale, title: 'Licensed distribution only', text: 'We publish an API only after the supplier has confirmed — in writing — that downstream redistribution is permitted. Licenses are tracked, audited and enforced by the gateway.' },
  { icon: ShieldCheck, title: 'Security by default', text: 'Supplier credentials are encrypted and never leave our servers. Customer keys are hashed. Every financial action is recorded in an immutable ledger.' },
  { icon: Workflow, title: 'Reliability engineering', text: 'Circuit breakers, timeouts, retries and provider health monitoring protect your integrations from upstream instability.' },
  { icon: Handshake, title: 'Partner-friendly', text: 'Agencies and resellers get subaccounts, spending controls, wholesale pricing and transparent revenue sharing.' },
];

export default function AboutPage() {
  return (
    <div className="container max-w-4xl py-16">
      <h1 className="text-4xl font-semibold tracking-tight">About {COMPANY}</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        {COMPANY} operates an API marketplace and commercial distribution layer. We hold authorized access to third-party APIs — from social media and identity verification to AI, business data and geolocation — and make them available to agencies, software companies, enterprises and developers through one gateway, one key and one bill.
      </p>
      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {VALUES.map((v) => (
          <div key={v.title} className="rounded-xl border bg-card p-6">
            <v.icon className="mb-3 h-6 w-6 text-primary" />
            <h2 className="font-semibold">{v.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{v.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
