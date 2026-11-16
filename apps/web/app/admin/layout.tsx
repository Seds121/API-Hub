'use client';
import { Activity, Boxes, Building2, ClipboardList, Coins, CreditCard, FileKey2, Gauge, KeyRound, Layers, LifeBuoy, Plug, Receipt, ScrollText, Server, Settings, ShieldCheck, Tags, TrendingUp, Users, Wallet } from 'lucide-react';
import { AppShell, NavSection } from '@/components/app-shell';

const p = (perm: string) => (m: { platformPermissions: string[] }) => m.platformPermissions.includes(perm);

const sections: NavSection[] = [
  { items: [{ href: '/admin', label: 'Overview', icon: Gauge }] },
  {
    title: 'Catalog',
    items: [
      { href: '/admin/products', label: 'API Marketplace', icon: Boxes },
      { href: '/admin/endpoints', label: 'API Endpoints', icon: Layers },
      { href: '/admin/integrations', label: 'API Integrations', icon: Plug },
    ],
  },
  {
    title: 'Supply',
    items: [
      { href: '/admin/providers', label: 'API Providers', icon: Server },
      { href: '/admin/credentials', label: 'Provider Credentials', icon: FileKey2 },
      { href: '/admin/licenses', label: 'Licenses', icon: ShieldCheck },
      { href: '/admin/supplier-costs', label: 'Supplier Costs', icon: Coins, show: p('platform:billing:read') },
    ],
  },
  {
    title: 'Customers',
    items: [
      { href: '/admin/customers', label: 'Customers', icon: Users },
      { href: '/admin/agencies', label: 'Agencies', icon: Building2 },
      { href: '/admin/organizations', label: 'Organizations', icon: ClipboardList },
      { href: '/admin/api-keys', label: 'API Keys', icon: KeyRound },
    ],
  },
  {
    title: 'Commercial',
    items: [
      { href: '/admin/pricing', label: 'Pricing', icon: Tags, show: p('platform:billing:read') },
      { href: '/admin/plans', label: 'Subscription Plans', icon: CreditCard },
      { href: '/admin/wallets', label: 'Wallets', icon: Wallet, show: p('platform:billing:read') },
      { href: '/admin/transactions', label: 'Transactions', icon: Receipt, show: p('platform:billing:read') },
      { href: '/admin/revenue', label: 'Revenue & Profit', icon: TrendingUp, show: p('platform:billing:read') },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/admin/usage', label: 'API Usage', icon: Activity },
      { href: '/admin/support', label: 'Support Tickets', icon: LifeBuoy, show: p('platform:support:write') },
      { href: '/admin/audit', label: 'Audit Logs', icon: ScrollText, show: p('platform:audit:read') },
      { href: '/admin/settings', label: 'System Settings', icon: Settings },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell area="admin" sections={sections}>{children}</AppShell>;
}

