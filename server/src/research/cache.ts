import fs from 'node:fs';
import path from 'node:path';
import { LRUCache } from 'lru-cache';
import type { Profile } from '@hgd/shared';
import { logger } from '../logger';

const CACHE_DIR = path.resolve(process.cwd(), '.cache');
/**
 * Bump when the research pipeline changes meaningfully: old entries (e.g. every
 * 10-C profile written before the source waterfall was fixed) must not survive.
 */
const CACHE_VERSION = 2;
const CACHE_FILE = path.join(CACHE_DIR, `research-v${CACHE_VERSION}.json`);
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const memory = new LRUCache<string, Profile>({ max: 500, ttl: TTL_MS });
let dirty = false;
let flushTimer: NodeJS.Timeout | null = null;

function loadFromDisk(): void {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, Profile>;
    for (const [key, value] of Object.entries(parsed)) memory.set(key, value);
    logger.info({ count: memory.size }, 'loaded research cache from disk');
  } catch (err) {
    logger.warn({ err }, 'could not load research cache');
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      const entries: Record<string, Profile> = {};
      for (const [key, value] of memory.entries()) entries[key] = value;
      fs.writeFileSync(CACHE_FILE, JSON.stringify(entries, null, 2), 'utf8');
      dirty = false;
    } catch (err) {
      logger.warn({ err }, 'could not persist research cache');
    }
  }, 2000);
  flushTimer.unref?.();
}

loadFromDisk();

export function getCachedProfile(key: string): Profile | undefined {
  return memory.get(key);
}

export function setCachedProfile(key: string, profile: Profile): void {
  memory.set(key, profile);
  dirty = true;
  scheduleFlush();
}

export function cacheStats(): { size: number; dirty: boolean } {
  return { size: memory.size, dirty };
}

export function clearCache(): void {
  memory.clear();
  dirty = true;
  scheduleFlush();
}

/** Cache search results per query for 10 minutes (Section 14.1). */
const searchCache = new LRUCache<string, object>({ max: 300, ttl: 10 * 60 * 1000 });

export function getCachedSearch<T>(key: string): T | undefined {
  return searchCache.get(key) as T | undefined;
}

export function setCachedSearch(key: string, value: object): void {
  searchCache.set(key, value);
}
