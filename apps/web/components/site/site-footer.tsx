import Link from 'next/link';
import { Logo } from '../brand';
import { COMPANY } from '@/lib/utils';

const COLS = [
  { title: 'Product', links: [['Marketplace', '/marketplace'], ['Pricing', '/pricing'], ['Developers', '/developers'], ['Documentation', '/docs']] },
  { title: 'Company', links: [['About', '/about'], ['Contact', '/contact'], ['Enterprise', '/contact?topic=enterprise'], ['Partners & agencies', '/contact?topic=partnership']] },
  { title: 'Legal', links: [['Terms of Service', '/terms'], ['Privacy Policy', '/privacy']] },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-navy-950 text-slate-300">
      <div className="container grid gap-10 py-14 md:grid-cols-5">
        <div className="space-y-3 md:col-span-2">
          <div className="text-white [&_span]:text-white">
            <Logo />
          </div>
          <p className="max-w-sm text-sm text-slate-400">One gateway, one key and one bill for authorized third-party APIs — with usage metering, wallets and reseller tools built in.</p>
        </div>
        {COLS.map((c) => (
          <div key={c.title} className="space-y-3">
            <p className="text-sm font-semibold text-white">{c.title}</p>
            <ul className="space-y-2 text-sm">
              {c.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-slate-400 transition-colors hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="container flex flex-col gap-2 py-6 text-xs text-slate-500 sm:flex-row sm:justify-between">
          <p>
            © {new Date().getFullYear()} {COMPANY}. All rights reserved.
          </p>
          <p>Third-party APIs are distributed only under verified supplier redistribution agreements.</p>
        </div>
      </div>
    </footer>
  );
}
