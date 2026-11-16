'use client';
import * as React from 'react';
import * as S from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Option {
  value: string;
  label: React.ReactNode;
}

/** Compact select built on Radix. Empty string values are mapped to a sentinel internally. */
export function Select({ value, onValueChange, options, placeholder, className, disabled, id }: { value: string; onValueChange: (v: string) => void; options: Option[]; placeholder?: string; className?: string; disabled?: boolean; id?: string }) {
  const NONE = '__none__';
  return (
    <S.Root value={value === '' ? NONE : value} onValueChange={(v) => onValueChange(v === NONE ? '' : v)} disabled={disabled}>
      <S.Trigger id={id} className={cn('flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50', className)}>
        <S.Value placeholder={placeholder} />
        <ChevronDown className="h-4 w-4 opacity-60" />
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={4} className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg">
          <S.Viewport className="p-1">
            {options.map((o) => (
              <S.Item key={o.value || NONE} value={o.value === '' ? NONE : o.value} className="relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-7 pr-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground">
                <S.ItemIndicator className="absolute left-2">
                  <Check className="h-3.5 w-3.5" />
                </S.ItemIndicator>
                <S.ItemText>{o.label}</S.ItemText>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
