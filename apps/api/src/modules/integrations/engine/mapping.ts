import type { ParamDef } from '@zeze/shared';

export class MappingError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface CustomerInput {
  pathParams: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

const HOP_BY_HOP_DENY = new Set([
  'host',
  'authorization',
  'cookie',
  'x-api-key',
  'x-rapidapi-key',
  'x-rapidapi-host',
  'content-length',
  'connection',
  'transfer-encoding',
  'proxy-authorization',
  'x-forwarded-for',
  'x-real-ip',
]);

function coerce(def: ParamDef, raw: unknown): string | number | boolean {
  const s = typeof raw === 'string' ? raw : String(raw);
  if (def.maxLength && s.length > def.maxLength)
    throw new MappingError(`Parameter "${def.name}" exceeds max length ${def.maxLength}`);
  if (s.length > 4096) throw new MappingError(`Parameter "${def.name}" is too long`);
  if (def.enum && !def.enum.includes(s))
    throw new MappingError(`Parameter "${def.name}" must be one of: ${def.enum.join(', ')}`);
  if (def.pattern && !new RegExp(def.pattern).test(s))
    throw new MappingError(`Parameter "${def.name}" has an invalid format`);
  switch (def.type) {
    case 'integer':
      if (!/^-?\d{1,15}$/.test(s))
        throw new MappingError(`Parameter "${def.name}" must be an integer`);
      return Number(s);
    case 'number':
      if (!/^-?\d{1,15}(\.\d{1,10})?$/.test(s))
        throw new MappingError(`Parameter "${def.name}" must be a number`);
      return Number(s);
    case 'boolean':
      if (!['true', 'false'].includes(s))
        throw new MappingError(`Parameter "${def.name}" must be true or false`);
      return s === 'true';
    default:
      return s;
  }
}

/**
 * Validates the customer's request strictly against the endpoint's declared parameters.
 * Unknown query parameters are rejected so customers cannot smuggle upstream options.
 */
export function validateInput(defs: ParamDef[], input: CustomerInput) {
  const errors: { param: string; message: string }[] = [];
  const out = {
    path: {} as Record<string, string | number | boolean>,
    query: {} as Record<string, string | number | boolean>,
    header: {} as Record<string, string>,
    body: {} as Record<string, unknown>,
  };
  const known = new Set(defs.filter((d) => d.in === 'query').map((d) => d.name));
  for (const k of Object.keys(input.query))
    if (!known.has(k)) errors.push({ param: k, message: 'Unknown query parameter' });

  for (const d of defs) {
    let raw: unknown;
    if (d.in === 'path') raw = input.pathParams[d.name];
    else if (d.in === 'query') raw = input.query[d.name];
    else if (d.in === 'header') raw = input.headers[d.name.toLowerCase()];
    else
      raw =
        input.body && typeof input.body === 'object'
          ? (input.body as Record<string, unknown>)[d.name]
          : undefined;
    if (raw === undefined || raw === null || raw === '') {
      if (d.required) errors.push({ param: d.name, message: 'Required parameter missing' });
      continue;
    }
    try {
      if (d.in === 'body' && typeof raw === 'object') {
        if (JSON.stringify(raw).length > 65536)
          throw new MappingError(`Parameter "${d.name}" too large`);
        out.body[d.name] = raw;
        continue;
      }
      const v = coerce(d, raw);
      if (d.in === 'header') {
        if (HOP_BY_HOP_DENY.has(d.name.toLowerCase())) continue;
        out.header[d.name.toLowerCase()] = String(v).replace(/[\r\n]/g, '');
      } else if (d.in === 'body') out.body[d.name] = v;
      else out[d.in][d.name] = v;
    } catch (e) {
      errors.push({ param: d.name, message: (e as Error).message });
    }
  }
  if (errors.length) throw new MappingError('Request validation failed.', errors);
  return out;
}

export function renderPath(
  template: string,
  values: Record<string, string | number | boolean>,
): string {
  return template.replace(/\{([A-Za-z0-9_\-.]+)\}/g, (_m, name: string) => {
    const v = values[name];
    if (v === undefined) throw new MappingError(`Missing path parameter "${name}"`);
    const s = String(v);
    if (s === '.' || s === '..' || s.includes('/') || s.includes('\\'))
      throw new MappingError(`Invalid path parameter "${name}"`);
    return encodeURIComponent(s);
  });
}

/** Replace "{{name}}" placeholders in a JSON template with validated parameter values. */
export function renderTemplate(tpl: unknown, values: Record<string, unknown>): unknown {
  if (typeof tpl === 'string') {
    const whole = /^\{\{([A-Za-z0-9_\-.]+)\}\}$/.exec(tpl);
    if (whole) return values[whole[1]!] ?? null;
    return tpl.replace(/\{\{([A-Za-z0-9_\-.]+)\}\}/g, (_m, n: string) =>
      values[n] === undefined ? '' : String(values[n]),
    );
  }
  if (Array.isArray(tpl)) return tpl.map((t) => renderTemplate(t, values));
  if (tpl && typeof tpl === 'object')
    return Object.fromEntries(Object.entries(tpl).map(([k, v]) => [k, renderTemplate(v, values)]));
  return tpl;
}

function getPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
      obj,
    );
}

export interface ResponseTransform {
  pick?: string[];
  rename?: Record<string, string>;
  /** Extract a nested object as the root, e.g. "data". */
  root?: string;
}

export function transformResponse(body: unknown, t: ResponseTransform | null | undefined): unknown {
  if (!t || body === null || typeof body !== 'object') return body;
  let cur: unknown = t.root ? getPath(body, t.root) : body;
  if (t.pick?.length && cur && typeof cur === 'object' && !Array.isArray(cur)) {
    const picked: Record<string, unknown> = {};
    for (const p of t.pick) {
      const v = getPath(cur, p);
      if (v !== undefined) picked[p.split('.').pop()!] = v;
    }
    cur = picked;
  }
  if (t.rename && cur && typeof cur === 'object' && !Array.isArray(cur)) {
    const o = { ...(cur as Record<string, unknown>) };
    for (const [from, to] of Object.entries(t.rename)) {
      if (from in o) {
        o[to] = o[from];
        delete o[from];
      }
    }
    cur = o;
  }
  return cur;
}
