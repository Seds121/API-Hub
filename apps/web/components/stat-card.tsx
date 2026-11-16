import { Card } from './ui/card';
import { cn } from '@/lib/utils';

export function StatCard({ label, value, hint, icon: Icon, tone = 'default', className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ElementType; tone?: 'default' | 'success' | 'warning' | 'danger'; className?: string }) {
  const tones = { default: 'bg-primary/10 text-primary', success: 'bg-success/12 text-success', warning: 'bg-warning/15 text-amber-600 dark:text-amber-300', danger: 'bg-destructive/12 text-destructive' };
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-md', tones[tone])}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </Card>
  );
}
