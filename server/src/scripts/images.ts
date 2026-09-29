/**
 * Picture-coverage audit.
 *
 * Every Servant should show real artwork, whatever medium they come from. This
 * walks the offline fallback roster (the characters a room summons when nobody
 * picks or the network is out) through the same image waterfall the game uses
 * and reports which ones could only produce our generated initials avatar.
 *
 *   npm run images                        # the whole fallback roster
 *   npm run images -- --class saber       # one class
 *   npm run images -- --limit 20          # first 20 entries
 *   npm run images -- --concurrency 8     # more parallel lookups
 *   npm run images -- --verbose           # list every candidate per character
 *
 * Exits non-zero when any character has no real picture, so it can gate a
 * release the same way the smoke test does.
 */
import { CLASSES, type Character, type ServantClass } from '@hgd/shared';
import { buildImageCandidates } from '../research';
import { generatedAvatar } from '../util/imageUrl';
import fallbackRaw from '../data/fallback-characters.json';

interface FallbackEntry {
  name: string;
  source: string;
}

const FALLBACKS = fallbackRaw as Record<ServantClass, FallbackEntry[]>;

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : 'true';
}

/** Human-readable origin of a (possibly proxied) image URL. */
export function describeImage(url: string): string {
  if (!url) return 'none';
  if (url.startsWith('data:image/svg+xml')) return 'placeholder';
  if (url.startsWith('/media/')) return 'upload';
  let raw = url;
  const proxied = /[?&]url=([^&]+)/.exec(url);
  if (proxied) {
    try {
      raw = decodeURIComponent(proxied[1]!);
    } catch {
      return 'proxy';
    }
  }
  let host = '';
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
  if (host.endsWith('anilist.co')) return 'anilist';
  if (host.includes('vsbattles')) return 'vsbattles';
  if (host.endsWith('fandom.com') || host.endsWith('wikia.nocookie.net')) return 'fandom';
  if (host.includes('wikipedia') || host.includes('wikimedia')) return 'wikipedia';
  if (host.includes('tmdb') || host.includes('themoviedb')) return 'tmdb';
  return host;
}

function character(cls: ServantClass, entry: FallbackEntry): Character {
  return {
    key: `fallback:${cls}:${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: entry.name,
    source: entry.source,
    provider: 'fallback',
    imageUrl: generatedAvatar(entry.name),
    submittedBy: 'audit',
  };
}

async function pool<T, R>(items: T[], size: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      out[index] = await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
  return out;
}

async function main(): Promise<void> {
  const verbose = process.argv.includes('--verbose');
  const requested = flag('class');
  const limit = Number.parseInt(flag('limit') ?? '', 10);
  const concurrency = Number.parseInt(flag('concurrency') ?? '6', 10) || 6;

  const classes = (requested ? CLASSES.filter((c) => c === requested) : CLASSES) as ServantClass[];
  if (!classes.length) {
    process.stderr.write(`Unknown class "${requested}". Known: ${CLASSES.join(', ')}\n`);
    process.exitCode = 1;
    return;
  }

  const targets = classes.flatMap((cls) =>
    (FALLBACKS[cls] ?? []).map((entry) => ({ cls, entry })),
  );
  const chosen = Number.isFinite(limit) && limit > 0 ? targets.slice(0, limit) : targets;

  process.stdout.write(`Auditing portraits for ${chosen.length} character(s)…\n\n`);

  const started = Date.now();
  let bare = 0;
  const misses: string[] = [];

  await pool(chosen, concurrency, async ({ cls, entry }) => {
    const images = await buildImageCandidates(character(cls, entry));
    const real = images.filter((url) => describeImage(url) !== 'placeholder');
    const primary = describeImage(images[0] ?? '');
    const label = `${entry.name} (${cls})`;
    if (!real.length) {
      bare += 1;
      misses.push(label);
      process.stdout.write(`✗ ${label.padEnd(46)} no picture — ${entry.source}\n`);
    } else {
      process.stdout.write(`✓ ${label.padEnd(46)} ${primary.padEnd(10)} (${real.length} source(s))\n`);
    }
    if (verbose) {
      for (const [i, url] of images.entries()) {
        process.stdout.write(`    [${i}] ${describeImage(url).padEnd(12)} ${url.slice(0, 100)}\n`);
      }
    }
  });

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const covered = chosen.length - bare;
  process.stdout.write(
    `\n${covered}/${chosen.length} characters have real artwork (${seconds}s, concurrency ${concurrency}).\n`,
  );
  if (bare) {
    process.stdout.write(`No picture: ${misses.join(', ')}\n`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`image audit failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
