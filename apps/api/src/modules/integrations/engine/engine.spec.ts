import { assertAllowedUrl, isPrivateAddress } from './ssrf';
import { CircuitBreaker, Semaphore } from './circuit-breaker';
import { renderPath, renderTemplate, transformResponse, validateInput } from './mapping';
import { RapidApiAdapter } from '../adapters/rapidapi.adapter';
import { DirectRestAdapter } from '../adapters/direct-rest.adapter';
import type { ApiProvider } from '@prisma/client';

describe('SSRF protection', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('treats %s as private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('treats %s as public', (ip) =>
    expect(isPrivateAddress(ip)).toBe(false),
  );
  it('enforces scheme, allowlist and no embedded credentials', () => {
    expect(() =>
      assertAllowedUrl(new URL('https://api.good.com/x'), ['api.good.com'], false),
    ).not.toThrow();
    expect(() =>
      assertAllowedUrl(new URL('http://api.good.com/x'), ['api.good.com'], false),
    ).toThrow(/Protocol/);
    expect(() => assertAllowedUrl(new URL('https://evil.com/x'), ['api.good.com'], false)).toThrow(
      /allowlist/,
    );
    expect(() =>
      assertAllowedUrl(new URL('https://u:p@api.good.com/x'), ['api.good.com'], false),
    ).toThrow(/Credentials/);
    expect(() =>
      assertAllowedUrl(new URL('https://169.254.169.254/'), ['169.254.169.254'], false),
    ).toThrow(/Private/);
  });
});

describe('Circuit breaker & semaphore', () => {
  it('opens after threshold, half-opens after cooldown, closes on success', () => {
    const b = new CircuitBreaker(3, 1000);
    for (let i = 0; i < 3; i++) b.failure(0);
    expect(b.canPass(500)).toBe(false);
    expect(b.canPass(1500)).toBe(true); // trial
    expect(b.canPass(1501)).toBe(false); // only one trial
    b.success();
    expect(b.canPass(1600)).toBe(true);
  });
  it('limits concurrency and queues waiters', async () => {
    const s = new Semaphore(1);
    const r1 = await s.acquire(100);
    await expect(s.acquire(20)).rejects.toThrow('CONCURRENCY_TIMEOUT');
    const p = s.acquire(500);
    r1();
    const r2 = await p;
    expect(s.inFlight).toBe(1);
    r2();
  });
});

describe('Request mapping', () => {
  const defs = [
    {
      name: 'username',
      in: 'query' as const,
      type: 'string' as const,
      required: true,
      maxLength: 10,
    },
    { name: 'count', in: 'query' as const, type: 'integer' as const, required: false },
    { name: 'id', in: 'path' as const, type: 'string' as const, required: true },
  ];
  it('validates strictly and rejects unknown parameters', () => {
    expect(() =>
      validateInput(defs, {
        pathParams: { id: '1' },
        query: { username: 'a', extra: '1' },
        headers: {},
        body: undefined,
      }),
    ).toThrow('Request validation failed.');
    expect(() =>
      validateInput(defs, {
        pathParams: { id: '1' },
        query: { username: 'a', count: 'x' },
        headers: {},
        body: undefined,
      }),
    ).toThrow();
    expect(() =>
      validateInput(defs, {
        pathParams: { id: '1' },
        query: { username: 'abcdefghijklmnop' },
        headers: {},
        body: undefined,
      }),
    ).toThrow();
    const v = validateInput(defs, {
      pathParams: { id: '1' },
      query: { username: 'a', count: '5' },
      headers: {},
      body: undefined,
    });
    expect(v.query).toEqual({ username: 'a', count: 5 });
  });
  it('encodes path params and blocks traversal', () => {
    expect(renderPath('/users/{id}', { id: 'a b' })).toBe('/users/a%20b');
    expect(() => renderPath('/users/{id}', { id: '..' })).toThrow();
    expect(() => renderPath('/users/{id}', { id: 'a/b' })).toThrow();
  });
  it('renders body templates and transforms responses', () => {
    expect(
      renderTemplate({ q: '{{name}}', n: '{{count}}', s: 'x-{{name}}' }, { name: 'bob', count: 3 }),
    ).toEqual({ q: 'bob', n: 3, s: 'x-bob' });
    expect(
      transformResponse(
        { data: { a: 1, b: { c: 2 }, d: 3 } },
        { root: 'data', pick: ['a', 'b.c'], rename: { a: 'alpha' } },
      ),
    ).toEqual({ alpha: 1, c: 2 });
  });
});

describe('Provider adapters', () => {
  const base = { authConfig: {}, authType: 'API_KEY' } as unknown as ApiProvider;
  const noop = async () => 'tok';
  it('RapidAPI adapter sets key + host headers', async () => {
    const r = await new RapidApiAdapter().authenticate({
      provider: { ...base, authConfig: { rapidApiHost: 'x.p.rapidapi.com' } } as ApiProvider,
      url: new URL('https://x.p.rapidapi.com/a'),
      secret: { apiKey: 'K' },
      getOAuthToken: noop,
    });
    expect(r.headers).toEqual({ 'X-RapidAPI-Key': 'K', 'X-RapidAPI-Host': 'x.p.rapidapi.com' });
    await expect(
      new RapidApiAdapter().authenticate({
        provider: base,
        url: new URL('https://h/a'),
        secret: null,
        getOAuthToken: noop,
      }),
    ).rejects.toThrow(/no active API key/);
  });
  it('Direct adapter supports api key (header/query), bearer, basic, custom headers, oauth2', async () => {
    const d = new DirectRestAdapter();
    const ctx = (authType: string, authConfig: object, secret: object) => ({
      provider: { ...base, authType, authConfig } as unknown as ApiProvider,
      url: new URL('https://h/a'),
      secret,
      getOAuthToken: noop,
    });
    expect(
      (await d.authenticate(ctx('API_KEY', { in: 'query', name: 'key' }, { apiKey: 'K' }))).query,
    ).toEqual({ key: 'K' });
    expect((await d.authenticate(ctx('API_KEY', {}, { apiKey: 'K' }))).headers).toEqual({
      'X-API-Key': 'K',
    });
    expect((await d.authenticate(ctx('BEARER', {}, { token: 'T' }))).headers.Authorization).toBe(
      'Bearer T',
    );
    expect(
      (await d.authenticate(ctx('BASIC', {}, { username: 'u', password: 'p' }))).headers
        .Authorization,
    ).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
    expect(
      (await d.authenticate(ctx('CUSTOM_HEADERS', {}, { headers: { 'X-A': '1' } }))).headers,
    ).toEqual({ 'X-A': '1' });
    expect(
      (
        await d.authenticate(
          ctx('OAUTH2', { tokenUrl: 'https://h/token' }, { clientId: 'c', clientSecret: 's' }),
        )
      ).headers.Authorization,
    ).toBe('Bearer tok');
  });
});
