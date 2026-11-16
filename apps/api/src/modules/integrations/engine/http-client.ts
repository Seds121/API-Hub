import { Agent, request } from 'undici';
import { assertAllowedUrl, guardedLookup } from './ssrf';

export interface UpstreamHttpRequest {
  url: URL;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  allowedHosts: string[];
  allowPrivate: boolean;
  maxResponseBytes?: number;
}

export interface UpstreamHttpResponse {
  status: number;
  contentType: string | null;
  body: Buffer;
  latencyMs: number;
}

export class UpstreamNetworkError extends Error {
  constructor(
    readonly kind: 'TIMEOUT' | 'NETWORK' | 'SSRF' | 'TOO_LARGE',
    message: string,
  ) {
    super(message);
  }
}

const agents = new Map<boolean, Agent>();
function agentFor(allowPrivate: boolean) {
  let a = agents.get(allowPrivate);
  if (!a) {
    a = new Agent({
      connect: { lookup: guardedLookup(allowPrivate) as never, timeout: 5000 },
      keepAliveTimeout: 10_000,
      connections: 256,
    });
    agents.set(allowPrivate, a);
  }
  return a;
}

/** Close pooled upstream connections (graceful shutdown / tests). */
export async function closeUpstreamAgents() {
  await Promise.all([...agents.values()].map((a) => a.close().catch(() => undefined)));
  agents.clear();
}

/** Single outbound HTTP call. Never follows redirects; enforces allowlist, timeout and response size. */
export async function sendUpstream(req: UpstreamHttpRequest): Promise<UpstreamHttpResponse> {
  try {
    assertAllowedUrl(req.url, req.allowedHosts, req.allowPrivate);
  } catch (e) {
    throw new UpstreamNetworkError('SSRF', (e as Error).message);
  }
  const started = Date.now();
  const max = req.maxResponseBytes ?? 10 * 1024 * 1024;
  try {
    const res = await request(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      dispatcher: agentFor(req.allowPrivate),
      headersTimeout: req.timeoutMs,
      bodyTimeout: req.timeoutMs,
      signal: AbortSignal.timeout(req.timeoutMs),
    });
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += (chunk as Buffer).length;
      if (size > max) {
        res.body.destroy();
        throw new UpstreamNetworkError('TOO_LARGE', 'Upstream response exceeded size limit');
      }
      chunks.push(chunk as Buffer);
    }
    const ct = res.headers['content-type'];
    return {
      status: res.statusCode,
      contentType: Array.isArray(ct) ? ct[0]! : (ct ?? null),
      body: Buffer.concat(chunks),
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    if (e instanceof UpstreamNetworkError) throw e;
    const err = e as Error & { code?: string; name?: string };
    if (
      err.name === 'TimeoutError' ||
      err.name === 'AbortError' ||
      err.code === 'UND_ERR_HEADERS_TIMEOUT' ||
      err.code === 'UND_ERR_BODY_TIMEOUT' ||
      err.code === 'UND_ERR_CONNECT_TIMEOUT'
    ) {
      throw new UpstreamNetworkError('TIMEOUT', 'Upstream request timed out');
    }
    if (err.code === 'ESSRF' || (err as { cause?: { code?: string } }).cause?.code === 'ESSRF')
      throw new UpstreamNetworkError('SSRF', 'Blocked by SSRF protection');
    throw new UpstreamNetworkError('NETWORK', `Upstream network error (${err.code ?? err.name})`);
  }
}
