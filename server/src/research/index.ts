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
import type { VsBStats } from './parseVsb';
import {
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
import { getVsbImage } from './providers/vsbattles';
import {
  bareName,
  getAniListCharacter,
  searchAniList,
  type AniListCandidate,
  type AniListCharacter,
} from './providers/anilist';
import { getFandomPageText, searchFandom } from './providers/fandom';
import { getTmdbImage } from './providers/tmdb';
import { searchImages } from './providers/imageSearch';
import { getWikipediaImage, getWikipediaSummary } from './providers/wikipedia';
import { titleSimilarity } from '../util/text';
import {
  nameMatchScore,
  nameTokens,
  namesAreReordered,
  resolveVsbPage,
  stripQualifier,
  withoutQualifier,
  type NameHints,
  type ScoredVsbPage,
} from './vsbLookup';

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
  // Entries are keyed name|source. An entry keyed by name alone applies to every
  // source, which is how a single Fate entry covers both "Saber / Fate/stay
  // night" and "Artoria Pendragon / VS Battles Wiki".
  const key = normalize(`${character.name}|${character.source}`);
  if (OVERRIDES[key]) return OVERRIDES[key];
  for (const name of [withoutQualifier(character.name), stripQualifier(character.name)]) {
    const bare = normalize(name);
    if (bare && OVERRIDES[bare]) return OVERRIDES[bare];
  }
  return undefined;
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

function buildFromVsb(character: Character, page: VsBStats, pageUrl: string, extraText = ''): VsbBuildResult {
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
  let { abilities, haxScore } = extractAbilities(abilityText);
  // Some pages carry stats but no powers list; the gathered bio is the better
  // source for abilities than an empty list.
  if (!abilities.length && extraText) {
    const fromInfo = extractAbilities(extraText);
    abilities = fromInfo.abilities;
    haxScore = fromInfo.haxScore;
  }

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
  /** fictional characters fall back to a fighter baseline, real people to human */
  fiction = false,
): Profile {
  const base = emptyProfile(character);
  const { abilities, haxScore } = extractAbilities(`${text} ${llm?.abilities?.join(' ') ?? ''}`);

  if (llm && (llm.tierPeak || llm.speed)) {
    const tier = llm.tierPeak ? parseTier(llm.tierPeak) : null;
    const speed = llm.speed ? parseSpeed(llm.speed) : null;
    const durability = llm.durability ? parseDurability(llm.durability) : null;
    const tierIndex = tier && tier.tierPeak !== 'Unknown' ? tier.tierIndex : fallbackTier(text, { fiction }).tierIndex;
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
  const fb = fallbackTier(text, { fiction });
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
  const evidence = await collectCharacterEvidence(character);

  // VS Battles is the scaling authority: tier, speed and durability come from
  // its stat block whenever the character's page can be found.
  if (evidence.vsb) {
    const built = buildFromVsb(character, evidence.vsb.page, evidence.vsb.page.pageUrl, evidence.info.text);
    const profile = built.profile;
    if (profile.tierPeak !== 'Unknown') return profile;
    // A page was found but carried no tier — scale from the gathered bio and
    // keep whatever the page did provide.
    const llm = await llmExtract(character.name, character.source, evidence.info.text);
    const fromInfo = buildFromText(character, evidence.info.text, profile.sources, llm, evidence.fiction);
    return mergeProfileWithInfo(profile, fromInfo);
  }

  const llm = await llmExtract(character.name, character.source, evidence.info.text);
  return buildFromText(character, evidence.info.text, evidence.info.sources, llm, evidence.fiction);
}

/**
 * Keep everything the VS Battles page did provide — tier columns, speed, the
 * abilities list — while filling its gaps from the character's bio.
 */
function mergeProfileWithInfo(vsb: Profile, info: Profile): Profile {
  return {
    ...info,
    speed: vsb.speed !== 'Unknown' ? vsb.speed : info.speed,
    speedIndex: vsb.speed !== 'Unknown' ? vsb.speedIndex : info.speedIndex,
    durability: vsb.durability !== 'Unknown' ? vsb.durability : info.durability,
    durabilityIndex: vsb.durability !== 'Unknown' ? vsb.durabilityIndex : info.durabilityIndex,
    range: vsb.range !== 'Unknown' ? vsb.range : info.range,
    rangeIndex: vsb.range !== 'Unknown' ? vsb.rangeIndex : info.rangeIndex,
    abilities: vsb.abilities.length ? vsb.abilities : info.abilities,
    haxScore: Math.max(vsb.haxScore, info.haxScore),
    keyAbilityName:
      vsb.keyAbilityName !== 'their signature technique' ? vsb.keyAbilityName : info.keyAbilityName,
    archetype: vsb.archetype !== 'fighter' ? vsb.archetype : info.archetype,
    sources: dedupeSources([...vsb.sources, ...info.sources]),
  };
}

function dedupeSources(sources: { label: string; url: string }[]): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [];
  for (const source of sources) {
    if (!source.url || out.some((existing) => existing.url === source.url)) continue;
    out.push(source);
  }
  return out;
}

async function safeWikipediaSummary(name: string) {
  try {
    return await getWikipediaSummary(name);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Character evidence: known names, info sources, the scaling page     */
/* ------------------------------------------------------------------ */

/** AniList names for the character, used to find their wiki page. */
export interface AniListHints extends NameHints {
  match: AniListCandidate;
}

/**
 * Every name AniList knows the character by. Anime databases file characters
 * under their in-universe name — Fate's "Saber" is "Artoria Pendragon" — so
 * these names are what actually locates the VS Battles page that the player's
 * own search term misses.
 */
function hintNames(name: string, aliases: string[] = []): string[] {
  return [name, ...aliases]
    .map((value) => bareName(value))
    .filter((value, index, all) => value.length >= 3 && all.indexOf(value) === index);
}

/** AniList answers the same id the same way all afternoon. */
async function aniListDetail(id: string): Promise<AniListCharacter | null> {
  const key = `anilist-detail:${id}`;
  const cached = getCachedSearch<AniListCharacter>(key);
  if (cached) return cached;
  const detail = await getAniListCharacter(id).catch(() => null);
  if (detail) setCachedSearch(key, detail);
  return detail;
}

export async function anilistHintsFor(character: Character): Promise<AniListHints | null> {
  // A pick made from AniList carries the exact entry id, and that id is worth
  // trusting over a name search: Fate's Saber and her Honkai collab namesake
  // share both the name and the "Artoria/Altria Pendragon" alias.
  if (character.provider === 'anilist' && character.providerId) {
    const detail = await withTimeout(aniListDetail(character.providerId), ANILIST_TIMEOUT_MS, null);
    if (detail) {
      return {
        names: hintNames(detail.name, detail.aliases),
        titles: detail.titles,
        match: {
          providerId: detail.providerId,
          name: detail.name,
          source: detail.source,
          thumb: detail.imageUrl,
          aliases: detail.aliases,
          titles: detail.titles,
        },
      };
    }
  }

  const candidates = await withTimeout(
    anilistCandidates(character),
    ANILIST_TIMEOUT_MS,
    [] as AniListCandidate[],
  );
  const match = bestAniListMatch(character, candidates, { requireArtwork: false });
  if (!match) return null;
  return { names: hintNames(match.name, match.aliases), titles: match.titles ?? [], match };
}

interface InfoPart {
  label: string;
  url: string;
  text: string;
}

export interface GatheredInfo {
  text: string;
  sources: { label: string; url: string }[];
  /** the first source in the waterfall that produced text */
  source: 'anilist' | 'fandom' | 'wikipedia' | 'none';
}

/**
 * Does the text actually say anything about how the character fights? A two-line
 * stub is not worth stopping the waterfall for.
 */
const FEAT_SIGNAL_RE =
  /\b(?:abilit(?:y|ies)|powers?|strength|durab\w*|speed|superhuman|immortal\w*|invulnerab\w*|regenerat\w*|master(?:y|ed)?|skilled|skill|technique|combat|fight\w*|weapon|sword\w*|blade|spear|bow|arrow|gun|magic\w*|energy|ki\b|chakra|reiatsu|curse\w*|enhanced|physical)\b/i;

function infoIsSufficient(text: string): boolean {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length < 220) return false;
  return clean.length >= 700 || FEAT_SIGNAL_RE.test(clean);
}

function combineInfo(parts: InfoPart[]): GatheredInfo {
  const text = parts
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 8000);
  if (!text) return { text: '', sources: [], source: 'none' };
  const first = parts.find((part) => part.text.trim());
  return {
    text,
    sources: dedupeSources(parts.map((part) => ({ label: part.label, url: part.url }))),
    source: (first?.label === 'AniList'
      ? 'anilist'
      : first?.label === 'Wikipedia'
        ? 'wikipedia'
        : 'fandom') as GatheredInfo['source'],
  };
}

async function anilistInfoPart(character: Character): Promise<InfoPart | null> {
  const candidates = await withTimeout(
    anilistCandidates(character),
    ANILIST_TIMEOUT_MS,
    [] as AniListCandidate[],
  );
  const match = bestAniListMatch(character, candidates, { requireArtwork: false });
  if (!match) return null;
  const detail = await withTimeout(
    getAniListCharacter(match.providerId).catch(() => null),
    ANILIST_TIMEOUT_MS,
    null,
  );
  const text = detail?.description?.trim() ?? '';
  if (text.length < 60) return null;
  return { label: 'AniList', url: `https://anilist.co/character/${match.providerId}`, text };
}

async function fandomInfoPart(character: Character): Promise<InfoPart | null> {
  const page = await getFandomPageText(character.name, character.source).catch(() => null);
  if (!page || page.text.trim().length < 60) return null;
  return { label: 'Fandom wiki', url: page.url, text: page.text };
}

async function wikipediaInfoPart(name: string): Promise<InfoPart | null> {
  const summary = await safeWikipediaSummary(name);
  if (!summary) return null;
  const text = [summary.description, summary.extract].filter(Boolean).join('. ').trim();
  if (!text) return null;
  return { label: 'Wikipedia', url: summary.url, text };
}

/**
 * Gather the character's info in the order their kind of character deserves.
 *
 * Anime and manga characters: AniList → Fandom → Wikipedia, stopping as soon as
 * a source carries enough detail to scale and describe them (Wikipedia is only
 * ever the last resort). Everyone else — history, films, games — keeps the
 * encyclopaedia-first order it always had. VS Battles is consulted separately;
 * it is what actually produces the tier.
 */
export async function gatherCharacterInfo(character: Character, anime: boolean): Promise<GatheredInfo> {
  const steps: (() => Promise<InfoPart | null>)[] = anime
    ? [
        () => anilistInfoPart(character),
        () => fandomInfoPart(character),
        () => wikipediaInfoPart(character.name),
      ]
    : [() => wikipediaInfoPart(character.name), () => fandomInfoPart(character)];

  const parts: InfoPart[] = [];
  for (const step of steps) {
    const part = await step();
    if (part && part.text.trim()) parts.push(part);
    const combined = combineInfo(parts);
    if (combined.text && infoIsSufficient(combined.text)) return combined;
  }

  const combined = combineInfo(parts);
  if (combined.text) return combined;
  return { text: `${character.name} — ${character.source}.`, sources: [], source: 'none' };
}

/** Everything the pipeline knows about a character before it is scaled. */
export interface CharacterEvidence {
  hints: AniListHints | null;
  anime: boolean;
  /** fictional characters fall back to a fighter baseline, real people to human */
  fiction: boolean;
  info: GatheredInfo;
  vsb: ScoredVsbPage | null;
}

/**
 * Collect a character's evidence once and reuse it: the draft gate, the research
 * phase and the image picker all need the same wiki pages, and a room full of
 * Masters picking at once should not queue the same request ten times.
 */
export async function collectCharacterEvidence(character: Character): Promise<CharacterEvidence> {
  const cacheKey = `evidence:${character.key}`;
  const cached = getCachedSearch<CharacterEvidence>(cacheKey);
  if (cached) return cached;

  const hints = await anilistHintsFor(character);
  const anime = isAnimeMangaCharacter(character, hints?.match ?? null);
  const fiction = !REAL_WORLD_SOURCE_RE.test(character.source);
  const [vsb, info] = await Promise.all([
    resolveVsbPage(character, hints).catch(() => null),
    gatherCharacterInfo(character, anime),
  ]);

  const evidence: CharacterEvidence = {
    hints: hints ? { names: hints.names, titles: hints.titles, match: hints.match } : null,
    anime,
    fiction,
    info,
    vsb,
  };
  setCachedSearch(cacheKey, evidence);
  return evidence;
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
  options: { requireArtwork?: boolean } = {},
): AniListCandidate | null {
  const requireArtwork = options.requireArtwork ?? true;
  let best: { match: AniListCandidate; score: number } | null = null;
  let franchise: AniListCandidate | null = null;
  for (const match of matches) {
    if (requireArtwork && !match.thumb) continue;
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
