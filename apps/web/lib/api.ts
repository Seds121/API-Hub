'use client';

/** Browser API client: same-origin (/api via Next rewrites), cookie session, CSRF double-submit. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
  }
}

let csrfToken: string | null = null;

function readCookie(name: string) {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

async function ensureCsrf() {
  csrfToken = readCookie('zz_csrf') ?? csrfToken;
  if (!csrfToken) {
    const r = await fetch('/api/auth/csrf', { credentials: 'include' });
    csrfToken = ((await r.json()) as { csrfToken: string }).csrfToken;
  }
  return csrfToken;
}

export interface RequestOpts {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  orgId?: string | null;
}

export async function api<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json', ...(opts.headers ?? {}) };
  if (method !== 'GET') headers['x-csrf-token'] = await ensureCsrf();
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.orgId) headers['x-org-id'] = opts.orgId;
  let res = await fetch(path, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, credentials: 'include' });
  if (res.status === 403 && method !== 'GET') {
    const peek = await res.clone().json().catch(() => null);
    if (peek?.error?.code === 'CSRF_FAILED') {
      csrfToken = null;
      document.cookie = 'zz_csrf=; Max-Age=0; path=/';
      headers['x-csrf-token'] = await ensureCsrf();
      res = await fetch(path, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, credentials: 'include' });
    }
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    const e = (data as { error?: { code: string; message: string; details?: unknown } })?.error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return data as T;
}

export function errorMessage(e: unknown) {
  if (e instanceof ApiError) {
    if (Array.isArray(e.details) && e.details.length) {
      const first = e.details[0] as { message?: string; path?: string; param?: string } | string;
      const detail = typeof first === 'string' ? first : `${first.path ?? first.param ?? ''} ${first.message ?? ''}`.trim();
      return `${e.message} ${detail}`.trim();
    }
    return e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}

/** Download a binary/text response (PDF/CSV) with the session cookie. */
export async function download(path: string, filename: string) {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'Download failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
