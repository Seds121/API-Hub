import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Mail, MapPin, MessageSquare } from 'lucide-react';
import { ContactForm } from './form';
import { COMPANY } from '@/lib/utils';

export const metadata: Metadata = { title: 'Contact' };

export default function ContactPage() {
  return (
    <div className="container grid gap-12 py-16 lg:grid-cols-2">
      <div className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">Contact {COMPANY}</h1>
        <p className="text-muted-foreground">Questions about APIs, enterprise pricing, agency partnerships or supplier onboarding? Send us a message and our team will reply within one business day.</p>
        <ul className="space-y-3 pt-4 text-sm">
          <li className="flex items-center gap-3"><MessageSquare className="h-4 w-4 text-primary" /> Sales & partnerships</li>
          <li className="flex items-center gap-3"><Mail className="h-4 w-4 text-primary" /> Existing customers: use Support in your dashboard</li>
          <li className="flex items-center gap-3"><MapPin className="h-4 w-4 text-primary" /> Serving customers worldwide</li>
        </ul>
      </div>
      <Suspense>
        <ContactForm />
      </Suspense>
    </div>
  );
}
