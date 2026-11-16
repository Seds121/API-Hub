import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EndpointDocs } from '@/components/site/endpoint-docs';
import { serverGet } from '@/lib/server-api';
import { publicApiUrl } from '@/lib/public-url';
import type { ProductDetail } from '@/lib/types';

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await serverGet<ProductDetail>(`/api/catalog/products/${(await params).slug}`);
  return { title: p ? `${p.name} docs` : 'Docs' };
}

export default async function ProductDocs({ params }: Props) {
  const API_PUBLIC_URL = await publicApiUrl();
  const { slug } = await params;
  const p = await serverGet<ProductDetail>(`/api/catalog/products/${slug}`);
  if (!p) notFound();
  return (
    <div className="container py-12">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground">
            Documentation /
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">{p.name} API reference</h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">{p.baseUrl}</p>
        </div>
        <Button asChild variant="outline">
          <a href={`/api/catalog/products/${p.slug}/openapi.json`} download={`${p.slug}.openapi.json`}>
            <Download /> OpenAPI 3.0 spec
          </a>
        </Button>
      </div>
      {p.docsMarkdown && (
        <div className="prose prose-sm mb-10 max-w-none dark:prose-invert">
          <ReactMarkdown>{p.docsMarkdown}</ReactMarkdown>
        </div>
      )}
      {p.usageRestrictions && <p className="mb-8 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><strong>Usage restrictions:</strong> {p.usageRestrictions}</p>}
      <EndpointDocs product={p} baseUrl={API_PUBLIC_URL} />
    </div>
  );
}
