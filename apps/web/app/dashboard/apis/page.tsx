'use client';
import Link from 'next/link';
import { BookOpen, PlayCircle } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { QueryView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApi } from '@/lib/query';
import type { Paged, ProductSummary } from '@/lib/types';
import { money } from '@/lib/utils';

export default function AvailableApis() {
  const q = useApi<Paged<ProductSummary>>('/api/catalog/products?pageSize=60&sort=name');
  return (
    <>
      <PageHeader title="Available APIs" description="Every published API you can call with your keys. Prices shown are list prices; your plan or contract may apply discounts." actions={<Button asChild variant="outline"><Link href="/marketplace">Open marketplace</Link></Button>} />
      <QueryView q={q}>
        {(d) => (
          <DataTable
            rows={d.items}
            rowKey={(p) => p.id}
            searchPlaceholder="Search APIs"
            columns={[
              { header: 'API', searchValue: (p) => `${p.name} ${p.slug} ${p.category.name}`, cell: (p) => (<div><Link href={`/marketplace/${p.slug}`} className="font-medium hover:underline">{p.name}</Link><p className="text-xs text-muted-foreground">{p.summary}</p></div>) },
              { header: 'Slug', cell: (p) => <code className="text-xs">/v1/{p.slug}</code> },
              { header: 'Category', cell: (p) => <Badge variant="secondary">{p.category.name}</Badge> },
              { header: 'Price', className: 'text-right', cell: (p) => <span className="tabular-nums">{money(p.pricePerRequest, { digits: 4 })}</span> },
              { header: 'Access', cell: (p) => (p.requiresSubscription ? <Badge variant="outline">Subscription</Badge> : <Badge variant="success">Pay per request</Badge>) },
              { header: '', cell: (p) => (<div className="flex justify-end gap-1"><Button asChild variant="ghost" size="icon" aria-label="Docs"><Link href={`/docs/${p.slug}`}><BookOpen /></Link></Button><Button asChild variant="ghost" size="icon" aria-label="Playground"><Link href={`/dashboard/playground?api=${p.slug}`}><PlayCircle /></Link></Button></div>) },
            ]}
          />
        )}
      </QueryView>
    </>
  );
}
