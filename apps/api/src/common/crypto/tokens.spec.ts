import { generateApiKey, hmacApiKey, parseApiKey, randomBase62, safeEqualHex } from './tokens';

describe('API key generation & validation primitives', () => {
  it('generates keys with a lookup prefix and never stores the secret', () => {
    const k = generateApiKey('live');
    expect(k.full).toMatch(/^zz_live_[0-9A-Za-z]{8}_[0-9A-Za-z]{40}$/);
    expect(k.full.startsWith(k.prefix)).toBe(true);
    expect(k.hash).toHaveLength(64);
    expect(k.hash).not.toContain(k.full.slice(-40));
    expect(parseApiKey(k.full)).toEqual({ prefix: k.prefix });
  });
  it('rejects malformed keys', () => {
    expect(parseApiKey('zz_live_short')).toBeNull();
    expect(parseApiKey('sk_live_' + 'a'.repeat(49))).toBeNull();
    expect(parseApiKey(generateApiKey('test').full + 'x')).toBeNull();
  });
  it('HMAC verification is deterministic and constant-time comparable', () => {
    const k = generateApiKey('test');
    expect(safeEqualHex(hmacApiKey(k.full), k.hash)).toBe(true);
    const tampered = k.full.slice(0, -1) + (k.full.endsWith('Z') ? 'Y' : 'Z'); // always differs
    expect(safeEqualHex(hmacApiKey(tampered), k.hash)).toBe(false);
  });
  it('produces unique high-entropy secrets', () => {
    const set = new Set(Array.from({ length: 2000 }, () => randomBase62(20)));
    expect(set.size).toBe(2000);
  });
});
