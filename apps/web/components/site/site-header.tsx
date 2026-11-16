'use client';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Logo } from '../brand';
import { ThemeToggle } from '../theme-toggle';
import { Button } from '../ui/button';
import { useMe } from '@/lib/session';

const LINKS = [
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/developers', label: 'Developers' },
  { href: '/docs', label: 'Docs' },
  { href: '/about', label: 'About' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const me = useMe();
  const signedIn = !!me.data;
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="container flex h-16 items-center gap-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <ThemeToggle />
          {signedIn ? (
            <Button asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild>
                <Link href="/register">Get API key</Link>
              </Button>
            </>
          )}
        </div>
        <Button variant="ghost" size="icon" className="ml-auto md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
          {open ? <X /> : <Menu />}
        </Button>
      </div>
      {open && (
        <div className="border-t md:hidden">
          <div className="container flex flex-col gap-1 py-3">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-md px-2 py-2 text-sm hover:bg-muted">
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex gap-2">
              <Button asChild variant="outline" className="flex-1">
                <Link href={signedIn ? '/dashboard' : '/login'}>{signedIn ? 'Dashboard' : 'Sign in'}</Link>
              </Button>
              {!signedIn && (
                <Button asChild className="flex-1">
                  <Link href="/register">Get API key</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
