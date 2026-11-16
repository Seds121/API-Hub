'use client';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: { icon?: React.ElementType; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center', className)}>
      <div className="grid h-11 w-11 place-items-center rounded-full bg-accent text-accent-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ error, retry, className }: { error: unknown; retry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center', className)}>
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <div>
        <p className="font-medium">Couldn’t load this data</p>
        <p className="text-sm text-muted-foreground">{errorMessage(error)}</p>
      </div>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-1" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function LoadingCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-28" />
      ))}
    </div>
  );
}

/** Renders loading / error / empty / content for a react-query result. */
export function QueryView<T>({ q, children, loading }: { q: { isLoading: boolean; error: unknown; data: T | undefined; refetch: () => unknown }; children: (d: T) => React.ReactNode; loading?: React.ReactNode }) {
  if (q.isLoading) return <>{loading ?? <LoadingRows />}</>;
  if (q.error) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  if (q.data === undefined) return null;
  return <>{children(q.data)}</>;
}
