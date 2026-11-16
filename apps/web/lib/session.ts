'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api, ApiError } from './api';

export interface Me {
  user: { id: string; email: string; name: string };
  org: { id: string; type: 'CUSTOMER' | 'AGENCY' | 'PLATFORM'; parentOrgId: string | null; name: string } | null;
  orgRole: string | null;
  orgPermissions: string[];
  platformRole: string | null;
  platformPermissions: string[];
  isPlatformStaff: boolean;
  memberships: { orgId: string; orgName: string; orgType: string; role: string }[];
}

export function useMe(opts: { redirectOnUnauth?: boolean } = {}) {
  const router = useRouter();
  const q = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/auth/me'), retry: false, staleTime: 60_000 });
  useEffect(() => {
    if (opts.redirectOnUnauth && q.error instanceof ApiError && q.error.status === 401) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [q.error, opts.redirectOnUnauth, router]);
  return q;
}

export function can(me: Me | undefined, perm: string) {
  if (!me) return false;
  return perm.startsWith('platform:') ? me.platformPermissions.includes(perm) : me.orgPermissions.includes(perm);
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    qc.clear();
    router.replace('/login');
  };
}
