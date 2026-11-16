import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Providers } from '@/components/providers';
import { COMPANY } from '@/lib/utils';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${COMPANY} — API Marketplace`, template: `%s · ${COMPANY}` },
  description: `${COMPANY} API Hub: one key, one bill, hundreds of authorized APIs for social data, identity, AI, geolocation and more.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
