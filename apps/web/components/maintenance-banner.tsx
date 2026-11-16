'use client';
import { FlaskConical, Megaphone } from 'lucide-react';
import { usePublicConfig } from '@/lib/public-config';

/** Sitewide banners: admin maintenance message, and a permanent notice on DEMO_MODE deployments. */
export function MaintenanceBanner() {
  const q = usePublicConfig();
  if (!q.data) return null;
  return (
    <>
      {q.data.demoMode && (
        <div role="note" className="flex items-center justify-center gap-2 bg-navy-900 px-4 py-1.5 text-center text-xs font-medium text-blue-100">
          <FlaskConical className="h-3.5 w-3.5 text-amber-400" /> Demo environment — sample APIs use simulated suppliers and the demo payment method. No real money or supplier data.
        </div>
      )}
      {q.data.maintenanceBanner && (
        <div role="status" className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-sm font-medium text-amber-950">
          <Megaphone className="h-4 w-4" /> {q.data.maintenanceBanner}
        </div>
      )}
    </>
  );
}
