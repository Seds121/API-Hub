'use client';
import * as React from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, wide, ...props }: React.ComponentPropsWithoutRef<typeof D.Content> & { wide?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-navy-950/60 backdrop-blur-sm data-[state=open]:animate-fade-in" />
      <D.Content className={cn('fixed left-1/2 top-1/2 z-50 grid max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border bg-card p-6 shadow-xl data-[state=open]:animate-fade-in', wide ? 'max-w-3xl' : 'max-w-lg', className)} {...props}>
        {children}
        <D.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring" aria-label="Close">
          <X className="h-4 w-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
export const DialogHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('flex flex-col gap-1.5', className)} {...p} />;
export const DialogFooter = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...p} />;
export const DialogTitle = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof D.Title>) => <D.Title className={cn('text-lg font-semibold', className)} {...p} />;
export const DialogDescription = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof D.Description>) => <D.Description className={cn('text-sm text-muted-foreground', className)} {...p} />;
