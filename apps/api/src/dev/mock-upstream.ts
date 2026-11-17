/**
 * MOCK UPSTREAM PROVIDER — development & CI only. Emulates third-party APIs (incl. RapidAPI-style
 * header auth) so the gateway can be exercised end-to-end without real supplier credentials.
 * Responses are clearly labeled with "_mock": true.
 */
import http from 'http';
import { URL } from 'url';

export const MOCK_RAPIDAPI_KEY = 'mock-rapidapi-key-for-dev-only';
export const MOCK_DIRECT_KEY = 'mock-direct-key-for-dev-only';
/** TEST FIXTURE ONLY: emulates Brave's auth contract for e2e tests. Never seeded as a product. */
export const MOCK_BRAVE_KEY = 'mock-brave-key-for-tests-only';

type Handler = (
  req: http.IncomingMessage,
  url: URL,
  body: unknown,
) => { status: number; body: unknown; delayMs?: number; contentType?: string };

export interface MockStats {
  calls: {
    method: string;
    path: string;
    headers: http.IncomingHttpHeaders;
    query: Record<string, string>;
    body: unknown;
  }[];
}

export function createMockUpstream(): { server: http.Server; stats: MockStats } {
  const stats: MockStats = { calls: [] };
  const requireRapid = (req: http.IncomingMessage) =>
    req.headers['x-rapidapi-key'] === MOCK_RAPIDAPI_KEY &&
    typeof req.headers['x-rapidapi-host'] === 'string';
  const requireDirect = (req: http.IncomingMessage) => req.headers['x-api-key'] === MOCK_DIRECT_KEY;
  let flakyCount = 0;

  const routes: Record<string, Handler> = {
    'GET /health': () => ({ status: 200, body: { ok: true, _mock: true } }),
    // RapidAPI-style social profile API
    'GET /social/profile': (req, url) => {
      if (!requireRapid(req))
        return { status: 403, body: { message: 'You are not subscribed to this API.' } };
      const username = url.searchParams.get('username');
      if (!username) return { status: 400, body: { message: 'username required' } };
      if (username === 'notfound') return { status: 404, body: { message: 'Profile not found' } };
      return {
        status: 200,
        body: {
          _mock: true,
          data: {
            username,
            displayName: `Demo ${username}`,
            followers: 1200,
            following: 180,
            verified: false,
            platform: 'demo-social',
          },
          meta: { source: 'mock' },
        },
      };
    },
    'GET /social/posts': (req, url) => {
      if (!requireRapid(req)) return { status: 403, body: { message: 'Invalid API key' } };
      const limit = Number(url.searchParams.get('count') ?? 5);
      return {
        status: 200,
        body: {
          _mock: true,
          posts: Array.from({ length: Math.min(limit, 20) }, (_, i) => ({
            id: `p${i + 1}`,
            text: `Demo post ${i + 1}`,
            likes: 10 * (i + 1),
          })),
        },
      };
    },
    // Direct REST: email verification
    'POST /v2/email/verify': (req, _url, body) => {
      if (!requireDirect(req)) return { status: 401, body: { error: 'unauthorized' } };
      const email = (body as { email?: string })?.email ?? '';
      const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
      return {
        status: 200,
        body: {
          _mock: true,
          email,
          valid,
          disposable: email.endsWith('@mailinator.com'),
          mxFound: valid,
        },
      };
    },
    // Direct REST: geolocation by IP (path param)
    'GET /geo/ip': (req, url) => {
      if (!requireDirect(req)) return { status: 401, body: { error: 'unauthorized' } };
      const ip = url.pathname.split('/').pop();
      return {
        status: 200,
        body: { _mock: true, ip, country: 'ZZ', city: 'Demo City', lat: 0, lon: 0 },
      };
    },
    // Business data lookup (bearer)
    // Test-only Brave-shaped route (X-Subscription-Token auth). Real Brave is used when a key is configured.
    'GET /res/v1/web/search': (req, url) => {
      if (req.headers['x-subscription-token'] !== MOCK_BRAVE_KEY)
        // Mirrors real Brave: an invalid key is a 422, not a 401.
        return {
          status: 422,
          body: {
            type: 'ErrorResponse',
            error: {
              status: 422,
              detail: 'The provided API key is invalid.',
              meta: { component: 'authentication' },
              code: 'SUBSCRIPTION_TOKEN_INVALID',
            },
          },
        };
      const q = url.searchParams.get('q');
      if (!q)
        return { status: 422, body: { type: 'ErrorResponse', error: { code: 'VALIDATION' } } };
      return {
        status: 200,
        body: {
          _mock: true,
          type: 'search',
          query: { original: q },
          web: {
            type: 'search',
            results: [
              { title: `Result for ${q}`, url: 'https://example.com', description: 'Mock snippet' },
            ],
          },
        },
      };
    },
    'GET /companies/search': (req, url) => {
      if (req.headers.authorization !== `Bearer ${MOCK_DIRECT_KEY}`)
        return { status: 401, body: { error: 'unauthorized' } };
      const q = url.searchParams.get('name') ?? '';
      return {
        status: 200,
        body: {
          _mock: true,
          results: [
            {
              name: `${q} Holdings (Demo)`,
              registrationNumber: 'DEMO-0001',
              country: 'ZZ',
              status: 'active',
            },
          ],
        },
      };
    },
    // Fault injection
    'GET /faults/slow': () => ({ status: 200, body: { _mock: true, slow: true }, delayMs: 3000 }),
    'GET /faults/500': () => ({ status: 500, body: { error: 'boom' } }),
    'GET /faults/429': () => ({ status: 429, body: { error: 'quota exceeded' } }),
    'GET /faults/flaky': () =>
      ++flakyCount % 2 === 1
        ? { status: 503, body: { error: 'temporarily unavailable' } }
        : { status: 200, body: { _mock: true, recovered: true } },
    'GET /faults/redirect': () => ({ status: 302, body: '', contentType: 'text/plain' }),
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://mock');
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      let body: unknown;
      try {
        body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
      } catch {
        body = undefined;
      }
      stats.calls.push({
        method: req.method ?? 'GET',
        path: url.pathname,
        headers: req.headers,
        query: Object.fromEntries(url.searchParams),
        body,
      });
      const key = url.pathname.startsWith('/geo/ip/')
        ? 'GET /geo/ip'
        : `${req.method} ${url.pathname}`;
      const h = routes[key];
      const r = h ? h(req, url, body) : { status: 404, body: { message: 'Not found (mock)' } };
      const send = () => {
        if (r.status === 302) {
          res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
          return res.end();
        }
        res.writeHead(r.status, {
          'content-type': r.contentType ?? 'application/json',
          'x-upstream-secret-header': 'should-not-leak',
        });
        res.end(typeof r.body === 'string' ? r.body : JSON.stringify(r.body));
      };
      if (r.delayMs) setTimeout(send, r.delayMs);
      else send();
    });
  });
  return { server, stats };
}

if (require.main === module) {
  const port = Number(process.env.MOCK_UPSTREAM_PORT ?? 4010);
  createMockUpstream().server.listen(port, '127.0.0.1', () =>
    console.warn(`[mock-upstream] DEV ONLY — listening on http://127.0.0.1:${port}`),
  );
}
