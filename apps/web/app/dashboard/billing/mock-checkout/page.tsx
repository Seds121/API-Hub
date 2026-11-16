'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { FlaskConical } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { call, useAction } from '@/lib/query';

/** DEVELOPMENT ONLY — simulates a hosted checkout. The API refuses this flow in production. */
function MockCheckout() {
  const sp = useSearchParams();
  const router = useRouter();
  const id = sp.get('payment') ?? '';
  const complete = useAction((outcome: 'SUCCEEDED' | 'FAILED') => call(`/api/billing/payments/${id}/mock-complete`, { method: 'POST', body: { outcome } }), {
    success: (r) => ((r as { status: string }).status === 'SUCCEEDED' ? 'Demo payment succeeded — wallet credited' : 'Demo payment failed'),
    invalidate: [['billing'], ['payments'], ['tx'], ['invoices']],
    onSuccess: () => router.replace('/dashboard/billing'),
  });
  return (
    <div className="mx-auto max-w-md py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5 text-amber-500" /> Demo checkout</CardTitle>
          <CardDescription>Development-only payment simulator. It emits a signed webhook through the same verification pipeline used by real providers. No money moves.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <p className="mb-2 font-mono text-xs text-muted-foreground">Payment {id}</p>
          <Button loading={complete.isPending} onClick={() => complete.mutate('SUCCEEDED')}>Simulate successful payment</Button>
          <Button variant="outline" disabled={complete.isPending} onClick={() => complete.mutate('FAILED')}>Simulate failed payment</Button>
          <Button variant="ghost" onClick={() => router.replace('/dashboard/billing?status=cancelled')}>Cancel</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Page() {
  return <Suspense><MockCheckout /></Suspense>;
}
