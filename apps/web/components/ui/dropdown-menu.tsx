'use client';
import * as React from 'react';
import * as M from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuContent = ({ className, sideOffset = 6, ...p }: React.ComponentPropsWithoutRef<typeof M.Content>) => (
  <M.Portal>
    <M.Content sideOffset={sideOffset} className={cn('z-50 min-w-[10rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg animate-fade-in', className)} {...p} />
  </M.Portal>
);
export const DropdownMenuItem = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof M.Item>) => (
  <M.Item className={cn('relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:size-4', className)} {...p} />
);
export const DropdownMenuLabel = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof M.Label>) => <M.Label className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)} {...p} />;
export const DropdownMenuSeparator = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof M.Separator>) => <M.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...p} />;
