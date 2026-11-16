'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronsUpDown, LogOut, Menu, Shield, LayoutDashboard, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Logo } from './brand';
import { ThemeToggle } from './theme-toggle';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Skeleton } from './ui/skeleton';
import { api, errorMessage } from '@/lib/api';
import { Me, useLogout, useMe } from '@/lib/session';
import { cn } from '@/lib/utils';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  show?: (me: Me) => boolean;
}
export interface NavSection {
  title?: string;
  items: NavItem[];
}

function OrgSwitcher({ me }: { me: Me }) {
  const qc = useQueryClient();
  if (!me.org) return null;
  const switchTo = async (orgId: string) => {
    try {
      await api('/api/auth/switch-org', { method: 'POST', body: { orgId } });
      await qc.invalidateQueries();
      toast.success('Organization switched');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-left text-sm hover:bg-accent">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{me.org.name}</span>
          <span className="block text-[11px] capitalize text-muted-foreground">{me.org.parentOrgId ? 'Agency subaccount' : me.org.type.toLowerCase()} · {me.orgRole?.replace('ORG_', '').toLowerCase()}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {me.memberships.map((m) => (
          <DropdownMenuItem key={m.orgId} onSelect={() => switchTo(m.orgId)} className={cn(m.orgId === me.org?.id && 'font-medium')}>
            <Building2 />
            <span className="truncate">{m.orgName}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ sections, children, area }: { sections: NavSection[]; children: React.ReactNode; area: 'dashboard' | 'admin' }) {
  const pathname = usePathname();
  const me = useMe({ redirectOnUnauth: true });
  const logout = useLogout();
  const [open, setOpen] = useState(false);

  if (me.isLoading || me.error) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-64 border-r p-4 lg:block">
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="flex-1 space-y-4 p-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }
  const user = me.data!;
  if (area === 'admin' && !user.isPlatformStaff) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div className="space-y-3">
          <Shield className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-lg font-semibold">Administrator access required</p>
          <Button asChild variant="outline">
            <Link href="/dashboard">Go to your dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  const nav = (
    <nav className="flex flex-col gap-5" aria-label={area === 'admin' ? 'Admin navigation' : 'Dashboard navigation'}>
      {sections.map((s, i) => {
        const items = s.items.filter((it) => !it.show || it.show(user));
        if (!items.length) return null;
        return (
          <div key={i} className="space-y-1">
            {s.title && <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.title}</p>}
            {items.map((it) => {
              const active = it.href === `/${area}` ? pathname === it.href : pathname.startsWith(it.href);
              return (
                <Link key={it.href} href={it.href} onClick={() => setOpen(false)} className={cn('flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors', active ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  <it.icon className="h-4 w-4" />
                  {it.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-64 flex-col gap-4 border-r bg-background p-4 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center justify-between">
          <Logo href={area === 'admin' ? '/admin' : '/dashboard'} />
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X />
          </Button>
        </div>
        {area === 'admin' ? (
          <div className="rounded-md bg-navy-900 px-2.5 py-2 text-xs font-medium text-white">Administration console</div>
        ) : (
          <OrgSwitcher me={user} />
        )}
        <div className="-mx-1 flex-1 overflow-y-auto px-1">{nav}</div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <div className="flex-1" />
          {user.isPlatformStaff && (
            <Button asChild variant="ghost" size="sm">
              {area === 'admin' ? (
                <Link href="/dashboard">
                  <LayoutDashboard /> Customer view
                </Link>
              ) : (
                <Link href="/admin">
                  <Shield /> Admin
                </Link>
              )}
            </Button>
          )}
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-ring" aria-label="Account menu">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-navy-800 text-xs font-semibold text-white">{user.user.name.slice(0, 2).toUpperCase()}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <span className="block text-sm font-medium text-foreground">{user.user.name}</span>
                <span className="block truncate">{user.user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">Account settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void logout()}>
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 animate-fade-in px-4 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
