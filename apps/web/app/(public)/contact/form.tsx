'use client';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';

const schema = z.object({ name: z.string().min(2, 'Enter your name'), email: z.string().email('Enter a valid email'), company: z.string().optional(), topic: z.enum(['general', 'sales', 'enterprise', 'partnership', 'support']), message: z.string().min(10, 'Please write at least 10 characters') });
type F = z.infer<typeof schema>;

export function ContactForm() {
  const sp = useSearchParams();
  const [sent, setSent] = useState(false);
  const initialTopic = (['general', 'sales', 'enterprise', 'partnership', 'support'] as const).find((t) => t === sp.get('topic')) ?? 'general';
  const f = useForm<F>({ resolver: zodResolver(schema), defaultValues: { topic: initialTopic } });
  if (sent)
    return (
      <Card className="grid place-items-center p-10 text-center">
        <CheckCircle2 className="mb-3 h-10 w-10 text-success" />
        <p className="text-lg font-semibold">Thanks — we received your message.</p>
        <p className="text-sm text-muted-foreground">We’ll get back to you shortly.</p>
      </Card>
    );
  return (
    <Card>
      <CardContent className="pt-6">
        <form
          className="grid gap-4"
          onSubmit={f.handleSubmit(async (v) => {
            try {
              await api('/api/contact', { method: 'POST', body: v });
              setSent(true);
            } catch (e) {
              toast.error(errorMessage(e));
            }
          })}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" error={f.formState.errors.name?.message} htmlFor="name">
              <Input id="name" {...f.register('name')} />
            </Field>
            <Field label="Work email" error={f.formState.errors.email?.message} htmlFor="email">
              <Input id="email" type="email" {...f.register('email')} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company" htmlFor="company">
              <Input id="company" {...f.register('company')} />
            </Field>
            <Field label="Topic">
              <Select value={f.watch('topic')} onValueChange={(v) => f.setValue('topic', v as F['topic'])} options={[{ value: 'general', label: 'General' }, { value: 'sales', label: 'Sales' }, { value: 'enterprise', label: 'Enterprise' }, { value: 'partnership', label: 'Agency / partnership' }, { value: 'support', label: 'Support' }]} />
            </Field>
          </div>
          <Field label="Message" error={f.formState.errors.message?.message} htmlFor="message">
            <Textarea id="message" rows={6} {...f.register('message')} />
          </Field>
          <Button type="submit" loading={f.formState.isSubmitting}>
            Send message
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
