/**
 * Power-scaling scales.
 *
 * The tier codes below follow the VS Battles Wiki "Attack Potency" scale;
 * ordering is what matters, not the exact numeric mapping. Index position in the
 * arrays is the canonical ordering used by the Oracle.
 */

export const TIERS = [
  '11-C', '11-B', '11-A',
  '10-C', '10-B', '10-A',
  '9-C', '9-B', '9-A',
  '8-C', '8-B', '8-A',
  '7-C', '7-B', '7-A',
  '6-C', '6-B', '6-A',
  '5-C', '5-B', '5-A',
  '4-C', '4-B', '4-A',
  '3-C', '3-B', '3-A',
  '2-C', '2-B', '2-A',
  '1-C', '1-B', '1-A',
  'High 1-A', '0',
] as const;

export const SPEED_SCALE = [
  'Below Average Human',
  'Average Human',
  'Athletic Human',
  'Peak Human',
  'Superhuman',
  'Subsonic',
  'Transonic',
  'Supersonic',
  'Hypersonic',
  'Massively Hypersonic',
  'Sub-Relativistic',
  'Relativistic',
  'FTL',
  'MFTL',
  'Infinite',
  'Immeasurable',
  'Irrelevant',
] as const;

export const LEVELS = [
  'Below Average Human',
  'Human',
  'Athlete',
  'Street',
  'Wall',
  'Small Building',
  'Building',
  'Multi-Building',
  'City Block',
  'Multi-City Block',
  'Small Town',
  'Town',
  'Large Town',
  'Small City',
  'City',
  'Mountain',
  'Large Mountain',
  'Island',
  'Small Country',
  'Country',
  'Large Country',
  'Continent',
  'Moon',
  'Small Planet',
  'Planet',
  'Large Planet',
  'Dwarf Star',
  'Small Star',
  'Star',
  'Large Star',
  'Solar System',
  'Multi-Solar System',
  'Galaxy',
  'Multi-Galaxy',
  'Universe',
  'Multiverse',
] as const;

/** Small explicit range words, then the level scale offset by this amount. */
export const RANGE_PREFIX_WORDS = [
  'Standard Melee Range',
  'Extended Melee Range',
  'Several Meters',
  'Tens of Meters',
  'Hundreds of Meters',
  'Kilometers',
  'Tens of Kilometers',
] as const;

export const RANGE_LEVEL_OFFSET = RANGE_PREFIX_WORDS.length;

export const RANGE_SCALE = [
  ...RANGE_PREFIX_WORDS,
  ...LEVELS.map((l) => `${l} Range`),
] as const;

const IGNORE_PREFIXES = ['Possibly', 'Potentially', 'Theoretically', 'Unknown'];

export interface TierToken {
  text: string;
  index: number;
  ignored: boolean;
}

/** Parse every tier-like token in a string, with Low/High fractional offsets. */
export function parseTierTokens(text: string): TierToken[] {
  const tokens: TierToken[] = [];
  const re = /\b(?:(Low|High)\s+)?(\d{1,2}-[ABC]|0)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const [full, prefix, base] = match;
    const lookback = text.slice(Math.max(0, match.index - 20), match.index);
    const ignored = IGNORE_PREFIXES.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(lookback));
    let index = (TIERS as readonly string[]).indexOf(base);
    if (index === -1) continue;
    if (prefix) {
      const p = prefix.toLowerCase();
      if (p === 'high' && base === '1-A') {
        index = (TIERS as readonly string[]).indexOf('High 1-A');
      } else if (p === 'low') {
        index -= 0.33;
      } else if (p === 'high') {
        index += 0.33;
      }
    }
    tokens.push({ text: full.trim(), index, ignored });
  }
  return tokens;
}

export interface TierParse {
  tierPeak: string;
  tierBase: string;
  tierIndex: number;
  /** true when every tier token on the line was prefixed by "Possibly"/"Unknown" etc. */
  uncertain: boolean;
}

export function parseTier(text: string): TierParse {
  const tokens = parseTierTokens(text);
  const accepted = tokens.filter((t) => !t.ignored);
  if (!accepted.length) {
    return { tierPeak: 'Unknown', tierBase: 'Unknown', tierIndex: 0, uncertain: tokens.length > 0 };
  }
  let peak = accepted[0];
  for (const t of accepted) if (t.index > peak.index) peak = t;
  return {
    tierPeak: peak.text,
    tierBase: accepted[0].text,
    tierIndex: Math.max(0, peak.index),
    uncertain: false,
  };
}

/**
 * Find every scale word in `text`.
 *
 * Alternatives are tried longest-first, so a phrase like "Small Country level"
 * matches "Small Country" rather than the shorter "Country" nested inside it,
 * and "Massively Hypersonic" is not also counted as "Hypersonic".
 */
function findScaleMatches(text: string, scale: readonly string[]): ScaleParse[] {
  if (!text) return [];
  const ordered = [...scale]
    .map((word, index) => ({ word, index }))
    .sort((a, b) => b.word.length - a.word.length);
  if (!ordered.length) return [];

  const pattern = new RegExp(
    `(?<![a-z0-9])(?:${ordered.map((o) => escapeRegex(o.word)).join('|')})(?![a-z0-9])`,
    'gi',
  );
  const found: ScaleParse[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const matched = match[0].toLowerCase();
    const entry = ordered.find((o) => o.word.toLowerCase() === matched);
    if (entry) found.push({ label: entry.word, index: entry.index });
    if (match.index === pattern.lastIndex) pattern.lastIndex++; // never loop on a zero-length match
  }
  return found;
}

/** The strongest of several matches. */
function highest(matches: ScaleParse[]): ScaleParse | null {
  if (!matches.length) return null;
  return matches.reduce((best, current) => (current.index > best.index ? current : best));
}

export interface ScaleParse {
  label: string;
  index: number;
}

export function parseSpeed(text: string): ScaleParse | null {
  if (!text) return null;
  const found = findScaleMatches(text, SPEED_SCALE);
  // Spelled-out synonyms the scale list does not literally contain.
  const synonyms: [RegExp, string][] = [
    [/massively\s*ftl|massively faster than light/i, 'MFTL'],
    [/faster than light|speed of light/i, 'FTL'],
  ];
  for (const [re, canonical] of synonyms) {
    if (!re.test(text)) continue;
    const index = (SPEED_SCALE as readonly string[]).indexOf(canonical);
    if (index >= 0) found.push({ label: canonical, index });
  }
  return highest(found);
}

/** Durability/Range use "{Word} level" patterns; the longest word wins. */
export function parseLevelWord(text: string, scale: readonly string[] = LEVELS): ScaleParse | null {
  return highest(findScaleMatches(text, scale));
}

export function parseDurability(text: string): ScaleParse | null {
  if (!text || /^\s*unknown\s*$/i.test(text)) return null;
  return parseLevelWord(text);
}

export function parseRange(text: string): ScaleParse | null {
  if (!text || /^\s*unknown\s*$/i.test(text)) return null;
  const prefix = highest(findScaleMatches(text, RANGE_PREFIX_WORDS));
  if (prefix) return { label: prefix.label, index: prefix.index };
  const level = parseLevelWord(text);
  if (level) return { label: `${level.label} Range`, index: level.index + RANGE_LEVEL_OFFSET };
  return null;
}

const INTELLIGENCE_TABLE: [RegExp, number, string][] = [
  [/nigh[- ]omniscient|omniscient/i, 100, 'Nigh-Omniscient'],
  [/cosmic awareness|supergenius|super[- ]genius/i, 95, 'Supergenius'],
  [/genius/i, 85, 'Genius'],
  [/gifted|brilliant/i, 70, 'Gifted'],
  [/above average/i, 58, 'Above Average'],
  [/average|normal/i, 45, 'Average'],
  [/below average|low|simple[- ]minded|animalistic|mindless/i, 25, 'Low'],
];

export function parseIntelligence(text: string): ScaleParse & { label: string; index: number } {
  for (const [re, value, label] of INTELLIGENCE_TABLE) {
    if (re.test(text)) return { label, index: value };
  }
  return { label: 'Average', index: 45 };
}

export function norm(index: number, maxIndex: number): number {
  if (maxIndex <= 0) return 0;
  return Math.max(0, Math.min(100, (index / maxIndex) * 100));
}

export const TIER_MAX_INDEX = TIERS.length - 1;
export const SPEED_MAX_INDEX = SPEED_SCALE.length - 1;
export const LEVEL_MAX_INDEX = LEVELS.length - 1;
export const RANGE_MAX_INDEX = RANGE_SCALE.length - 1;

/** Tier index → label used for prose ("Tier 7-B"). */
export function tierLabelFromIndex(index: number): string {
  const rounded = Math.round(index);
  return TIERS[Math.max(0, Math.min(TIERS.length - 1, rounded))] ?? 'Unknown';
}

/** Rough durability index implied by a tier index (used by the heuristic path). */
export function durabilityFromTierIndex(tierIndex: number): number {
  const ratio = tierIndex / TIER_MAX_INDEX;
  return Math.round(ratio * LEVEL_MAX_INDEX);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
