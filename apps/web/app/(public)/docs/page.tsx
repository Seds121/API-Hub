import type { Metadata } from 'next';
import Link from 'next/link';
import { FileJson } from 'lucide-react';
import { CodeBlock } from '@/components/code-block';
import { CategoryIcon } from '@/components/site/category-icon';
import { serverGet } from '@/lib/server-api';
import { publicApiUrl } from '@/lib/public-url';
import type { Paged, ProductSummary } from '@/lib/types';

export const metadata: Metadata = { title: 'Documentation' };
export const revalidate = 60;

export default async function DocsIndex() {
  const API_PUBLIC_URL = await publicApiUrl();
  const products = (await serverGet<Paged<ProductSummary>>('/api/catalog/products?pageSize=60&sort=name'))?.items ?? [];
  return (
    <div className="container grid gap-10 py-14 lg:grid-cols-[1fr_380px]">
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Documentation</h1>
          <p className="mt-2 text-muted-foreground">Base URL, authentication and reference docs for every published API.</p>
        </div>
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Quick start</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              <Link className="text-primary underline" href="/register">Create an account</Link> and top up your wallet (or subscribe).
            </li>
            <li>
              Create an API key in <Link className="text-primary underline" href="/dashboard/keys">Dashboard → API keys</Link>. Copy it — it is shown only once.
            </li>
            <li>
              Call <code>{API_PUBLIC_URL}/v1/&lt;api&gt;/&lt;endpoint&gt;</code> with <code>Authorization: Bearer &lt;key&gt;</code>.
            </li>
          </ol>
          <CodeBlock title="Base URL" code={`${API_PUBLIC_URL}/v1`} />
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Rate limits & billing</h2>
          <p className="text-sm text-muted-foreground">Limits apply per key per minute (plan or key-specific) and per endpoint where configured. On 429, wait for <code>Retry-After</code> seconds. Each successful request is deducted from your wallet at the listed price; subscriptions cover requests up to the included quota first. Upstream failures are not billed.</p>
        </section>
      </div>
      <aside>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">API reference</h2>
        <div className="space-y-2">
          {products.map((p) => (
            <Link key={p.id} href={`/docs/${p.slug}`} className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:border-primary/40">
              <CategoryIcon slug={p.category.slug} className="h-4 w-4 text-primary" />
              <span className="flex-1 text-sm font-medium">{p.name}</span>
              <FileJson className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </aside>
    </div>
  );
}
