import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, KeyRound, PlayCircle, Webhook } from 'lucide-react';
import { CodeBlock } from '@/components/code-block';
import { Button } from '@/components/ui/button';
import { publicApiUrl } from '@/lib/public-url';

export const metadata: Metadata = { title: 'Developers' };

const ERR = `{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient wallet balance.",
    "requestId": "8b38358e-1da9-4967-96a3-3fc3f6e52b3d"
  }
}`;

export default async function DevelopersPage() {
  const API_PUBLIC_URL = await publicApiUrl();
  return (
    <div className="container py-16">
      <div className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight">Built for developers</h1>
        <p className="mt-3 text-lg text-muted-foreground">Predictable URLs, one authentication scheme, normalized errors and response headers that tell you exactly what each call cost.</p>
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-4">
        {[
          [KeyRound, 'API keys', 'Scoped keys with per-key rate limits, IP allowlists, expiry and sandbox (test) mode.', '/dashboard/keys'],
          [PlayCircle, 'Playground', 'Call any API from your browser with your own key and inspect responses.', '/dashboard/playground'],
          [BookOpen, 'Documentation', 'Per-API docs, examples in 4 languages and downloadable OpenAPI specs.', '/docs'],
          [Webhook, 'Platform API', 'Automate key management and reporting with the management API (Swagger).', '/api/docs'],
        ].map(([I, t, d, h]) => {
          const Icon = I as React.ElementType;
          return (
            <Link key={t as string} href={h as string} className="rounded-xl border bg-card p-5 transition-colors hover:border-primary/40">
              <Icon className="mb-3 h-5 w-5 text-primary" />
              <p className="font-medium">{t as string}</p>
              <p className="mt-1 text-sm text-muted-foreground">{d as string}</p>
            </Link>
          );
        })}
      </div>
      <div className="mt-14 grid gap-8 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Authentication</h2>
          <p className="text-sm text-muted-foreground">Every request carries your key. Keys look like <code>zz_live_XXXXXXXX_…</code> (production) or <code>zz_test_…</code> (sandbox — returns documented examples and is never billed). Keys are shown once at creation; we only store a hash.</p>
          <CodeBlock title="Request" code={`curl "${API_PUBLIC_URL}/v1/email-verification/verify" \\\n  -H "Authorization: Bearer $ZZ_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"email":"jane@example.com"}'`} />
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Errors & headers</h2>
          <p className="text-sm text-muted-foreground">
            All errors share one envelope. Every response includes <code>X-Request-Id</code>, <code>X-RateLimit-*</code> and <code>X-ZZ-Cost</code> (the exact amount charged).
          </p>
          <CodeBlock title="Error envelope" code={ERR} />
        </div>
      </div>
      <div className="mt-12">
        <Button asChild size="lg">
          <Link href="/register">Create your API key</Link>
        </Button>
      </div>
    </div>
  );
}
