/**
 * Servant-class eligibility.
 *
 * A Saber-class Servant is a swordsman; an Archer is someone who fights at
 * range. The draft used to ignore that entirely, which let players seat Saber
 * from Fate in the Archer slot. This module decides which classes a character
 * actually qualifies for, in priority order:
 *
 *   1. the hand-curated canon (server/src/data/class-canon.json) — authoritative
 *   2. curated rosters (the same data the AI-Chooses draft deals from), as a
 *      floor rather than a ceiling: the wiki evidence may add classes, never
 *      remove one the roster vouched for
 *   3. the character's VS Battles page — categories like "Sword Users",
 *      "Spear Users" or "Shield Users", plus Classification, Standard Equipment
 *      and the powers list
 *   4. their AniList / Fandom / Wikipedia prose
 *   5. their own name
 *
 * A verdict is cached per character. Strictness is deliberate: a character the
 * game cannot place at all is refused rather than drafted into a class that
 * would make no sense — but a character something *did* place, however they
 * were filed, keeps every class the evidence supports, so a scraped roster can
 * no longer pin Kirito to Shielder and refuse him the Saber slot.
 */
import { CLASSES, type Character, type ServantClass } from '@hgd/shared';
import { canonEntryFor } from '../data/canon';
import { getCachedSearch, setCachedSearch } from './cache';
import { normalize } from '../util/text';
import { collectCharacterEvidence } from './index';
import fallbackCharacters from '../data/fallback-characters.json';
import rosterAnime from '../data/roster-anime.json';
import rosterHistory from '../data/roster-history.json';

/* ------------------------------------------------------------------ */
/* Curated rosters                                                     */
/* ------------------------------------------------------------------ */

interface RosterEntry {
  name: string;
  source?: string;
}

type RosterFile = Record<string, RosterEntry[]>;

const FALLBACKS = fallbackCharacters as RosterFile;
const ROSTERS: RosterFile[] = [rosterAnime as RosterFile, rosterHistory as RosterFile];

/** name (normalised) → the classes the rosters say the character fits. */
const CURATED: Map<string, Set<ServantClass>> = (() => {
  const map = new Map<string, Set<ServantClass>>();
  const add = (cls: ServantClass, name: string) => {
    const key = normalize(name);
    if (!key) return;
    const set = map.get(key) ?? new Set<ServantClass>();
    set.add(cls);
    map.set(key, set);
  };
  for (const file of [FALLBACKS, ...ROSTERS]) {
    for (const cls of CLASSES) {
      for (const entry of file[cls] ?? []) add(cls, entry.name);
    }
  }
  return map;
})();

/** The classes a name is already known to fit, if any. */
export function curatedClasses(name: string): ServantClass[] {
  const set = CURATED.get(normalize(name));
  return set ? CLASSES.filter((cls) => set.has(cls)) : [];
}

/**
 * The canon's classes for a name, if it is listed there. Canon is authoritative:
 * it both adds classes the scrapes missed (Kirito, Saber) and removes ones they
 * got wrong (Rin Tohsaka, Avenger).
 */
export function canonClassesFor(name: string): ServantClass[] {
  return canonEntryFor(name)?.classes ?? [];
}

/* ------------------------------------------------------------------ */
/* Trait fingerprints                                                  */
/* ------------------------------------------------------------------ */

/**
 * Signature of each class, matched against a character's name, wiki categories
 * and prose. Deliberately generous: a character may qualify for several classes
 * (a knight-king can be Saber or Ruler), and only genuinely unplaceable
 * characters end up with no class at all.
 */
export const CLASS_TRAITS: Record<ServantClass, RegExp> = {
  saber:
    /\b(?:sword\w*|blade\w*|katana|rapier|sabre|saber|duelist\w*|swordsm\w*|swordswom\w*|knights?|samurai|kendo|fenc(?:ing|er)|jian|odachi|wakizashi)\b/i,
  archer:
    /\b(?:bow\w*|arrow\w*|archer\w*|archeresses|marksm\w*|sniper\w*|sniping|sharpshoot\w*|guns?|gunsling\w*|firearms?|rifles?|pistols?|revolvers?|handguns?|muskets?|cannons?|artiller\w*|javelin\w*|crossbows?|longbows?|projectiles?|throwing\s+(?:knives|stars|spears|axes))\b/i,
  lancer:
    /\b(?:spear\w*|lance|laun?cer\w*|halberds?|naginata|polearms?|tridents?|glaives?|pikes?|partisans?|yari)\b/i,
  rider:
    /\b(?:riders?|rid(?:es|ing|den)|mounts?|steeds?|horses?|cavalr\w*|chariots?|sailor\w*|ships?|fleets?|pilots?|aircraft|vehicles?|motorcycles?|expeditions?|voyages?|navigat\w*|conquer\w*|emperors?|empresses?|dragon\s+rider|wyvern\s+rider)\b/i,
  caster:
    /\b(?:mag(?:e|es|ic|ical|us|i)\b|sorcer\w*|wizards?|witches|spells?|spellcasting|magecraft|alchem\w*|necromanc\w*|summoners?|scientists?|inventors?|mathematicians?|physicists?|scholars?|strategists?|illusions?|psychics?|espers?|telekinesis|shamans?|priestesses|oracles?)\b/i,
  assassin:
    /\b(?:assassins?|assassination\w*|stealth\w*|ninja\w*|shinobi|spies|spy\b|espionage|poisons?|venoms?|toxins?|backstab\w*|thieves|thief\b|burglar\w*|hitmen|hitman|infiltrat\w*|guerrilla\w*|shadow\s+(?:stalker|killer))\b/i,
  berserker:
    /\b(?:berserk\w*|rages?|raging|enraged|fury|madness|monsters?|beasts?|demons?|devils?|titans?|kaiju|yokai|youkai|oni\b|vampires?|werewolves?|brawlers?|martial\s+art\w*|fighters?|boxers?|wrestlers?|brutes?|unarmed|gladiators?|ogres?|dragons?)\b/i,
  shielder:
    /\b(?:shields?|bulwarks?|aegis|guardians?|bodyguards?|protectors?|defenders?|defensive|defence|defense|armou?r\w*|fortresses?|sentinels?|paladins?)\b/i,
  ruler:
    /\b(?:kings?|queens?|emperors?|empresses?|pharaohs?|monarchs?|rulers?|sovereigns?|judges?|saints?|popes?|deities|deity|divine\s+authority|overseers?|leaders?|commanders?|generals?|warlords?|statesm\w*|politicians?|presidents?|prime\s+minister)\b/i,
  avenger:
    /\b(?:aveng\w*|vengeance|vengeful|revenge|grudges?|hatred|hates?|curses?|cursed|malice|resentment|betrays?|betrayal|wronged|revolutionar\w*|rebels?|insurgents?|vigilantes?)\b/i,
};

/* ------------------------------------------------------------------ */
/* Verdicts                                                            */
/* ------------------------------------------------------------------ */

export type ClassEvidence = 'curated' | 'wiki' | 'name' | 'bio' | 'none';

export interface ClassVerdict {
  classes: ServantClass[];
  verified: boolean;
  evidence: ClassEvidence;
}

const UNVERIFIED: ClassVerdict = { classes: [], verified: false, evidence: 'none' };

function remember(character: Character, verdict: ClassVerdict): ClassVerdict {
  setCachedSearch(`class-verdict:${character.key}`, verdict);
  return verdict;
}

export interface ClassEvidenceInput {
  categories?: string[];
  classification?: string;
  equipment?: string;
  powers?: string;
  notable?: string;
  bio?: string;
}

/**
 * Judge a character from their evidence. Artoria's page names Berserker,
 * Assassin and Caster as the opponents she has fought, so the 
 * categories/classification/equipment are read first and only prose is
 * consulted when they say nothing.
 */
export function verdictFromEvidence(characterName: string, evidence: ClassEvidenceInput): ClassVerdict {
  const strong = [characterName, evidence.categories?.join(' '), evidence.classification, evidence.equipment]
    .filter(Boolean)
    .join('. ');
  const weak = [evidence.powers, evidence.notable, evidence.bio].filter(Boolean).join('. ');
  const hasWiki = Boolean(evidence.categories?.length || evidence.classification || evidence.equipment);

  const strongClasses = CLASSES.filter((cls) => CLASS_TRAITS[cls].test(strong));
  if (strongClasses.length) {
    return { classes: strongClasses, verified: true, evidence: hasWiki ? 'wiki' : 'name' };
  }
  const weakClasses = CLASSES.filter((cls) => CLASS_TRAITS[cls].test(weak));
  if (weakClasses.length) return { classes: weakClasses, verified: true, evidence: 'bio' };
  return { classes: [], verified: false, evidence: 'none' };
}

/**
 * Fold the curated rosters into a wiki verdict. The rosters are treated as a
 * floor: whatever they vouched for stays available, and anything the evidence
 * proves is added to it. A character only fails when neither source places them.
 */
export function combineClassVerdicts(curated: ServantClass[], verdict: ClassVerdict): ClassVerdict {
  const classes = CLASSES.filter((cls) => curated.includes(cls) || verdict.classes.includes(cls));
  if (!classes.length) return { classes: [], verified: false, evidence: 'none' };
  return { classes, verified: true, evidence: curated.length ? 'curated' : verdict.evidence };
}

/**
 * Which classes a character may be drafted as.
 *
 * `cls` is the class the player asked for. When the fast sources (canon, then
 * the curated rosters) already allow it, no wiki lookup happens at all — the
 * draft stays quick for the characters the game shipped with. Only a pick that
 * those sources would refuse pays for the evidence check, and its answer is
 * merged with what the rosters said rather than replacing it.
 */
export async function classVerdictFor(character: Character, cls?: ServantClass): Promise<ClassVerdict> {
  const cacheKey = `class-verdict:${character.key}`;
  const cached = getCachedSearch<ClassVerdict>(cacheKey);
  if (cached && (!cls || cached.classes.includes(cls))) return cached;

  const canon = canonClassesFor(character.name);
  if (canon.length) return remember(character, { classes: canon, verified: true, evidence: 'curated' });

  const curated = curatedClasses(character.name);
  if (curated.length && (!cls || curated.includes(cls))) {
    return remember(character, { classes: curated, verified: true, evidence: 'curated' });
  }

  const evidence = await collectCharacterEvidence(character).catch(() => null);
  const page = evidence?.vsb?.page;
  const verdict = verdictFromEvidence(character.name, {
    categories: page?.categories,
    classification: page?.fields.Classification,
    equipment: page?.fields['Standard Equipment'],
    powers: page?.fields['Powers and Abilities'],
    notable: page?.fields['Notable Attacks/Techniques'],
    bio: evidence?.info.text ?? '',
  });
  return remember(character, combineClassVerdicts(curated, verdict));
}

/** How the refusal reads in the draft. */
export function classRefusal(character: Character, verdict: ClassVerdict): string {
  if (!verdict.verified) {
    return `We couldn't confirm how ${character.name} fights, so the draft refused them. Try a character with a known style.`;
  }
  return `${character.name} can only be drafted as ${verdict.classes
    .map((cls) => cls[0]!.toUpperCase() + cls.slice(1))
    .join(' or ')} — their fighting style doesn't fit this class.`;
}
