/**
 * AI-Chooses draft pools.
 *
 * When the host turns the setting on, the game deals 25 characters per class
 * from the committed rosters instead of letting players search freely: anime
 * and manga characters only, historical and legendary figures only, or a mix of
 * the two. The pool is shared by the whole room, sampled per draft so rematches
 * feel different.
 *
 * The hand-curated canon (server/src/data/class-canon.json) rides along: it is
 * always dealt into the classes it names, and it removes a character from the
 * classes the scrapes mis-filed them in, so a Saber-class pick like Kirito
 * cannot be seated as a Shielder just because a wiki category said so.
 */
import { CLASSES, type AiPool, type Character, type ServantClass } from '@hgd/shared';
import { canonEntriesFor, canonEntryFor } from '../data/canon';
import { canonicalKey } from '../util/text';
import rosterAnime from '../data/roster-anime.json';
import rosterHistory from '../data/roster-history.json';
import fallbackCharacters from '../data/fallback-characters.json';

export const POOL_SIZE = 25;

interface RosterEntry {
  name: string;
  source?: string;
}

type RosterFile = Record<string, RosterEntry[]>;

const ROSTERS: Record<'anime' | 'history', RosterFile> = {
  anime: rosterAnime as RosterFile,
  history: rosterHistory as RosterFile,
};

const FALLBACKS = fallbackCharacters as RosterFile;

/**
 * How deep into a roster we sample from. The lists are sorted most-substantial
 * first, so sampling the head keeps drafts full of characters players recognise
 * while still being random.
 */
const SAMPLING_WINDOW = 80;

export function rosterEntryToCharacter(entry: RosterEntry, fallbackSource: string): Character {
  const name = entry.name.trim();
  const source = (entry.source ?? '').trim() || fallbackSource;
  return {
    key: canonicalKey('roster', undefined, name, source),
    name,
    source,
    provider: 'roster',
    // The client renders its own initials avatar for an empty src; filling the
    // pool with ~2 KB data URIs would bloat every room snapshot instead.
    imageUrl: '',
    submittedBy: 'system',
  };
}

/** Alternate two lists, so mixed pools draw from both rosters evenly. */
function interleave<T>(a: readonly T[], b: readonly T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i]!);
    if (i < b.length) out.push(b[i]!);
  }
  return out;
}

function shuffle<T>(list: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** Every character eligible for a class in one roster bucket. */
function candidatesFor(bucket: 'anime' | 'history', cls: ServantClass): RosterEntry[] {
  return ROSTERS[bucket][cls] ?? [];
}

/** The last-resort list: the class list the game has always shipped. */
function fallbackFor(cls: ServantClass): RosterEntry[] {
  return FALLBACKS[cls] ?? [];
}

/**
 * Whether the canon lets this name into this class. Characters the canon does
 * not mention pass; characters it does mention are held to it exactly.
 */
function canonAllows(name: string, cls: ServantClass): boolean {
  const canon = canonEntryFor(name);
  return !canon || canon.classes.includes(cls);
}

function dedupe(entries: RosterEntry[], fallbackSource: string): Character[] {
  const byKey = new Map<string, Character>();
  for (const entry of entries) {
    const character = rosterEntryToCharacter(entry, fallbackSource);
    if (!character.name || byKey.has(character.key)) continue;
    byKey.set(character.key, character);
  }
  return [...byKey.values()];
}

/**
 * Deal the room's pool: `POOL_SIZE` characters per enabled class from whichever
 * rosters the host chose. Mixed samples from both buckets; a class that a
 * bucket cannot fill is topped up from the other roster, then from the built-in
 * fallback list, so a draft always has characters to choose from.
 */
export function buildDraftPools(
  classes: readonly ServantClass[],
  pool: AiPool,
  rng: () => number = Math.random,
): Partial<Record<ServantClass, Character[]>> {
  const out: Partial<Record<ServantClass, Character[]>> = {};
  const order = classes.length ? CLASSES.filter((cls) => classes.includes(cls)) : [...CLASSES];

  for (const cls of order) {
    const label = pool === 'history' ? 'History' : 'Anime / Manga';
    const anime =
      pool === 'history'
        ? []
        : candidatesFor('anime', cls)
            .filter((entry) => canonAllows(entry.name, cls))
            .slice(0, SAMPLING_WINDOW);
    const history =
      pool === 'anime'
        ? []
        : candidatesFor('history', cls)
            .filter((entry) => canonAllows(entry.name, cls))
            .slice(0, SAMPLING_WINDOW);
    // "Mixed" alternates the two rosters so the sample is genuinely mixed
    // instead of eating through the anime list first.
    const primary = pool === 'mixed' ? interleave(anime, history) : [...anime, ...history];

    // The canon leads the class: a famous character the scrape missed (Kirito
    // was not in Sword Users' first pages) is still always draftable in the
    // class their legend is built on.
    const lead = canonEntriesFor(cls)
      .filter((entry) => pool === 'mixed' || entry.bucket === pool)
      .map((entry) => rosterEntryToCharacter({ name: entry.name, source: entry.source }, label));

    const sampled = shuffle(primary, rng);
    const chosen = dedupe([...lead, ...sampled], label).slice(0, POOL_SIZE);

    if (chosen.length < POOL_SIZE) {
      // Top up from the same bucket first (a pool that is short still keeps its
      // promise), then from the built-in fallback list as a last resort.
      const spare = shuffle(
        pool === 'mixed'
          ? [...candidatesFor('anime', cls), ...candidatesFor('history', cls)]
          : pool === 'anime'
            ? candidatesFor('anime', cls)
            : candidatesFor('history', cls),
        rng,
      );
      const seen = new Set(chosen.map((character) => character.key));
      for (const entry of [...spare, ...fallbackFor(cls)]) {
        if (chosen.length >= POOL_SIZE) break;
        if (!canonAllows(entry.name, cls)) continue;
        const character = rosterEntryToCharacter(entry, label);
        if (!character.name || seen.has(character.key)) continue;
        seen.add(character.key);
        chosen.push(character);
      }
    }

    out[cls] = chosen;
  }
  return out;
}
