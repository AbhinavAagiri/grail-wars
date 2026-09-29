import { userAgent } from '../config';
import { logger } from '../logger';

const HOST_MIN_INTERVAL_MS = 500; // <= 2 requests/second per host

/**
 * Hosts with a published quota get their own, slower interval. AniList allows
 * 90 requests a minute, so a room full of anime characters would otherwise be
 * throttled into blank portraits.
 */
const HOST_INTERVALS: Record<string, number> = {
  'graphql.anilist.co': 900,
};

const DEFAULT_TIMEOUT_MS = 8000;

type QueueEntry = { at: number };
const hostQueues = new Map<string, Promise<void>>();
const hostLast = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Serialize requests per host so we never hammer a public API. */
async function politeGate(host: string): Promise<void> {
  const previous = hostQueues.get(host) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  hostQueues.set(
    host,
    previous.then(() => gate),
  );
  await previous;
  const last = hostLast.get(host) ?? 0;
  const wait = (HOST_INTERVALS[host] ?? HOST_MIN_INTERVAL_MS) - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  hostLast.set(host, Date.now());
  release();
}

export interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** retry once on 429/5xx */
  retry?: boolean;
  maxBytes?: number;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * GET text/JSON from an external service with timeouts, size caps, no cookies,
 * an identifiable User-Agent and one retry on 429/5xx.
 */
export async function politeFetch(url: string, opts: FetchOptions = {}): Promise<string> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retry = true, maxBytes = 4 * 1024 * 1024 } = opts;
  const host = new URL(url).host;
  const attempt = async (): Promise<string> => {
    await politeGate(host);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'user-agent': userAgent(),
          accept: '*/*',
          'accept-language': 'en',
          ...(opts.headers ?? {}),
        },
      });
      if (!res.ok) throw new HttpError(`HTTP ${res.status} for ${host}`, res.status);
      const reader = res.body?.getReader();
      if (!reader) return await res.text();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > maxBytes) {
            await reader.cancel().catch(() => undefined);
            throw new HttpError('Response too large');
          }
          chunks.push(value);
        }
      }
      return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await attempt();
  } catch (err) {
    const status = err instanceof HttpError ? err.status : undefined;
    const retryable = status === 429 || (status !== undefined && status >= 500);
    if (retry && retryable) {
      logger.debug({ url: host, status }, 'retrying external request');
      await sleep(1500);
      return attempt();
    }
    throw err;
  }
}

export async function politeJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  const text = await politeFetch(url, opts);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError('Invalid JSON response');
  }
}

export async function politePostJson<T = unknown>(
  url: string,
  body: unknown,
  opts: FetchOptions = {},
): Promise<T> {
  // Dedicated POST path (politeFetch only performs GET).
  const host = new URL(url).host;
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retry = true } = opts;
  const attempt = async (): Promise<T> => {
    await politeGate(host);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'user-agent': userAgent(),
          'content-type': 'application/json',
          ...(opts.headers ?? {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new HttpError(`HTTP ${res.status} for ${host}`, res.status);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  };

  let lastError: unknown;
  for (let tries = 0; tries < 3; tries++) {
    try {
      return await attempt();
    } catch (err) {
      const status = err instanceof HttpError ? err.status : undefined;
      // A rate-limited lookup is worth waiting out: the alternative is a
      // Servant with an initials avatar instead of their artwork.
      const retryable = status === 429 || (status !== undefined && status >= 500);
      if (!retry || !retryable) throw err;
      lastError = err;
      logger.debug({ host, status, tries }, 'retrying external POST');
      await sleep(status === 429 ? 2500 : 1500);
    }
  }
  throw lastError;
}

export { sleep };
