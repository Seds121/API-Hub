import { lookup as dnsLookup, LookupAddress } from 'dns';
import { isIP } from 'net';

/** True for loopback, private, link-local, CGNAT, multicast, reserved and metadata addresses. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === '::' || s === '::1') return true;
    if (s.startsWith('::ffff:')) return isPrivateAddress(s.slice(7));
    return (
      /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s) || s.startsWith('64:ff9b:') || s.startsWith('2001:db8')
    );
  }
  return true; // not an IP → treat as unsafe
}

export class SsrfError extends Error {}

/**
 * Validates an outbound URL against the provider's admin-approved host allowlist.
 * Customers can never influence scheme, host or port — only encoded path/query values.
 */
export function assertAllowedUrl(url: URL, allowedHosts: string[], allowPrivate: boolean) {
  if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:'))
    throw new SsrfError(`Protocol ${url.protocol} not allowed`);
  if (url.username || url.password) throw new SsrfError('Credentials in URL are not allowed');
  const host = url.hostname.toLowerCase();
  if (!allowedHosts.map((h) => h.toLowerCase()).includes(host))
    throw new SsrfError(`Host ${host} is not on the provider allowlist`);
  if (isIP(host) && isPrivateAddress(host) && !allowPrivate)
    throw new SsrfError('Private address not allowed');
}

/** DNS lookup used at connect time (prevents DNS-rebinding to internal addresses). */
export function guardedLookup(allowPrivate: boolean) {
  return (
    hostname: string,
    options: object,
    cb: (
      err: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return cb(err, '', 0);
      const list = addresses as LookupAddress[];
      const bad = list.find((a) => isPrivateAddress(a.address));
      if (bad && !allowPrivate)
        return cb(
          Object.assign(new Error(`Blocked private address for ${hostname}`), { code: 'ESSRF' }),
          '',
          0,
        );
      if ((options as { all?: boolean }).all) return cb(null, list);
      return cb(null, list[0]!.address, list[0]!.family);
    });
  };
}
