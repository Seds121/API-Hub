import Link from 'next/link';
import { cn, COMPANY } from '@/lib/utils';

export function Logo({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn('flex items-center gap-2 font-semibold tracking-tight', className)} aria-label={`${COMPANY} home`}>
      <span className="relative grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-navy-800 to-blue-600 text-white shadow-inner">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 6h14L5 18h14" />
        </svg>
      </span>
      <span className="text-[15px]">
        Ze-Ze<span className="font-normal text-muted-foreground"> API Hub</span>
      </span>
    </Link>
  );
}
