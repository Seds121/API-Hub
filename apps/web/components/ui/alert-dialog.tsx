'use client';
import * as React from 'react';
import * as A from '@radix-ui/react-alert-dialog';
import { buttonVariants } from './button';
import { cn } from '@/lib/utils';

/** Confirmation dialog for destructive or financial actions. */
export function ConfirmDialog({ trigger, title, description, confirmLabel = 'Confirm', destructive, onConfirm, open: controlledOpen, onOpenChange }: { trigger?: React.ReactNode; title: string; description: React.ReactNode; confirmLabel?: string; destructive?: boolean; onConfirm: () => void | Promise<void>; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  const [busy, setBusy] = React.useState(false);
  const [innerOpen, setInnerOpen] = React.useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setInnerOpen(o));
  return (
    <A.Root open={open} onOpenChange={setOpen}>
      {trigger && <A.Trigger asChild>{trigger}</A.Trigger>}
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-50 bg-navy-950/60 backdrop-blur-sm" />
        <A.Content className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-card p-6 shadow-xl animate-fade-in">
          <A.Title className="text-lg font-semibold">{title}</A.Title>
          <A.Description className="text-sm text-muted-foreground">{description}</A.Description>
          <div className="flex justify-end gap-2">
            <A.Cancel className={buttonVariants({ variant: 'outline' })}>Cancel</A.Cancel>
            <button
              className={cn(buttonVariants({ variant: destructive ? 'destructive' : 'default' }))}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } catch {
                  /* error surfaced by caller (toast) */
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
