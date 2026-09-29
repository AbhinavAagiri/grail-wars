import { Router, type Request, type Response } from 'express';
import { CLASSES, type Character, type SearchCandidate, type ServantClass } from '@hgd/shared';
import { logger } from '../logger';
import { getCachedSearch, setCachedSearch } from '../research/cache';
import { searchAniList } from '../research/providers/anilist';
import { searchWikipedia } from '../research/providers/wikipedia';
import { getVsbImages, searchVsb } from '../research/providers/vsbattles';
import { searchTmdb } from '../research/providers/tmdb';
import { canonicalKey, hashString, sanitizeText, titleSimilarity } from '../util/text';
import { generatedAvatar, proxyUrl } from '../util/imageUrl';
import { characterScore, isCharacterCandidate } from './characterFilter';
import fallbackRaw from '../data/fallback-characters.json';

const PROVIDER_TIMEOUT_MS = 4000;

interface FallbackEntry {
  name: string;
  source: string;
}
const FALLBACKS = fallbackRaw as Record<ServantClass, FallbackEntry[]>;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

function providerRank(candidate: SearchCandidate, query: string): number {
  const similarity = titleSimilarity(query, candidate.name);
  const exact = similarity >= 0.995 ? 0 : 100;
  const order: Record<string, number> = { anilist: 0, vsb: 1, wikipedia: 2, fandom: 3, tmdb: 4, custom: 5, fallback: 6 };
  return exact + (1 - similarity) * 50 + (order[candidate.provider] ?? 9);
}

/** Local fallback list so the draft still works with no network at all. */
function fallbackCandidates(query: string): SearchCandidate[] {
  const out: SearchCandidate[] = [];
  for (const cls of CLASSES) {
    for (const entry of FALLBACKS[cls] ?? []) {
      if (titleSimilarity(query, entry.name) < 0.7) continue;
      const key = canonicalKey('fallback', undefined, entry.name, entry.source);
      out.push({
        key,
        name: entry.name,
        source: entry.source,
        provider: 'fallback',
        thumb: generatedAvatar(entry.name),
      });
    }
  }
  return out;
}

export function createSearchRouter(): Router {
  const router = Router();

  router.get('/api/search', async (req: Request, res: Response) => {
    const query = sanitizeText(req.query.q, 80);
    if (query.length < 2) {
      res.json({ candidates: [] });
      return;
    }
    const cacheKey = `search:${query.toLowerCase()}`;
    const cached = getCachedSearch<SearchCandidate[]>(cacheKey);
    if (cached) {
      res.json({ candidates: cached });
      return;
    }

    const [anilist, wikipedia, vsb, tmdb] = await Promise.all([
      withTimeout(searchAniList(query), PROVIDER_TIMEOUT_MS),
      withTimeout(searchWikipedia(query), PROVIDER_TIMEOUT_MS),
      withTimeout(searchVsb(query, ''), PROVIDER_TIMEOUT_MS),
      withTimeout(searchTmdb(query), PROVIDER_TIMEOUT_MS),
    ]);

    // VS Battles search results carry no picture of their own, which left rows
    // of initials in the draft. One batched pageimages call illustrates them.
    const vsbImages = await withTimeout(
      getVsbImages((vsb ?? []).map((hit) => hit.pageId)),
      PROVIDER_TIMEOUT_MS,
    );

    const merged: SearchCandidate[] = [];

    for (const c of anilist ?? []) {
      merged.push({
        key: canonicalKey('anilist', c.providerId, c.name, c.source),
        name: c.name,
        source: c.source,
        provider: 'anilist',
        providerId: c.providerId,
        thumb: proxyUrl(c.thumb) || generatedAvatar(c.name),
        aliases: c.aliases,
      });
    }
    for (const c of vsb ?? []) {
      merged.push({
        key: canonicalKey('vsb', String(c.pageId), c.title, 'VS Battles Wiki'),
        name: c.title,
        source: 'VS Battles Wiki',
        provider: 'vsb',
        providerId: String(c.pageId),
        thumb: proxyUrl(vsbImages?.get(c.pageId)) || generatedAvatar(c.title),
        blurb: c.snippet,
      });
    }
    for (const c of wikipedia ?? []) {
      merged.push({
        key: canonicalKey('wikipedia', c.providerId, c.name, 'Wikipedia'),
        name: c.name,
        source: 'Wikipedia',
        provider: 'wikipedia',
        providerId: c.providerId,
        thumb: proxyUrl(c.thumb) || generatedAvatar(c.name),
        blurb: c.blurb,
      });
    }
    for (const c of tmdb ?? []) {
      merged.push({
        key: canonicalKey('tmdb', c.providerId, c.name, c.source),
        name: c.name,
        source: c.source,
        provider: 'tmdb',
        providerId: c.providerId,
        thumb: proxyUrl(c.thumb) || generatedAvatar(c.name),
      });
    }

    // Only people and characters belong in a Grail War.
    const characters = merged.filter((candidate) => isCharacterCandidate(candidate, query));

    // Deduplicate by canonical key, then by normalised name.
    const byKey = new Map<string, SearchCandidate>();
    const byName = new Map<string, SearchCandidate>();
    for (const candidate of characters) {
      const nameKey = candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (byKey.has(candidate.key)) continue;
      if (byName.has(nameKey)) continue;
      byKey.set(candidate.key, candidate);
      byName.set(nameKey, candidate);
    }

    let results = [...byKey.values()];
    if (!results.length) results = fallbackCandidates(query);
    results.sort((a, b) => {
      const diff = characterScore(b, query) - characterScore(a, query);
      return diff !== 0 ? diff : providerRank(a, query) - providerRank(b, query);
    });

    const trimmed = results.slice(0, 10);
    if (!trimmed.length) {
      // Still offer the literal search term so the player can commit to it.
      const key = canonicalKey('custom', undefined, query, 'Custom');
      trimmed.push({
        key,
        name: query,
        source: 'Custom',
        provider: 'custom',
        thumb: generatedAvatar(query),
      });
    }

    setCachedSearch(cacheKey, trimmed);
    logger.debug({ query, count: trimmed.length }, 'search served');
    res.json({ candidates: trimmed });
  });

  return router;
}

/** Build a Character from a search candidate (used when a player picks). */
export function candidateToCharacter(
  candidate: SearchCandidate,
  submittedBy: string,
  imageUrl?: string,
): Character {
  const name = sanitizeText(candidate.name, 80);
  const source = sanitizeText(candidate.source, 80) || 'Unknown';
  return {
    key: candidate.key || canonicalKey(candidate.provider, candidate.providerId, name, source),
    name,
    source,
    provider: candidate.provider,
    providerId: candidate.providerId,
    imageUrl: imageUrl || candidate.thumb || generatedAvatar(name),
    submittedBy,
  };
}

export function customCharacter(name: string, submittedBy: string): Character {
  const clean = sanitizeText(name, 80);
  return {
    key: canonicalKey('custom', String(hashString(clean.toLowerCase())), clean, 'Custom'),
    name: clean,
    source: 'Custom',
    provider: 'custom',
    imageUrl: generatedAvatar(clean),
    submittedBy,
    custom: true,
  };
}
