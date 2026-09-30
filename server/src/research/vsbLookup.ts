/**
 * VS Battles page discovery.
 *
 * The wiki does not file characters under the name a player typed: Fate's
 * "Saber" lives at "Artoria Pendragon (Saber)", and that parenthetical actively
 * *hurts* title similarity, so the old title-only ranking rejected every page
 * the search returned and the character fell through to an unrelated Wikipedia
 * article (giving Saber a 10-C "human baseline"). Discovery now searches every
 * name the character is known by — including the AniList canonical name and
 * aliases — and then scores the *pages themselves*: a page whose Origin or
 * categories name the character's franchise and that carries a parseable tier is
 * the character, whatever its title says.
 */
import { normalize, titleSimilarity } from '../util/text';
import { getCachedSearch, setCachedSearch } from './cache';
import { parseTier, TIER_MAX_INDEX } from './tiers';
import { fetchVsbPage, searchVsb, type VsBPage, type VsBSearchResult } from './providers/vsbattles';
import { bareName } from './providers/anilist';

/** Non-title evidence about a character: canonical names and known works. */
export interface NameHints {
  names: string[];
  titles: string[];
}

/* ------------------------------------------------------------------ */
/* Name matching                                                       */
/* ------------------------------------------------------------------ */

/** Drop a trailing disambiguator: "Kirito (Post-Aincrad)" → "Kirito". */
export function withoutQualifier(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name;
}

/** Meaningful words in a name, ignoring particles and single letters. */
export function nameTokens(name: string): string[] {
  return withoutQualifier(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

/**
 * True when two names are the same name written the other way round or with a
 * different romanisation — "Son Goku" and "Gokuu Son" are one character, while
 * "Son Goku" and "Son Goten" are not.
 */
export function namesAreReordered(a: string, b: string): boolean {
  const left = nameTokens(a);
  const pool = nameTokens(b);
  if (!left.length || left.length !== pool.length) return false;
  return left.every((token) => {
    const index = pool.findIndex((other) => other === token || other.startsWith(token) || token.startsWith(other));
    if (index < 0) return false;
    pool.splice(index, 1);
    return true;
  });
}

/**
 * How well two names line up: 2 when they are the same name, 1 when they are the
 * same name written the other way round or in another romanisation, 0 when they
 * are simply different people. Similarity scoring is deliberately avoided here:
 * it happily rates "Kirito" and "Kirito Kamui" as one character.
 */
export function nameMatchScore(a: string, b: string): number {
  const left = normalize(withoutQualifier(a));
  const right = normalize(withoutQualifier(b));
  if (!left || !right) return 0;
  if (left === right) return 2;
  return namesAreReordered(a, b) ? 1 : 0;
}

/** Drop a wiki disambiguator: "Goku (Toei)" → "Goku". */
export function stripQualifier(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * True when a title's parenthetical names an era, arc or release rather than a
 * different continuity. "(Part II: War Arc)" and "(New Era)" are later forms
 * of the same character; "(Fate)" and "(BBC)" are somebody else's version.
 */
export const VERSION_QUALIFIER_RE =
  /\b(?:part|arc|saga|era|chapter|season|episode|movie|film|anime|manga|novel|game|original|canon|classic|current|base|pre|post|new|young|old|prime|full|final|resurrected|eos|timeskip|awakened)\b|\b[IVX]{2,}\b/i;

export function isVersionQualifier(title: string): boolean {
  const match = /\(([^)]*)\)/.exec(title);
  if (!match) return true; // no qualifier at all: the character page itself
  return VERSION_QUALIFIER_RE.test(match[1] ?? '');
}

/**
 * Penalise a disambiguator the caller did not ask for, so a request for
 * "Sherlock Holmes" prefers the plain page over "Sherlock Holmes (Fate)".
 */
export function qualifierPenalty(title: string, source: string): number {
  const match = /\(([^)]+)\)/.exec(title);
  if (!match) return 0;
  const qualifier = normalize(match[1] ?? '');
  if (!qualifier) return 0;
  const asked = normalize(source);
  if (asked && (asked.includes(qualifier) || qualifier.includes(asked))) return 0;
  // "(Original)"/"(Canon)" is usually the primary version of the character.
  if (/\b(?:original|canon|main)\b/.test(qualifier)) return 0.05;
  // Version markers ("(Saber)", "(War Arc)") are not another franchise, so the
  // penalty stays soft — Fate files Artoria under her Servant class.
  if (VERSION_QUALIFIER_RE.test(qualifier)) return 0.04;
  return 0.12;
}

/* ------------------------------------------------------------------ */
/* Search + fetch caches                                               */
/* ------------------------------------------------------------------ */

/** A busy draft asks the same question many times; 10 minutes is plenty. */
async function searchVsbCached(name: string, source: string): Promise<VsBSearchResult[]> {
  const key = `vsb-search:${normalize(name)}|${normalize(source)}`;
  const cached = getCachedSearch<VsBSearchResult[]>(key);
  if (cached) return cached;
  const hits = await searchVsb(name, source).catch(() => [] as VsBSearchResult[]);
  if (hits.length) setCachedSearch(key, hits);
  return hits;
}

export async function fetchVsbPageCached(title: string): Promise<VsBPage | null> {
  const key = `vsb-page:${normalize(title)}`;
  const cached = getCachedSearch<VsBPage>(key);
  if (cached) return cached;
  const page = await fetchVsbPage(title).catch(() => null);
  if (page && !page.empty) setCachedSearch(key, page);
  return page;
}

/* ------------------------------------------------------------------ */
/* Candidate ranking                                                   */
/* ------------------------------------------------------------------ */

/** How many search terms to try before giving up on the wiki. */
const MAX_VSB_QUERIES = 4;
/** How many candidate pages to read before choosing one. */
const MAX_VSB_CANDIDATES = 4;

function sourceAddsInfo(name: string, source: string): boolean {
  const lowerName = name.toLowerCase();
  const lowerSource = source.toLowerCase();
  return Boolean(source) && !lowerName.includes(lowerSource) && !lowerSource.includes(lowerName);
}

/** Every search term worth trying for a character. */
export function vsbQueries(character: { name: string; source: string }, hints: NameHints | null): string[] {
  const queries: string[] = [];
  const push = (value: string) => {
    const term = value.trim();
    if (term.length < 3) return;
    const key = normalize(term);
    if (!key || queries.some((existing) => normalize(existing) === key)) return;
    queries.push(term);
  };

  const addsInfo = sourceAddsInfo(character.name, character.source);
  push(character.name);
  if (addsInfo) push(`${character.name} ${character.source}`);
  for (const name of hints?.names ?? []) {
    if (!/[A-Za-z]{3,}/.test(name)) continue; // native-script names never match wiki titles
    push(name);
    if (addsInfo) push(`${name} ${character.source}`);
  }
  return queries.slice(0, MAX_VSB_QUERIES);
}

export interface VsBCandidate {
  title: string;
  pageId: number;
  snippet: string;
  score: number;
}

/**
 * Rank merged search hits. A hit scores on how closely its title matches any
 * known name (including AniList names) and on whether its snippet names the
 * source; the page read that follows decides the rest.
 */
export function rankVsbCandidates(
  character: { name: string; source: string },
  hints: NameHints | null,
  hits: { hit: VsBSearchResult; position: number }[],
): VsBCandidate[] {
  const targets = [character.name, ...(hints?.names ?? [])].filter(Boolean);
  const source = normalize(character.source);
  const addsInfo = sourceAddsInfo(character.name, character.source);

  const ranked: VsBCandidate[] = [];
  const seen = new Set<number>();
  for (const { hit, position } of hits) {
    if (seen.has(hit.pageId)) continue;
    seen.add(hit.pageId);

    const similarity = Math.max(0, ...targets.map((target) => titleSimilarity(target, hit.title)));
    const exactBase = targets.some(
      (target) => normalize(stripQualifier(hit.title)) === normalize(withoutQualifier(target)),
    );
    const sourceMentioned = addsInfo && source.length >= 4 && normalize(`${hit.title} ${hit.snippet}`).includes(source);

    ranked.push({
      title: hit.title,
      pageId: hit.pageId,
      snippet: hit.snippet,
      score:
        similarity +
        (exactBase ? 0.12 : 0) +
        (sourceMentioned ? 0.15 : 0) -
        // A hit whose bare title is a known name is a version of the character,
        // so its parenthetical must not count against it.
        (exactBase ? 0 : qualifierPenalty(hit.title, character.source)) -
        Math.min(0.2, position * 0.005),
    });
  }
  ranked.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return ranked.slice(0, MAX_VSB_CANDIDATES);
}

/* ------------------------------------------------------------------ */
/* Page scoring + resolution                                           */
/* ------------------------------------------------------------------ */

export interface ScoredVsbPage {
  page: VsBPage;
  score: number;
}

/**
 * How likely a fetched page is *this* character: a parseable tier is worth most,
 * then the page's Origin/classification/categories naming the character's
 * franchise or one of their works, then the title lining up with a known name.
 */
export function scoreVsbPage(
  character: { name: string; source: string },
  hints: NameHints | null,
  page: VsBPage,
): number {
  const f = page.fields;
  const tier = parseTier([f.Tier, f['Attack Potency']].filter(Boolean).join(' '));
  const hasTier = tier.tierPeak !== 'Unknown';

  const nameScore = Math.max(
    0,
    ...[character.name, ...(hints?.names ?? [])].map((name) => nameMatchScore(name, page.title)),
  );

  const haystack = normalize(
    [page.title, f.Origin, f.Classification, ...page.categories].filter(Boolean).join(' '),
  );
  const source = normalize(character.source);
  const sourceMatch =
    (source.length >= 4 && haystack.includes(source)) ||
    (hints?.titles ?? []).some((title) => {
      const work = normalize(bareName(title));
      return work.length >= 5 && haystack.includes(work);
    });

  const fieldsFound = [
    f.Tier,
    f['Attack Potency'],
    f.Speed,
    f.Durability,
    f['Powers and Abilities'],
    f.Classification,
  ].filter(Boolean).length;

  // Fate files a Servant under their class: "Saber" lives at "Artoria Pendragon
  // (Saber)". When the parenthetical itself is one of the names the character is
  // known by, this is their page and not another version of them.
  const qualifier = /^[^(]+\(([^)]+)\)/.exec(page.title)?.[1] ?? '';
  const qualifierMatch = Boolean(
    qualifier &&
      [character.name, ...(hints?.names ?? [])].some((name) => nameMatchScore(name, qualifier) > 0),
  );

  return (
    (hasTier ? 1 : 0) +
    (sourceMatch ? 0.5 : 0) +
    nameScore * 0.35 +
    (qualifierMatch ? 0.2 : 0) +
    Math.min(0.24, fieldsFound * 0.04) +
    (tier.tierIndex / TIER_MAX_INDEX) * 0.08
  );
}

/**
 * Find the character's VS Battles page. Searches every known name, reads the top
 * candidates, then keeps the strongest of the same character's version pages so
 * the profile scales on the peak version of that character.
 */
export async function resolveVsbPage(
  character: { name: string; source: string },
  hints: NameHints | null,
): Promise<ScoredVsbPage | null> {
  const queries = vsbQueries(character, hints);
  if (!queries.length) return null;

  const merged: { hit: VsBSearchResult; position: number }[] = [];
  const seen = new Set<number>();
  const results = await Promise.all(queries.map((query) => searchVsbCached(query, character.source)));
  results.forEach((hits, queryIndex) => {
    hits.forEach((hit, hitIndex) => {
      if (seen.has(hit.pageId)) return;
      seen.add(hit.pageId);
      merged.push({ hit, position: queryIndex * 5 + hitIndex });
    });
  });

  const ranked = rankVsbCandidates(character, hints, merged);
  if (!ranked.length) return null;

  const fetched = (await Promise.all(ranked.map((candidate) => fetchVsbPageCached(candidate.title)))).filter(
    (page): page is VsBPage => Boolean(page && !page.empty),
  );
  if (!fetched.length) return null;

  const scored: ScoredVsbPage[] = fetched
    .map((page) => ({ page, score: scoreVsbPage(character, hints, page) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0]!;
  // A page that carries no stats, no mention of the franchise and no name
  // match is somebody else entirely; better to report no page than to scale on
  // a stranger's profile.
  if (!best.page.fields.Tier && !best.page.fields['Attack Potency'] && best.score < 1.2) return null;

  // Long-running characters are split across arc pages ("Naruto Uzumaki (Part
  // II: War Arc)"); when several fetched pages are plainly the same character,
  // keep the strongest version. Only era/version qualifiers group together —
  // "Sherlock Holmes (Fate)" is a different character.
  const base = normalize(stripQualifier(best.page.title));
  const siblings = scored.filter(
    (entry) =>
      !entry.page.empty &&
      normalize(stripQualifier(entry.page.title)) === base &&
      (entry.page.title === best.page.title || isVersionQualifier(entry.page.title)),
  );
  if (siblings.length > 1) {
    const tierOf = (entry: ScoredVsbPage) => {
      const f = entry.page.fields;
      return parseTier([f.Tier, f['Attack Potency']].filter(Boolean).join(' ')).tierIndex;
    };
    return siblings.reduce((strongest, entry) => (tierOf(entry) > tierOf(strongest) ? entry : strongest), best);
  }
  return best;
}
