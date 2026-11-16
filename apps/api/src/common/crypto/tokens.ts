import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { env } from '../../config/env';

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function randomBase62(len: number): string {
  const out: string[] = [];
  while (out.length < len) {
    for (const b of randomBytes(len * 2)) {
      if (b < 248 && out.length < len) out.push(B62[b % 62]!); // reject-sample to avoid modulo bias
    }
  }
  return out.join('');
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function hmacApiKey(secret: string): string {
  return createHmac('sha256', env().API_KEY_HMAC_SECRET).update(secret).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Customer API key format: zz_<env>_<8 char id>_<40 char secret>
 * The prefix (zz_<env>_<id>) is stored for lookup; only HMAC(full key) is stored.
 */
export function generateApiKey(environment: 'live' | 'test') {
  const id = randomBase62(8);
  const secret = randomBase62(40);
  const prefix = `zz_${environment}_${id}`;
  const full = `${prefix}_${secret}`;
  return { full, prefix, hash: hmacApiKey(full), last4: secret.slice(-4) };
}

export function parseApiKey(raw: string): { prefix: string } | null {
  const m = /^(zz_(?:live|test)_[0-9A-Za-z]{8})_[0-9A-Za-z]{40}$/.exec(raw);
  return m ? { prefix: m[1]! } : null;
}

export function newSessionToken() {
  const token = randomBase62(48);
  return { token, hash: sha256(token) };
}
