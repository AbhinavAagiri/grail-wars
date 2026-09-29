import type { Character, PersonalityTag, Profile } from '@hgd/shared';
import { z } from 'zod';
import { logger } from '../logger';
import { generateJson, llmEnabled } from '../llm';
import { baseScore } from '../sim/score';
import { generatedAvatar, isPlaceholderImage, proxyUrl } from '../util/imageUrl';
import { normalize } from '../util/text';
import overridesRaw from './overrides.json';
import { getCachedProfile, getCachedSearch, setCachedProfile, setCachedSearch } from './cache';
import {
  deriveAlignment,
  deriveArchetype,
  deriveKeyAbilityName,
  deriveTags,
  extractAbilities,
  fallbackTier,
  scalesFromTier,
  topAbilityNames,
} from './heuristics';
import { parseVsbPage, type VsBStats } from './parseVsb';
import {
  LEVEL_MAX_INDEX,
  RANGE_MAX_INDEX,
  SPEED_MAX_INDEX,
  TIERS,
  TIER_MAX_INDEX,
  durabilityFromTierIndex,
  norm,
  parseDurability,
  parseIntelligence,
  parseRange,
  parseSpeed,
  parseTier,
  tierLabelFromIndex,
} from './tiers';
import { fetchVsbPage, getVsbImage, searchVsb } from './providers/vsbattles';
import { bareName, searchAniList, type AniListCandidate } from './providers/anilist';
import { searchFandom, resolveWikiSubdomain } from './providers/fandom';
import { getTmdbImage } from './providers/tmdb';
import { searchImages } from './providers/imageSearch';
import { getWikipediaImage, getWikipediaSummary } from './providers/wikipedia';
import { titleSimilarity } from '../util/text';

/* ------------------------------------------------------------------ */
/* Overrides                                                           */
/* ------------------------------------------------------------------ */

interface OverrideEntry {
  tierPeak?: string;
  speed?: string;
  durability?: string;
  range?: string;
  intelligence?: string;
  abilities?: string[];
  tags?: PersonalityTag[];
  alignment?: 'good' | 'neutral' | 'evil';
  archetype?: string;
  keyAbilityName?: string;
  weaknesses?: string[];
  confidence?: 'high' | 'medium' | 'low';
}

const OVERRIDES = overridesRaw as Record<string, OverrideEntry>;

export function overrideFor(character: Character): OverrideEntry | undefined {
  const key = normalize(`${character.name}|${character.source}`);
  return OVERRIDES[key];
}

function applyOverride(profile: Profile, override: OverrideEntry): Profile {
  const next: Profile = { ...profile };
  if (override.tierPeak) {
    const parsed = parseTier(override.tierPeak);
    next.tierPeak = parsed.tierPeak;
    next.tierBase = parsed.tierBase;
    next.tierIndex = parsed.tierIndex;
  }
  if (override.speed) {
    const speed = parseSpeed(override.speed);
    if (speed) {
      next.speed = speed.label;
      next.speedIndex = speed.index;
    }
  }
  if (override.durability) {
    const dur = parseDurability(override.durability);
    if (dur) {
      next.durability = dur.label;
      next.durabilityIndex = dur.index;
    }
  }
  if (override.range) {
    const range = parseRange(override.range);
    if (range) {
      next.range = range.label;
      next.rangeIndex = range.index;
    }
  }
  if (override.intelligence) {
    const intel = parseIntelligence(override.intelligence);
    next.intelligence = intel.label;
    next.intelligenceIndex = intel.index;
  }
  if (override.abilities?.length) {
    next.abilities = override.abilities.slice(0, 8);
    const { haxScore } = extractAbilities(override.abilities.join(', '));
    next.haxScore = Math.max(next.haxScore, haxScore);
  }
  if (override.tags?.length) next.tags = override.tags.slice(0, 3) as PersonalityTag[];
  if (override.alignment) next.alignment = override.alignment;
  if (override.archetype) next.archetype = override.archetype;
  if (override.keyAbilityName) next.keyAbilityName = override.keyAbilityName;
  if (override.weaknesses) next.weaknesses = override.weaknesses;
  if (override.confidence) next.confidence = override.confidence;
  next.sources = [
    { label: 'Manual override (curated)', url: 'https://vsbattles.fandom.com/wiki/Attack_Potency' },
    ...next.sources,
  ];
  return next;
}

/* ------------------------------------------------------------------ */
/* Profile assembly                                                    */
/* ------------------------------------------------------------------ */

function emptyProfile(character: Character): Profile {
  return {
    key: character.key,
    name: character.name,
    source: character.source,
    tierPeak: 'Unknown',
    tierBase: 'Unknown',
    tierIndex: 0,
    speed: 'Unknown',
    speedIndex: 0,
    durability: 'Unknown',
    durabilityIndex: 0,
    range: 'Unknown',
    rangeIndex: 0,
    intelligence: 'Average',
    intelligenceIndex: 45,
    abilities: [],
    keyAbilityName: 'their signature technique',
    weaknesses: [],
    archetype: 'fighter',
    tags: ['stoic', 'loyal', 'prideful'],
    alignment: 'neutral',
    haxScore: 0,
    confidence: 'low',
    sources: [],
    baseScore: 0,
  };
}

function finalize(profile: Profile): Profile {
  const withScore: Profile = { ...profile, baseScore: baseScore(profile) };
  return withScore;
}

interface VsbBuildResult {
  profile: Profile;
  fieldsFound: number;
}

function buildFromVsb(character: Character, page: VsBStats, pageUrl: string): VsbBuildResult {
  const base = emptyProfile(character);
  const f = page.fields;

  const tierText = [f.Tier, f['Attack Potency']].filter(Boolean).join(' ');
  const tier = parseTier(tierText);
  const hasTier = tier.tierPeak !== 'Unknown';

  const speed = parseSpeed(f.Speed ?? '');
  const durability = parseDurability(f.Durability ?? '');
  const range = parseRange(f.Range ?? '');
  const intelligence = parseIntelligence(f.Intelligence ?? '');

  const abilityText = [f['Powers and Abilities'], f['Notable Attacks/Techniques'], f.Classification]
    .filter(Boolean)
    .join('. ');
  const { abilities, haxScore } = extractAbilities(abilityText);

  const flavourText = [
    f.Classification,
    f.Origin,
    f['Powers and Abilities'],
    f['Notable Attacks/Techniques'],
    page.categories.join(' '),
  ]
    .filter(Boolean)
    .join(' ');

  const tierIndex = hasTier ? tier.tierIndex : 0;
  const sIndex = speed ? speed.index : Math.round(norm(tierIndex, TIER_MAX_INDEX) / 100 * SPEED_MAX_INDEX * 0.9);
  const dIndex = durability ? durability.index : durabilityFromTierIndex(tierIndex);
  const rIndex = range ? range.index : 0;

  const fieldsFound = [f.Tier, f.Speed, f.Durability].filter(Boolean).length;
  const tags = deriveTags(flavourText, character.key);

  const profile: Profile = {
    ...base,
    tierPeak: tier.tierPeak,
    tierBase: tier.tierBase,
    tierIndex,
    speed: speed?.label ?? 'Unknown',
    speedIndex: sIndex,
    durability: durability?.label ?? 'Unknown',
    durabilityIndex: dIndex,
    range: range?.label ?? 'Unknown',
    rangeIndex: rIndex,
    intelligence: intelligence.label,
    intelligenceIndex: intelligence.index,
    abilities: topAbilityNames(abilities, 8),
    haxScore,
    keyAbilityName: deriveKeyAbilityName(
      { key: f.Key, notable: f['Notable Attacks/Techniques'] },
      abilities,
    ),
    weaknesses: (f.Weaknesses ?? '')
      .split(/[.;]\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3 && s.length < 160)
      .slice(0, 3),
    archetype: deriveArchetype(flavourText),
    tags,
    alignment: deriveAlignment(tags),
    confidence: fieldsFound >= 3 ? 'high' : 'medium',
    sources: [{ label: 'VS Battles Wiki', url: pageUrl }],
  };
  return { profile, fieldsFound };
}

function buildFromText(
  character: Character,
  text: string,
  sources: { label: string; url: string }[],
  llm: LlmExtraction | null,
): Profile {
  const base = emptyProfile(character);
  const { abilities, haxScore } = extractAbilities(`${text} ${llm?.abilities?.join(' ') ?? ''}`);

  if (llm && (llm.tierPeak || llm.speed)) {
    const tier = llm.tierPeak ? parseTier(llm.tierPeak) : null;
    const speed = llm.speed ? parseSpeed(llm.speed) : null;
    const durability = llm.durability ? parseDurability(llm.durability) : null;
    const tierIndex = tier && tier.tierPeak !== 'Unknown' ? tier.tierIndex : fallbackTier(text).tierIndex;
    return {
      ...base,
      tierPeak: tier?.tierPeak !== 'Unknown' && tier ? tier.tierPeak : tierLabelFromIndex(tierIndex),
      tierBase: tier?.tierBase ?? tierLabelFromIndex(tierIndex),
      tierIndex,
      speed: speed?.label ?? 'Unknown',
      speedIndex: speed?.index ?? Math.round((norm(tierIndex, TIER_MAX_INDEX) / 100) * 12),
      durability: durability?.label ?? 'Unknown',
      durabilityIndex: durability?.index ?? durabilityFromTierIndex(tierIndex),
      range: 'Unknown',
      rangeIndex: 0,
      intelligence: llm.intelligence ? parseIntelligence(llm.intelligence).label : 'Average',
      intelligenceIndex: llm.intelligence ? parseIntelligence(llm.intelligence).index : 45,
      abilities: (llm.abilities?.length ? llm.abilities : topAbilityNames(abilities, 8)).slice(0, 8),
      haxScore,
      keyAbilityName: llm.keyAbilityName || deriveKeyAbilityName({}, abilities),
      archetype: llm.archetype || deriveArchetype(text),
      tags: (llm.tags?.length ? llm.tags.slice(0, 3) : deriveTags(text, character.key)) as PersonalityTag[],
      alignment: llm.alignment ?? deriveAlignment(deriveTags(text, character.key)),
      confidence: 'medium',
      sources,
    };
  }

  // Pure heuristics: no wiki page and no LLM.
  const fb = fallbackTier(text);
  const scales = scalesFromTier(fb.tierIndex);
  const tags = deriveTags(text, character.key);
  const intel = parseIntelligence(text);
  return {
    ...base,
    tierPeak: fb.tier,
    tierBase: fb.tier,
    tierIndex: fb.tierIndex,
    speed: scales.speed.label === 'Unknown' ? 'Unknown' : scales.speed.label,
    speedIndex: scales.speed.index,
    durability: 'Unknown',
    durabilityIndex: scales.durability.index,
    range: 'Unknown',
    rangeIndex: scales.range.index,
    intelligence: intel.label,
    intelligenceIndex: intel.index,
    abilities: topAbilityNames(abilities, 8),
    haxScore,
    keyAbilityName: deriveKeyAbilityName({}, abilities),
    archetype: deriveArchetype(text),
    tags,
    alignment: deriveAlignment(tags),
    confidence: 'low',
    sources,
  };
}

/* ------------------------------------------------------------------ */
/* Optional LLM extraction                                             */
/* ------------------------------------------------------------------ */

const LlmSchema = z.object({
  tierPeak: z.string().optional(),
  speed: z.string().optional(),
  durability: z.string().optional(),
  abilities: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  alignment: z.enum(['good', 'neutral', 'evil']).optional(),
  archetype: z.string().optional(),
  keyAbilityName: z.string().optional(),
  intelligence: z.string().optional(),
});

type LlmExtraction = z.infer<typeof LlmSchema>;

const VALID_TAGS = new Set([
  'honorable', 'ruthless', 'treacherous', 'prideful', 'cowardly', 'merciful',
  'cunning', 'reckless', 'loyal', 'sadistic', 'stoic', 'comedic',
]);

async function llmExtract(name: string, source: string, text: string): Promise<LlmExtraction | null> {
  if (!llmEnabled() || !text.trim()) return null;
  const raw = await generateJson<unknown>({
    system:
      'You are a power-scaling analyst. Return ONLY JSON with keys tierPeak (VS Battles tier string like "7-B" or "High 6-A"), speed, durability, abilities (string[]), tags (from: honorable, ruthless, treacherous, prideful, cowardly, merciful, cunning, reckless, loyal, sadistic, stoic, comedic), alignment ("good"|"neutral"|"evil"), archetype, keyAbilityName, intelligence. Base the tier on the character\'s strongest verified feats in canon. Do not invent abilities that are not supported.',
    prompt: `Character: ${name}\nSource: ${source}\n\nWiki summary:\n${text.slice(0, 3000)}`,
    maxTokens: 600,
    json: true,
  });
  if (!raw) return null;
  const parsed = LlmSchema.safeParse(raw);
  if (!parsed.success) return null;
  const data = parsed.data;
  if (data.tags) {
    data.tags = data.tags.map((t) => t.toLowerCase().trim()).filter((t) => VALID_TAGS.has(t));
  }
  return data;
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export interface ResearchResult {
  profile: Profile;
  /** image candidates, primary first, all proxied */
  images: string[];
}

export async function researchCharacter(character: Character): Promise<Profile> {
  const cached = getCachedProfile(character.key);
  if (cached) return cached;

  let profile: Profile;
  try {
    profile = await researchUncached(character);
  } catch (err) {
    logger.warn({ err, key: character.key }, 'research failed; using heuristics');
    profile = finalize({
      ...emptyProfile(character),
      tags: deriveTags(character.name, character.key),
      confidence: 'low',
    });
  }

  const override = overrideFor(character);
  if (override) profile = applyOverride(profile, override);
  profile = finalize(profile);

  setCachedProfile(character.key, profile);
  return profile;
}

async function researchUncached(character: Character): Promise<Profile> {
  // 1. Best effort VS Battles lookup.
  const hits = await searchVsb(character.name, character.source);
  const ranked = rankVsbHits(character, hits);
  if (ranked.length) {
    const primary = ranked[0]!;
    // Long-running characters are split across arc pages on the wiki
    // ("Naruto Uzumaki (Part II: War Arc)"). When several hits are plainly the
    // same character, read a few of them and keep the strongest version, since
    // the spec asks for the character's peak as depicted in their media.
    // Only era/version qualifiers group together — "Sherlock Holmes (Fate)" is
    // a different character, not a later form of "Sherlock Holmes".
    const base = stripQualifier(primary.title).toLowerCase();
    const sameCharacter = ranked
      .filter((hit) => stripQualifier(hit.title).toLowerCase() === base && isVersionQualifier(hit.title))
      .slice(0, MAX_VSB_PAGES_PER_LOOKUP);
    const titles = sameCharacter.length > 1 ? sameCharacter.map((h) => h.title) : [primary.title];

    const pages = (await Promise.all(titles.map((title) => fetchVsbPage(title)))).filter(
      (page): page is NonNullable<typeof page> => Boolean(page && !page.empty),
    );
    let best: { profile: Profile; weight: number } | null = null;
    for (const page of pages) {
      const built = buildFromVsb(character, page, page.pageUrl);
      // Peak tier first, then how complete the stat block was.
      const weight = built.profile.tierIndex * 100 + built.fieldsFound;
      if (!best || weight > best.weight) best = { profile: built.profile, weight };
    }
    if (best) {
      let profile = best.profile;
      // A page found but with no tier is not much use — top it up from the wiki summary.
      if (profile.tierPeak === 'Unknown') {
        const summary = await safeWikipediaSummary(character.name);
        if (summary) {
          const llm = await llmExtract(character.name, character.source, summary.extract);
          profile = buildFromText(character, summary.extract, profile.sources, llm);
        }
      }
      return profile;
    }
  }

  // 2. Wikipedia / Fandom summary text, optionally enriched by the LLM.
  const summary = await safeWikipediaSummary(character.name);
  const sources: { label: string; url: string }[] = [];
  let text = '';
  if (summary) {
    text = `${summary.description}. ${summary.extract}`;
    sources.push({ label: 'Wikipedia', url: summary.url });
  }
  if (!text) {
    const fandom = await searchFandom(character.name, character.source).catch(() => []);
    const first = fandom[0];
    if (first) {
      text = first.extract;
      sources.push({ label: 'Fandom wiki', url: first.url });
    }
  }
  if (!text) text = `${character.name} — ${character.source}.`;

  const llm = await llmExtract(character.name, character.source, text);
  return buildFromText(character, text, sources, llm);
}

async function safeWikipediaSummary(name: string) {
  try {
    return await getWikipediaSummary(name);
  } catch {
    return null;
  }
}

/** How many arc pages to read when a character is split across several. */
const MAX_VSB_PAGES_PER_LOOKUP = 3;

/** Drop a wiki disambiguator: "Goku (Toei)" → "Goku". */
function stripQualifier(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * True when a title's parenthetical names an era, arc or release rather than a
 * different continuity. "(Part II: War Arc)" and "(New Era)" are later forms
 * of the same character; "(Fate)" and "(BBC)" are somebody else's version.
 */
const VERSION_QUALIFIER_RE =
  /\b(?:part|arc|saga|era|chapter|season|episode|movie|film|anime|manga|novel|game|original|canon|classic|current|base|pre|post|new|young|old|prime|full|final|resurrected|eos|timeskip|awakened)\b|\b[IVX]{2,}\b/i;

function isVersionQualifier(title: string): boolean {
  const match = /\(([^)]*)\)/.exec(title);
  if (!match) return true; // no qualifier at all: the character page itself
  return VERSION_QUALIFIER_RE.test(match[1] ?? '');
}

interface RankedVsbHit {
  title: string;
  score: number;
}

/**
 * Rank VS Battles search results. Titles that are exactly the character, or a
 * version of them, beat generic pages and other continuities.
 */
function rankVsbHits(
  character: Character,
  hits: { title: string; snippet: string }[],
): RankedVsbHit[] {
  const name = normalize(character.name);
  const source = normalize(character.source);
  // A source that is just the character's name ("Sherlock Holmes") carries no
  // disambiguating signal, so it must not boost every result equally.
  const sourceAddsInfo = Boolean(source) && !name.includes(source) && !source.includes(name);

  const ranked: RankedVsbHit[] = [];
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]!;
    const similarity = titleSimilarity(character.name, hit.title);
    const baseMatch = normalize(stripQualifier(hit.title)) === name;
    const sourceMentioned = sourceAddsInfo && normalize(`${hit.title} ${hit.snippet}`).includes(source);
    const qualifies = baseMatch || (similarity >= 0.82 && sourceMentioned) || (i === 0 && similarity >= 0.92);
    if (!qualifies) continue;

    ranked.push({
      title: hit.title,
      score:
        similarity +
        (baseMatch ? 0.12 : 0) +
        (sourceMentioned ? 0.15 : 0) -
        qualifierPenalty(hit.title, character.source) -
        i * 0.01,
    });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

/**
 * Penalise a disambiguator the caller did not ask for, so a request for
 * "Sherlock Holmes" prefers the plain page over "Sherlock Holmes (Fate)".
 */
function qualifierPenalty(title: string, source: string): number {
  const match = /\(([^)]+)\)/.exec(title);
  if (!match) return 0;
  const qualifier = normalize(match[1] ?? '');
  if (!qualifier) return 0;
  const asked = normalize(source);
  if (asked && (asked.includes(qualifier) || qualifier.includes(asked))) return 0;
  // "(Original)"/"(Canon)" is usually the primary version of the character.
  if (/\b(?:original|canon|main)\b/.test(qualifier)) return 0.05;
  return 0.25;
}

/* ------------------------------------------------------------------ */
/* Image waterfall                                                     */
/* ------------------------------------------------------------------ */

const IMAGE_FANOUT_TIMEOUT_MS = 6000;

/**
 * AniList is the one lookup worth waiting longer for — it is the only source of
 * anime artwork, and its requests are paced to respect the API's quota, so a
 * busy room can see them queue.
 */
const ANILIST_TIMEOUT_MS = 12_000;

/** Sources that mark a character as coming from anime or manga. */
const ANIME_SOURCE_RE =
  /\b(anime|manga|manhwa|manhua|light novel|web novel|visual novel|shounen|shonen|seinen|shoujo|shojo|josei|isekai|doujin)\b/i;

/**
 * Sources that describe the real world rather than a work of fiction. A
 * mythological Achilles and the Achilles of an anime are different characters
 * who happen to share a name, so a history pick keeps its own sources.
 */
const REAL_WORLD_SOURCE_RE = /\b(history|historical|mytholog\w*|myth|legend\w*|folklore|real life|ancient)\b/i;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** Clips make poor still portraits; a few wikis serve them as page images. */
function isAnimated(url: string): boolean {
  return decodeURIComponent(url).toLowerCase().includes('.gif');
}

/** Drop a trailing disambiguator: "Kirito (Post-Aincrad)" → "Kirito". */
function withoutQualifier(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name;
}

/** Meaningful words in a name, ignoring particles and single letters. */
function nameTokens(name: string): string[] {
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
function namesAreReordered(a: string, b: string): boolean {
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
function nameMatchScore(a: string, b: string): number {
  const left = normalize(withoutQualifier(a));
  const right = normalize(withoutQualifier(b));
  if (!left || !right) return 0;
  if (left === right) return 2;
  return namesAreReordered(a, b) ? 1 : 0;
}

/**
 * How well a character lines up with an AniList entry, under any of the names
 * AniList keeps for it. Anime databases file characters under their in-universe
 * legal name — Kirito is "Kazuto Kirigaya" — so a name-only comparison would
 * miss him and leave him without anime artwork entirely.
 */
function anilistMatchScore(characterName: string, match: AniListCandidate): number {
  return Math.max(
    nameMatchScore(characterName, match.name),
    ...(match.aliases ?? []).map((alias) => nameMatchScore(characterName, alias)),
  );
}

/**
 * Some characters are filed under their series rather than under the name the
 * player used: AniList holds Lupin III as "Arsène Lupin III" in "Lupin III".
 * When an entry appears in a work whose title is exactly the name (or source) we
 * searched for and every word of that name turns up in the entry's own names, it
 * is the same character under a fuller title.
 */
function sameFranchiseScore(character: Character, match: AniListCandidate): number {
  const works = (match.titles ?? []).map((title) => normalize(bareName(title))).filter(Boolean);
  if (!works.length) return 0;
  const asked = [character.name, character.source]
    .map((value) => normalize(bareName(value)))
    .filter(Boolean);
  if (!asked.some((value) => works.includes(value))) return 0;

  const wanted = nameTokens(character.name);
  if (!wanted.length) return 0;
  const pool = [match.name, ...(match.aliases ?? [])].flatMap((value) => nameTokens(value));
  return wanted.every((token) => pool.some((other) => other === token || other.startsWith(token) || token.startsWith(other)))
    ? 1
    : 0;
}

/**
 * The AniList entry for this character, but only when a name genuinely matches
 * — otherwise we would hand a character somebody else's portrait.
 */
export function bestAniListMatch(
  character: Character,
  matches: readonly AniListCandidate[],
): AniListCandidate | null {
  let best: { match: AniListCandidate; score: number } | null = null;
  let franchise: AniListCandidate | null = null;
  for (const match of matches) {
    if (!match.thumb) continue;
    const score = anilistMatchScore(character.name, match);
    if (!best || score > best.score) best = { match, score };
    if (!franchise && sameFranchiseScore(character, match)) franchise = match;
  }
  return best && best.score > 0 ? best.match : franchise;
}

/**
 * AniList's search does not cope with wiki disambiguators — "Son Goku (Dragon
 * Ball)" finds nothing while "Son Goku" finds him — so ask under both names.
 */
async function anilistCandidates(character: Character): Promise<AniListCandidate[]> {
  const names = [character.name, withoutQualifier(character.name)].filter(
    (value, index, all) => Boolean(value) && all.indexOf(value) === index,
  );
  const results = await Promise.all(names.map((value) => searchAniListCached(value)));
  // Results are in the order the names were tried, and the first exact match wins.
  return results.flat();
}

/**
 * AniList answers the same question the same way all afternoon, and a room full
 * of Masters picking their Servants at once would otherwise queue every one of
 * those lookups behind the paced gate.
 */
async function searchAniListCached(name: string): Promise<AniListCandidate[]> {
  const key = `anilist:${name.toLowerCase()}`;
  const cached = getCachedSearch<AniListCandidate[]>(key);
  if (cached) return cached;
  const found = await searchAniList(name).catch(() => [] as AniListCandidate[]);
  if (found.length) setCachedSearch(key, found);
  return found;
}

/**
 * Is this an anime or manga character? An AniList pick or a source naming a
 * drawn medium settles it, as does an AniList match for any other kind of
 * fiction. These characters are pictured with anime/manga artwork only — a
 * Wikipedia lead image for one of them is usually a logo or a cover rather than
 * the character. Real-world figures are exempt: see REAL_WORLD_SOURCE_RE.
 */
export function isAnimeMangaCharacter(
  character: Character,
  animeMatch: AniListCandidate | null = null,
): boolean {
  if (character.provider === 'anilist') return true;
  if (ANIME_SOURCE_RE.test(character.source)) return true;
  return Boolean(animeMatch) && !REAL_WORLD_SOURCE_RE.test(character.source);
}

/**
 * Build up to 6 image candidates for a character, primary first.
 * A picture the player chose or uploaded always wins, and the generated initials
 * avatar is only ever a last resort — never allowed to shadow real artwork.
 */
export async function buildImageCandidates(character: Character): Promise<string[]> {
  const found: string[] = [];

  const push = (url: string | null | undefined) => {
    const proxied = proxyUrl(url);
    if (proxied && !found.includes(proxied)) found.push(proxied);
  };

  // The player's own picture (an upload or a pick from the change-picture
  // dialog) wins. Our generated placeholder does not count as a picture.
  if (!isPlaceholderImage(character.imageUrl)) push(character.imageUrl);

  const [anilist, vsbImg, fandomImgs, wikiImg, tmdbImg, braveImgs] = await Promise.all([
    withTimeout(anilistCandidates(character), ANILIST_TIMEOUT_MS, [] as AniListCandidate[]),
    withTimeout(getVsbImage(character.name), IMAGE_FANOUT_TIMEOUT_MS, null as string | null),
    withTimeout(searchFandom(character.name, character.source).catch(() => []), IMAGE_FANOUT_TIMEOUT_MS, []),
    withTimeout(getWikipediaImage(character.name), IMAGE_FANOUT_TIMEOUT_MS, null as string | null),
    withTimeout(getTmdbImage(character.name), IMAGE_FANOUT_TIMEOUT_MS, null as string | null),
    withTimeout(searchImages(character.name, character.source).catch(() => []), IMAGE_FANOUT_TIMEOUT_MS, []),
  ]);

  const animeArt = bestAniListMatch(character, anilist ?? []);
  // Prefer the wiki page that is actually about the character; a franchise wiki
  // often ranks the film or series page — and its poster — above their page.
  const fandomPages = [...fandomImgs].sort(
    (a, b) => titleSimilarity(character.name, b.title) - titleSimilarity(character.name, a.title),
  );

  if (isAnimeMangaCharacter(character, animeArt)) {
    // Anime and manga characters are pictured with anime/manga artwork only:
    // AniList and the franchise's own wiki first, then the VS Battles page.
    push(animeArt?.thumb);
    push(vsbImg);
    for (const f of fandomPages.slice(0, 3)) push(f.imageUrl);
  } else {
    // Real people, films and games: the encyclopaedia lead image first, then
    // TMDB, then the character's own page on the VS Battles and Fandom wikis.
    push(wikiImg);
    push(tmdbImg);
    push(vsbImg);
    for (const f of fandomPages.slice(0, 3)) push(f.imageUrl);
    // Anime artwork for the same name, when one exists, is still worth offering.
    push(animeArt?.thumb);
  }
  for (const url of braveImgs.slice(0, 3)) push(url);

  push(generatedAvatar(character.name)); // never fails

  // Keep every candidate, but never let a clip be the face of a Servant.
  return [...found.filter((url) => !isAnimated(url)), ...found.filter(isAnimated)].slice(0, 6);
}

export { generatedAvatar, proxyUrl };
