/** Keys whose values must never reach logs, audit metadata, or error output. */
const SENSITIVE =
  /(pass(word)?|secret|token|api[-_]?key|authorization|cookie|x-rapidapi-key|credential|cipher|private|signature|mfa)/i;

export function redact<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out as T;
  }
  if (typeof value === 'string') return redactString(value) as unknown as T;
  return value;
}

/** Mask anything that looks like one of our API keys or a bearer token in free text. */
export function redactString(s: string): string {
  return s
    .replace(/zz_(live|test)_[0-9A-Za-z]{8}_[0-9A-Za-z]{40}/g, 'zz_$1_********_[REDACTED]')
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[REDACTED]');
}

export const PINO_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-rapidapi-key"]',
  'req.headers["x-subscription-token"]',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.secret',
  '*.token',
];
