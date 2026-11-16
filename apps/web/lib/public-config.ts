'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface PublicConfig {
  maintenanceBanner: string | null;
  signupsEnabled: boolean;
  demoMode: boolean;
  companyName: string;
  apiPublicUrl: string;
}

/** Runtime platform config served by the API (no build-time URLs in the client bundle). */
export function usePublicConfig() {
  return useQuery({ queryKey: ['public-settings'], queryFn: () => api<PublicConfig>('/api/admin/public-settings'), staleTime: 300_000, retry: false });
}
