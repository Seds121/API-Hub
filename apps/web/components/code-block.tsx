'use client';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function CopyButton({ value, className, label = 'Copy' }: { value: string; className?: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      className={cn('inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-slate-300 hover:bg-white/10', className)}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? 'Copied' : label}
    </button>
  );
}

export function CodeBlock({ code, language, className, title }: { code: string; language?: string; className?: string; title?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-navy-800 bg-navy-950 text-slate-100', className)}>
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">{title ?? language}</span>
        <CopyButton value={code} />
      </div>
      <pre className="overflow-x-auto p-4 text-[12.5px] leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
