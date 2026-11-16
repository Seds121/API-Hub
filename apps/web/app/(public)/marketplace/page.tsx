import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MarketplaceBrowser } from './browser';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'API Marketplace', description: 'Search and compare authorized APIs by category, price and provider.' };

export default function MarketplacePage() {
  return (
    <div className="container py-12">
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">API Marketplace</h1>
        <p className="text-muted-foreground">Authorized APIs with transparent per-request pricing. One key works for all of them.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <MarketplaceBrowser />
      </Suspense>
    </div>
  );
}
