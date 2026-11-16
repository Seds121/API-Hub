import Link from 'next/link';
import { ArrowUpRight, Lock } from 'lucide-react';
import { Badge } from '../ui/badge';
import { CategoryIcon } from './category-icon';
import type { ProductSummary } from '@/lib/types';
import { compact, money } from '@/lib/utils';

export function ProductCard({ p }: { p: ProductSummary }) {
  return (
    <Link href={`/marketplace/${p.slug}`} className="group flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground">
          <CategoryIcon slug={p.category.slug} className="h-5 w-5" />
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold leading-tight">{p.name}</h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">{p.summary}</p>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">{p.category.name}</Badge>
        {p.requiresSubscription && (
          <Badge variant="outline">
            <Lock className="h-3 w-3" /> Subscription
          </Badge>
        )}
        {p.isDemo && <Badge variant="warning">Demo</Badge>}
      </div>
      <div className="flex items-center justify-between border-t pt-3 text-sm">
        <span className="font-medium tabular-nums">
          {p.pricePerRequest ? money(p.pricePerRequest, { digits: 4 }) : '—'}
          <span className="font-normal text-muted-foreground"> / request</span>
        </span>
        <span className="text-xs text-muted-foreground">{compact(p.popularity)} calls</span>
      </div>
    </Link>
  );
}
