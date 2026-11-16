'use client';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProductCard } from '@/components/site/product-card';
import { EmptyState, ErrorState } from '@/components/states';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { Category, Paged, ProductSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

export function MarketplaceBrowser() {
  const sp = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const params = { q: sp.get('q') ?? '', category: sp.get('category') ?? '', publisher: sp.get('publisher') ?? '', pricing: sp.get('pricing') ?? 'all', sort: sp.get('sort') ?? 'popular', page: sp.get('page') ?? '1' };
  const set = (patch: Partial<typeof params>) => {
    const next = new URLSearchParams({ ...params, page: '1', ...patch });
    for (const [k, v] of [...next.entries()]) if (!v || (k === 'pricing' && v === 'all') || (k === 'sort' && v === 'popular') || (k === 'page' && v === '1')) next.delete(k);
    router.replace(`/marketplace${next.toString() ? `?${next}` : ''}`, { scroll: false });
  };
  useEffect(() => {
    const t = setTimeout(() => q !== params.q && set({ q }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/api/catalog/categories') });
  const pubs = useQuery({ queryKey: ['publishers'], queryFn: () => api<string[]>('/api/catalog/publishers') });
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const products = useQuery({ queryKey: ['catalog', qs.toString()], queryFn: () => api<Paged<ProductSummary>>(`/api/catalog/products?${qs}&pageSize=12`) });

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-6" aria-label="Filters">
        <div className="flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="h-4 w-4" /> Filters
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</p>
          <button onClick={() => set({ category: '' })} className={cn('block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted', !params.category && 'bg-accent font-medium text-accent-foreground')}>
            All categories
          </button>
          {(cats.data ?? []).map((c) => (
            <button key={c.slug} onClick={() => set({ category: c.slug })} className={cn('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted', params.category === c.slug && 'bg-accent font-medium text-accent-foreground')}>
              {c.name}
              <span className="text-xs text-muted-foreground">{c.productCount}</span>
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pricing</p>
          <Select value={params.pricing} onValueChange={(v) => set({ pricing: v })} options={[{ value: 'all', label: 'All pricing models' }, { value: 'pay-per-request', label: 'Pay per request' }, { value: 'subscription', label: 'Subscription required' }]} />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Provider</p>
          <Select value={params.publisher} onValueChange={(v) => set({ publisher: v })} options={[{ value: '', label: 'All providers' }, ...(pubs.data ?? []).map((p) => ({ value: p, label: p }))]} />
        </div>
      </aside>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, use case or tag" className="pl-9" aria-label="Search APIs" />
          </div>
          <Select className="sm:w-48" value={params.sort} onValueChange={(v) => set({ sort: v })} options={[{ value: 'popular', label: 'Most popular' }, { value: 'newest', label: 'Newest' }, { value: 'name', label: 'Name (A–Z)' }, { value: 'price', label: 'Lowest price' }]} />
        </div>
        {products.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56" />
            ))}
          </div>
        ) : products.error ? (
          <ErrorState error={products.error} retry={() => products.refetch()} />
        ) : !products.data?.items.length ? (
          <EmptyState icon={Search} title="No APIs match your filters" description="Try a different search term or clear filters." action={<Button variant="outline" onClick={() => (setQ(''), router.replace('/marketplace'))}>Clear filters</Button>} />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{products.data.total} APIs</p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {products.data.items.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
            {products.data.pageCount > 1 && (
              <div className="flex justify-center gap-2">
                <Button variant="outline" size="sm" disabled={products.data.page <= 1} onClick={() => set({ page: String(products.data!.page - 1) })}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={products.data.page >= products.data.pageCount} onClick={() => set({ page: String(products.data!.page + 1) })}>
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
