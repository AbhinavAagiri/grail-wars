import type { PersonalityTag } from '@hgd/shared';
import { hashString } from '../util/text';
import {
  LEVEL_MAX_INDEX,
  TIERS,
  TIER_MAX_INDEX,
  durabilityFromTierIndex,
  norm,
  type ScaleParse,
} from './tiers';

/* ------------------------------------------------------------------ */
/* Abilities / hax                                                     */
/* ------------------------------------------------------------------ */

interface AbilityRule {
  name: string;
  weight: number;
  patterns: RegExp[];
}

/**
 * Ordered high → low. Each distinct match adds its weight; the total is capped
 * at 100 for the hax score.
 */
const ABILITY_RULES: AbilityRule[] = [
  // 22 — reality-level effects
  { name: 'Reality Warping', weight: 22, patterns: [/reality warping/i] },
  { name: 'Existence Erasure', weight: 22, patterns: [/existence erasure/i, /erase (?:from )?existence/i] },
  { name: 'Nonexistent Physiology', weight: 22, patterns: [/nonexistent physiology/i] },
  { name: 'Causality Manipulation', weight: 22, patterns: [/causality manipulation/i] },
  { name: 'Fate Manipulation', weight: 22, patterns: [/fate manipulation/i] },
  { name: 'Conceptual Manipulation', weight: 22, patterns: [/conceptual manipulation/i] },
  // 18 — space/time/soul/law
  { name: 'Time Manipulation', weight: 18, patterns: [/time manipulation/i, /time stop/i, /time travel/i] },
  { name: 'Space-Time Manipulation', weight: 18, patterns: [/space[\s-]?time manipulation/i] },
  { name: 'Dimensional Travel', weight: 18, patterns: [/dimensional travel/i, /dimensional storage/i] },
  { name: 'Spatial Manipulation', weight: 18, patterns: [/spatial manipulation/i, /space manipulation/i] },
  { name: 'Soul Manipulation', weight: 18, patterns: [/soul manipulation/i, /soul absorption/i] },
  { name: 'Death Manipulation', weight: 18, patterns: [/death manipulation/i, /instant death/i] },
  { name: 'Law Manipulation', weight: 18, patterns: [/law manipulation/i] },
  { name: 'Power Nullification', weight: 18, patterns: [/power nullification/i, /power negation/i] },
  // 16 — bullshit-grade regeneration / immortality
  {
    name: 'Regeneration (High-Godly)',
    weight: 16,
    patterns: [/regeneration[^.\n]{0,24}(?:high-godly|mid-godly)/i, /(?:high|mid)-godly regeneration/i],
  },
  {
    name: 'Immortality (Type 4/5)',
    weight: 16,
    patterns: [/immortality[^.\n]{0,32}type[s]?[^.\n]{0,12}(?:4|5)/i],
  },
  { name: 'Resurrection', weight: 16, patterns: [/resurrection/i, /revival/i] },
  { name: 'Invulnerability', weight: 16, patterns: [/invulnerability/i] },
  // 12 — strong but bounded
  { name: 'Regeneration', weight: 12, patterns: [/regeneration/i, /regenerative/i, /healing factor/i] },
  { name: 'Immortality', weight: 12, patterns: [/immortality/i, /immortal\b/i] },
  { name: 'Mind Manipulation', weight: 12, patterns: [/mind manipulation/i, /telepathy/i, /mind control/i] },
  { name: 'Gravity Manipulation', weight: 12, patterns: [/gravity manipulation/i] },
  { name: 'Absorption', weight: 12, patterns: [/\babsorption\b/i, /absorb(?:ing)? (?:energy|power|life|mana)/i] },
  { name: 'Matter Manipulation', weight: 12, patterns: [/matter manipulation/i, /transmutation/i] },
  { name: 'Energy Manipulation', weight: 12, patterns: [/energy manipulation/i, /energy projection/i] },
  { name: 'Summoning', weight: 12, patterns: [/summoning/i] },
  // 6 — common toolkit
  { name: 'Fire Manipulation', weight: 6, patterns: [/fire manipulation/i, /pyrokinesis/i] },
  { name: 'Ice Manipulation', weight: 6, patterns: [/ice manipulation/i, /cryokinesis/i] },
  { name: 'Lightning Manipulation', weight: 6, patterns: [/lightning manipulation/i, /electricity manipulation/i] },
  { name: 'Elemental Manipulation', weight: 6, patterns: [/elemental manipulation/i, /elements/i] },
  { name: 'Teleportation', weight: 6, patterns: [/teleportation/i, /instant transmission/i] },
  { name: 'Flight', weight: 6, patterns: [/\bflight\b/i, /\bflying\b/i] },
  { name: 'Shapeshifting', weight: 6, patterns: [/shapeshifting/i, /transformation/i] },
  { name: 'Illusion', weight: 6, patterns: [/illusion/i] },
  { name: 'Poison Manipulation', weight: 6, patterns: [/poison/i, /venom/i, /toxin/i] },
  { name: 'Barrier Creation', weight: 6, patterns: [/barrier/i, /forcefield/i, /force field/i] },
  { name: 'Weapon Mastery', weight: 6, patterns: [/weapon mastery/i, /master swordsman/i, /swordsmanship/i] },
  { name: 'Martial Arts', weight: 6, patterns: [/martial arts/i] },
  { name: 'Expert Combatant', weight: 6, patterns: [/expert (?:hand-to-hand )?combatant/i, /combat skill/i] },
  { name: 'Stealth Mastery', weight: 6, patterns: [/stealth mastery/i, /\bstealth\b/i, /invisibility/i] },
  { name: 'Enhanced Senses', weight: 6, patterns: [/enhanced senses/i, /enhanced sight/i, /enhanced hearing/i] },
  { name: 'Danger Perception', weight: 6, patterns: [/precognition/i, /danger (?:sense|perception)/i, /instinctive reaction/i] },
];

export interface AbilityMatch {
  name: string;
  weight: number;
}

export function extractAbilities(text: string): { abilities: AbilityMatch[]; haxScore: number } {
  const source = text ?? '';
  if (!source.trim()) return { abilities: [], haxScore: 0 };

  // "Resistance to X, Y and Z" describes defence, not offence. Pull those
  // phrases out *before* scanning for abilities, otherwise "Resistance to
  // Existence Erasure" would hand out the full 22-point offensive weight and
  // read as if the character could erase people from existence.
  const resistances = new Set<string>();
  const resistanceBlockRe = /\b(?:resistance|resistant|immune|immunity)s?\s+to\s+([^.;\n]{1,200})/gi;
  let used = source.replace(resistanceBlockRe, (_match, list: string) => {
    for (const raw of String(list).split(/,|\band\b|\bor\b|\//i)) {
      const name = raw.trim().replace(/\s+/g, ' ');
      if (name.length < 3 || name.length > 40) continue;
      if (/^(?:all|everything|most|various|several|many|anything|others)$/i.test(name)) continue;
      resistances.add(name);
    }
    return ' ';
  });

  const found: AbilityMatch[] = [];
  for (const rule of ABILITY_RULES) {
    let hit = false;
    for (const pattern of rule.patterns) {
      if (pattern.test(used)) {
        hit = true;
        // Remove the matched text so a broader rule cannot double-count it.
        used = used.replace(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`), ' ');
      }
    }
    if (hit) found.push({ name: rule.name, weight: rule.weight });
  }

  // Each distinct resistance is worth 3, capped at 15 in total.
  const resistanceBonus = Math.min(15, resistances.size * 3);
  if (resistanceBonus > 0) found.push({ name: 'Resistance', weight: resistanceBonus });

  const haxScore = Math.min(100, found.reduce((sum, a) => sum + a.weight, 0));
  found.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
  return { abilities: found, haxScore };
}

export function topAbilityNames(matches: AbilityMatch[], limit = 8): string[] {
  return matches.slice(0, limit).map((m) => m.name);
}

/* ------------------------------------------------------------------ */
/* Personality tags / alignment / archetype                            */
/* ------------------------------------------------------------------ */

const TAG_KEYWORDS: Record<PersonalityTag, RegExp[]> = {
  ruthless: [/villain/i, /tyrant/i, /conquer/i, /\bkill/i, /murder/i, /brutal/i],
  sadistic: [/sadistic/i, /torture/i, /cruel/i, /torment/i],
  treacherous: [/betray/i, /deceiv/i, /treacher/i, /backstab/i],
  cunning: [/schem/i, /\btrick/i, /manipulat/i, /strateg/i],
  honorable: [/honor/i, /knight/i, /noble/i, /\bcode\b/i, /duty/i, /justice/i, /chivalr/i],
  prideful: [/proud/i, /arrogant/i, /\bking\b/i, /\bqueen\b/i, /\bgod\b/i, /supreme/i],
  cowardly: [/coward/i, /\bafraid\b/i, /\bflee/i, /timid/i],
  merciful: [/kind/i, /compassion/i, /protect/i, /\bspare/i, /gentle/i, /selfless/i],
  loyal: [/loyal/i, /devoted/i, /servant/i, /\bguard/i, /faithful/i],
  reckless: [/reckless/i, /impulsive/i, /berserk/i, /\brage\b/i, /hot[- ]headed/i],
  stoic: [/silent/i, /\bcalm\b/i, /stoic/i, /\bcold\b/i, /emotionless/i],
  comedic: [/comic/i, /\bfunny\b/i, /goofy/i, /\bjoke/i, /clown/i, /silly/i],
};

const TAG_POOL: PersonalityTag[] = [
  'honorable',
  'ruthless',
  'treacherous',
  'prideful',
  'cowardly',
  'merciful',
  'cunning',
  'reckless',
  'loyal',
  'sadistic',
  'stoic',
  'comedic',
];

export function deriveTags(text: string, key: string): PersonalityTag[] {
  const source = text ?? '';
  const counts: { tag: PersonalityTag; hits: number }[] = [];
  for (const tag of TAG_POOL) {
    let hits = 0;
    for (const re of TAG_KEYWORDS[tag]) {
      const matches = source.match(new RegExp(re.source, 'gi'));
      hits += matches ? matches.length : 0;
    }
    if (hits > 0) counts.push({ tag, hits });
  }

  const seed = hashString(key);
  counts.sort((a, b) => {
    if (b.hits !== a.hits) return b.hits - a.hits;
    return ((hashString(key + a.tag) % 1000) - (hashString(key + b.tag) % 1000));
  });

  const chosen: PersonalityTag[] = counts.slice(0, 3).map((c) => c.tag);
  if (counts.filter((c) => c.hits >= 2).length < 2) {
    // Too little signal — fill deterministically from the pool.
    let i = 0;
    while (chosen.length < 3 && i < TAG_POOL.length * 2) {
      const candidate = TAG_POOL[(seed + i * 7) % TAG_POOL.length];
      if (!chosen.includes(candidate)) chosen.push(candidate);
      i++;
    }
  }
  return chosen.slice(0, 3);
}

export function deriveAlignment(tags: PersonalityTag[]): 'good' | 'neutral' | 'evil' {
  const evilScore = tags.filter((t) => ['ruthless', 'sadistic', 'treacherous'].includes(t)).length;
  const goodScore = tags.filter((t) => ['honorable', 'merciful', 'loyal'].includes(t)).length;
  if (evilScore > goodScore) return 'evil';
  if (goodScore > evilScore) return 'good';
  return 'neutral';
}

const ARCHETYPE_TABLE: [string, RegExp[]][] = [
  ['swordsman', [/sword/i, /blade/i, /katana/i, /saber/i, /duelist/i]],
  ['mage', [/archmage/i, /\bmage\b/i, /sorcer/i, /wizard/i, /witch/i, /\bmagic/i, /spellcaster/i, /alchemist/i]],
  ['ranged', [/sniper/i, /\bgun/i, /\barcher/i, /\bbow\b/i, /marksman/i, /sharpshooter/i, /gunslinger/i]],
  ['stealth', [/assassin/i, /ninja/i, /\bspy\b/i, /stealth/i, /thief/i, /hitman/i]],
  ['monster', [/monster/i, /\bbeast\b/i, /demon/i, /dragon/i, /giant/i, /titan/i, /kaiju/i, /vampire/i]],
  ['brawler', [/brawler/i, /martial/i, /\bfist/i, /boxer/i, /fighter/i, /wrestler/i]],
  ['leader', [/king/i, /queen/i, /emperor/i, /commander/i, /general/i, /leader/i, /lord/i]],
];

export function deriveArchetype(text: string): string {
  for (const [name, patterns] of ARCHETYPE_TABLE) {
    if (patterns.some((p) => p.test(text))) return name;
  }
  return 'fighter';
}

export function deriveKeyAbilityName(
  fields: { key?: string; notable?: string },
  abilities: AbilityMatch[],
): string {
  // A character's narrative "Noble Phantasm" should be a real technique. The
  // wiki's `Key` field lists forms or story arcs ("Pre-Training", "Beginning
  // of Timeskip"), so it is only a last resort before the generic default.
  const fromNotable = firstClause(fields.notable);
  if (fromNotable) return fromNotable;
  if (abilities.length) return abilities[0].name;
  const fromKey = firstClause(fields.key);
  if (fromKey) return fromKey;
  return 'their signature technique';
}

/** Function words that betray a sentence rather than a technique name. */
const PROSE_WORDS =
  /\b(?:the|a|an|of|and|or|but|while|when|where|allowing|allows|even|his|her|their|its|this|that|these|those|which|who|whom|whose|is|are|was|were|be|been|being|to|from|with|for|as|at|by|in|on|into|over|under|after|before|during|against|due|because|though|however)\b/i;

/**
 * Wiki fields open with prose as often as with a technique name
 * ("allowing for high-speed movement", "The fruit's major strength"). Only
 * accept a short, capitalised, markup-free phrase as a technique name.
 */
function looksLikeTechniqueName(clause: string): boolean {
  if (clause.length < 3 || clause.length > 40) return false;
  if (/[[\]{}<>"|=*]/.test(clause)) return false; // markup leftovers
  if (/https?:/i.test(clause)) return false;
  if (!/^[A-Z0-9]/.test(clause)) return false;
  const words = clause.split(/\s+/).filter(Boolean);
  if (words.length > 4) return false;
  if (words.length > 1 && PROSE_WORDS.test(clause)) return false;
  return true;
}

function firstClause(text: string | undefined): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/\([^)]*\)/g, ' ')
    .split(/[,;.\n·•|:]/)
    .map((s) => s.trim())
    .filter(looksLikeTechniqueName);
  return cleaned[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Fallback tier when no wiki page is found                            */
/* ------------------------------------------------------------------ */

/**
 * Fiction characters need a different ladder from real people: an unresolved
 * anime fighter is not a "historical human baseline". Missing wiki data used to
 * drop every failed lookup to 10-C, which is what made drafted Servants read as
 * ordinary humans. Fictional characters now floor at 9-C (street level) and the
 * keyword ladder recognises the archetypes that actually turn up in a draft.
 */
const FICTION_TIER_RULES: [RegExp, string][] = [
  [/\b(?:god|deity|goddess|cosmic|omnipotent|primordial|creator|godlike|world\s*eater|planet\s*buster)\b/i, '3-A'],
  [/\b(?:demon\s*lord|dragon|titan|kaiju|kami|archmage|demon\s*king|supreme\s*being)\b/i, '7-A'],
  [
    /\b(?:superhuman|supernatural|vampire|demon|devil|angel|spirit|mutant|alien|cyborg|android|monster|yokai|youkai|oni|shinigami|psychic|esper|immortal|immortality|cursed|regeneration)\b/i,
    '9-A',
  ],
  [
    /\b(?:wizard|mage|sorcerer|sorceress|witch|samurai|knight|swordsman|swordswoman|swordfighter|shinobi|ninja|martial\s*artist|monster\s*hunter|hero|heroine|champion|warrior\s*princess)\b/i,
    '9-B',
  ],
  [
    /\b(?:soldier|mercenary|assassin|hitman|gunslinger|sharpshooter|sniper|pirate|warrior|fighter|brawler|boxer|athlete|detective|thief|pilot|sailor|bounty\s*hunter|sword|blade|spear|archer|bowman|marksman|combatant)\b/i,
    '9-C',
  ],
];

/** Real-world figures keep the historic ladder; 10-C is the honest ceiling. */
const REAL_TIER_RULES: [RegExp, string][] = [
  [/\b(?:god|deity|goddess|cosmic|omnipotent|primordial|creator)\b/i, '3-A'],
  [/\b(?:demon lord|dragon|titan|kaiju|kami|archmage|world|planet)\b/i, '7-A'],
  [/\b(?:superhuman|supernatural|vampire|demon|angel|spirit|mutant|alien|cyborg|android)\b/i, '9-A'],
  [/\b(?:wizard|mage|sorcerer|ninja|samurai|knight|mythical hero)\b/i, '9-B'],
  [/\b(?:soldier|assassin|detective|hitman|gunslinger|fighter|warrior|pirate|athlete)\b/i, '10-B'],
];

export interface FallbackTier {
  tier: string;
  tierIndex: number;
  reason: string;
}

export function fallbackTier(text: string, options: { fiction?: boolean } = {}): FallbackTier {
  const rules = options.fiction ? FICTION_TIER_RULES : REAL_TIER_RULES;
  for (const [re, tier] of rules) {
    if (re.test(text ?? '')) {
      const index = TIER_INDEX(tier);
      return { tier, tierIndex: index, reason: `keyword match → ${tier}` };
    }
  }
  if (options.fiction) {
    return { tier: '9-C', tierIndex: TIER_INDEX('9-C'), reason: 'fictional fighter baseline → 9-C' };
  }
  return { tier: '10-C', tierIndex: TIER_INDEX('10-C'), reason: 'historical human baseline → 10-C' };
}

function TIER_INDEX(tier: string): number {
  const i = (TIERS as readonly string[]).indexOf(tier);
  return i === -1 ? 0 : i;
}

export interface FallbackScales {
  speed: ScaleParse;
  durability: ScaleParse;
  range: ScaleParse;
}

/** Derive speed/durability/range from a tier index when nothing else is known. */
export function scalesFromTier(tierIndex: number): FallbackScales {
  const tierNorm = norm(tierIndex, TIER_MAX_INDEX);
  const speedIndex = Math.round((tierNorm / 100) * 12 * 0.9); // ~Relativistic ceiling
  return {
    speed: { label: 'Unknown', index: speedIndex },
    durability: { label: 'Unknown', index: durabilityFromTierIndex(tierIndex) },
    range: { label: 'Unknown', index: Math.round(((durabilityFromTierIndex(tierIndex)) / LEVEL_MAX_INDEX) * 20) },
  };
}
