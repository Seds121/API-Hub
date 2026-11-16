'use client';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage, type RequestOpts } from './api';

export function useApi<T>(path: string | null, key?: QueryKey, opts: { refetchInterval?: number } = {}) {
  return useQuery({ queryKey: key ?? [path], queryFn: () => api<T>(path!), enabled: !!path, refetchInterval: opts.refetchInterval });
}

/** Mutation with toast feedback and cache invalidation. */
export function useAction<TVars = void, TRes = unknown>(fn: (v: TVars) => Promise<TRes>, opts: { success?: string | ((r: TRes) => string); invalidate?: QueryKey[]; onSuccess?: (r: TRes) => void } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(r) : opts.success);
      await Promise.all((opts.invalidate ?? []).map((k) => qc.invalidateQueries({ queryKey: k })));
      opts.onSuccess?.(r);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export const call = <T,>(path: string, o: RequestOpts = {}) => api<T>(path, o);
