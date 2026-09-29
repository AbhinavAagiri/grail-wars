import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_V4 = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
] as const;

function v4ToInt(ip: string): number {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return -1;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function isPrivateIPv4(ip: string): boolean {
  const value = v4ToInt(ip);
  if (value < 0) return true;
  return BLOCKED_V4.some(([base, bits]) => {
    const baseInt = v4ToInt(base);
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (baseInt & mask);
  });
}

export function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  if (lower.startsWith('ff')) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d)
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true;
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

/**
 * Validate a user-supplied image URL. Rejects non-http(s), credentials in the
 * URL, odd ports, and any host that resolves to a private/loopback/multicast address.
 */
export async function assertSafeImageUrl(raw: string): Promise<URL> {
  if (!raw || raw.length > 2000) throw new UnsafeUrlError('URL missing or too long');

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('Not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http(s) URLs are allowed');
  }
  if (url.username || url.password) throw new UnsafeUrlError('Credentials are not allowed');
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new UnsafeUrlError('Only standard ports are allowed');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new UnsafeUrlError('Private addresses are blocked');
    return url;
  }
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) {
    throw new UnsafeUrlError('Local hostnames are blocked');
  }

  let records: { address: string }[];
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError('Host could not be resolved');
  }
  if (!records.length) throw new UnsafeUrlError('Host could not be resolved');
  if (records.some((r) => isPrivateAddress(r.address))) {
    throw new UnsafeUrlError('Host resolves to a private address');
  }
  return url;
}

/** Quick synchronous shape check used before the async DNS step. */
export function looksLikeHttpUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  if (raw.length > 2000) return false;
  return raw.startsWith('http://') || raw.startsWith('https://');
}
