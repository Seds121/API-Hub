'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { api, ApiError, errorMessage } from '@/lib/api';
import type { Me } from '@/lib/session';

const schema = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Enter your password'), mfaCode: z.string().regex(/^\d{6}$/, '6-digit code').optional().or(z.literal('')) });

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const f = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  return (
    <form
      className="space-y-4"
      onSubmit={f.handleSubmit(async (v) => {
        setError(null);
        try {
          await api('/api/auth/login', { method: 'POST', body: { email: v.email, password: v.password, ...(v.mfaCode ? { mfaCode: v.mfaCode } : {}) } });
          const me = await api<Me>('/api/auth/me');
          qc.setQueryData(['me'], me);
          const next = sp.get('next');
          router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : me.isPlatformStaff && !me.org ? '/admin' : '/dashboard');
        } catch (e) {
          if (e instanceof ApiError && e.code === 'MFA_REQUIRED') {
            setNeedsMfa(true);
            return;
          }
          setError(errorMessage(e));
        }
      })}
    >
      <Field label="Email" error={f.formState.errors.email?.message} htmlFor="email">
        <Input id="email" type="email" autoComplete="email" autoFocus {...f.register('email')} />
      </Field>
      <Field label="Password" error={f.formState.errors.password?.message} htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" {...f.register('password')} />
      </Field>
      {needsMfa && (
        <Field label="Authentication code" error={f.formState.errors.mfaCode?.message} hint="Enter the 6-digit code from your authenticator app." htmlFor="mfa">
          <Input id="mfa" inputMode="numeric" autoComplete="one-time-code" {...f.register('mfaCode')} />
        </Field>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" loading={f.formState.isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to manage your API keys, usage and billing.</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
      <p className="text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
      <p className="text-center text-xs text-muted-foreground">Forgot your password? Contact support from the <Link href="/contact?topic=support" className="underline">contact page</Link>.</p>
    </div>
  );
}
