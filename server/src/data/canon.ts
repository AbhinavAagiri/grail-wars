/**
 * The hand-curated class canon.
 *
 * The scraped rosters are useful but noisy: a scrape filed Kirito as a Shielder
 * and Rin Tohsaka as an Avenger, and a character missing from a class's roster
 * was refused that class even when it is the obvious one (Hiccup, Rider).
 * `class-canon.json` is the correction layer — a short list of characters
 * whose class is not in dispute, written as data so the rosters and the wiki
 * fallbacks stay untouched.
 *
 * Canon is authoritative, in both directions: a listed character drafts as the
 * listed classes, and is dropped from every other class in the AI-Chooses
 * rosters. Lookups are name-based and tolerate the names wikis use — the
 * parenthetical some pages carry ("Kirito (Post-Aincrad)") and the long
 * forms listed as aliases ("Hiccup Horrendous Haddock III").
 */
import type { ServantClass } from '@hgd/shared';
import { normalize } from '../util/text';
import canonRaw from './class-canon.json';

export interface CanonEntry {
  name: string;
  classes: ServantClass[];
  source: string;
  /** which AI-Chooses roster this character belongs to */
  bucket: 'anime' | 'history';
}

interface CanonFile {
  characters?: {
    name?: string;
    classes?: string[];
    source?: string;
    bucket?: string;
    aliases?: string[];
  }[];
}

const FILE = canonRaw as CanonFile;

export const CANON: CanonEntry[] = (FILE.characters ?? [])
  .map((entry) => ({
    name: String(entry.name ?? '').trim(),
    classes: (entry.classes ?? []) as ServantClass[],
    source: String(entry.source ?? '').trim(),
    bucket: entry.bucket === 'history' ? ('history' as const) : ('anime' as const),
  }))
  .filter((entry) => entry.name && entry.classes.length);

/**
 * normalized name → entry, for every name and alias in the file. Aliases are
 * explicit on purpose: a prefix rule would file "Kirito Kamui" as Kirito.
 */
const BY_NAME = new Map<string, CanonEntry>();
for (const raw of FILE.characters ?? []) {
  const entry = CANON.find((c) => c.name === String(raw.name ?? '').trim());
  if (!entry) continue;
  for (const name of [entry.name, ...(raw.aliases ?? [])]) {
    const key = normalize(String(name));
    if (key && !BY_NAME.has(key)) BY_NAME.set(key, entry);
  }
}

/**
 * The canon entry for a character name: exact (which covers every alias in the
 * file), then without the trailing parenthetical a wiki page carries
 * ("Kirito (Post-Aincrad)").
 */
export function canonEntryFor(name: string): CanonEntry | undefined {
  const key = normalize(name);
  if (!key) return undefined;
  const exact = BY_NAME.get(key);
  if (exact) return exact;
  const bare = normalize(name.replace(/\s*\([^)]*\)\s*$/, ''));
  return bare ? BY_NAME.get(bare) : undefined;
}

/** The classes the canon allows a name, or [] when it is not listed. */
export function canonClasses(name: string): ServantClass[] {
  return canonEntryFor(name)?.classes ?? [];
}

/** Canon characters that belong in a class's AI-Chooses roster. */
export function canonEntriesFor(cls: ServantClass): CanonEntry[] {
  return CANON.filter((entry) => entry.classes.includes(cls));
}
