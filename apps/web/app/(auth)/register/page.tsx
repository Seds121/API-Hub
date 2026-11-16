'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(2, 'Enter your full name'),
  email: z.string().email('Enter a valid email'),
  organizationName: z.string().min(2, 'Enter your company or project name'),
  password: z.string().min(10, 'At least 10 characters').regex(/[a-z]/, 'Add a lowercase letter').regex(/[A-Z]/, 'Add an uppercase letter').regex(/[0-9]/, 'Add a digit'),
  accountType: z.enum(['CUSTOMER', 'AGENCY']),
  acceptTerms: z.boolean().refine((v) => v, 'You must accept the terms'),
});
type F = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const f = useForm<F>({ resolver: zodResolver(schema), defaultValues: { accountType: 'CUSTOMER', acceptTerms: false } });
  const type = f.watch('accountType');
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">Get an API key in minutes. Pay only for successful requests.</p>
      </div>
      <form
        className="space-y-4"
        onSubmit={f.handleSubmit(async (v) => {
          setError(null);
          try {
            await api('/api/auth/register', { method: 'POST', body: v });
            await qc.invalidateQueries({ queryKey: ['me'] });
            router.replace('/dashboard?welcome=1');
          } catch (e) {
            setError(errorMessage(e));
          }
        })}
      >
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
          {[
            { v: 'CUSTOMER' as const, icon: Building2, t: 'Business / developer', d: 'Use APIs in your products' },
            { v: 'AGENCY' as const, icon: Users, t: 'Agency / reseller', d: 'Manage client subaccounts' },
          ].map((o) => (
            <button type="button" role="radio" aria-checked={type === o.v} key={o.v} onClick={() => f.setValue('accountType', o.v)} className={cn('rounded-lg border p-3 text-left transition-colors', type === o.v ? 'border-primary bg-accent' : 'hover:bg-muted')}>
              <o.icon className="mb-1.5 h-4 w-4 text-primary" />
              <p className="text-sm font-medium">{o.t}</p>
              <p className="text-xs text-muted-foreground">{o.d}</p>
            </button>
          ))}
        </div>
        <Field label="Full name" error={f.formState.errors.name?.message} htmlFor="name">
          <Input id="name" autoComplete="name" {...f.register('name')} />
        </Field>
        <Field label="Work email" error={f.formState.errors.email?.message} htmlFor="email">
          <Input id="email" type="email" autoComplete="email" {...f.register('email')} />
        </Field>
        <Field label={type === 'AGENCY' ? 'Agency name' : 'Company / project name'} error={f.formState.errors.organizationName?.message} htmlFor="org">
          <Input id="org" {...f.register('organizationName')} />
        </Field>
        <Field label="Password" error={f.formState.errors.password?.message} hint="10+ characters with upper, lower case and a digit." htmlFor="password">
          <Input id="password" type="password" autoComplete="new-password" {...f.register('password')} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" {...f.register('acceptTerms')} />
          <span className="text-muted-foreground">
            I agree to the <Link href="/terms" className="text-primary underline">Terms</Link> and <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>.
          </span>
        </label>
        {f.formState.errors.acceptTerms && <p className="text-xs text-destructive">{f.formState.errors.acceptTerms.message}</p>}
        {type === 'AGENCY' && <p className="rounded-md bg-accent p-2 text-xs text-accent-foreground">Agency reseller features are activated after a short review of your agency agreement.</p>}
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" loading={f.formState.isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
