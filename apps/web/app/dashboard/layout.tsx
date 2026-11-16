'use client';
import { BarChart3, BookOpen, Boxes, CreditCard, KeyRound, LayoutDashboard, LifeBuoy, PlayCircle, Settings, Users } from 'lucide-react';
import { AppShell, NavSection } from '@/components/app-shell';

const sections: NavSection[] = [
  {
    items: [
      { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
      { href: '/dashboard/apis', label: 'Available APIs', icon: Boxes },
      { href: '/dashboard/keys', label: 'API keys', icon: KeyRound },
      { href: '/dashboard/usage', label: 'Usage', icon: BarChart3 },
      { href: '/dashboard/billing', label: 'Billing & wallet', icon: CreditCard, show: (m) => m.orgPermissions.includes('org:billing:read') },
    ],
  },
  {
    title: 'Developers',
    items: [
      { href: '/dashboard/playground', label: 'API playground', icon: PlayCircle },
      { href: '/docs', label: 'Documentation', icon: BookOpen },
    ],
  },
  {
    title: 'Organization',
    items: [
      { href: '/dashboard/agency', label: 'Agency & clients', icon: Users, show: (m) => m.org?.type === 'AGENCY' },
      { href: '/dashboard/support', label: 'Support', icon: LifeBuoy },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell area="dashboard" sections={sections}>
      {children}
    </AppShell>
  );
}
