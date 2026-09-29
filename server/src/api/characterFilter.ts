/**
 * Character-likeness heuristics for the draft search.
 *
 * The draft should only ever offer *people*: fictional characters from anime,
 * manga, film, TV and games, plus real historical and mythological figures.
 * Raw search APIs happily return the tool, the abstract noun and the car, so we
 * classify each candidate before it reaches the client.
 */
import type { Provider, SearchCandidate } from '@hgd/shared';
import { normalize, titleSimilarity } from '../util/text';

/** Databases that only ever contain characters or people. */
const TRUSTED_PROVIDERS = new Set<Provider>(['anilist', 'tmdb']);

/**
 * Titles that name a work, a setting or a product rather than a person:
 * "Naruto (Verse)", "Saber (software)", "Naruto: Ultimate Ninja Series"…
 */
const NON_CHARACTER_TITLES: RegExp[] = [
  /\([^)]*\b(?:verse|series|franchise|universe|company|software|program|language|album|film|movie|song|novel|game)\b[^)]*\)/i,
  /\b(?:ultimate ninja series|light novel|video game series|anime series|manga series|television series)\b/i,
];

export function hasNonCharacterTitle(name: string): boolean {
  return NON_CHARACTER_TITLES.some((re) => re.test(name));
}

/** Phrases that mark a page as something other than a person or character. */
const NON_CHARACTER_SIGNALS: RegExp[] = [
  /\bmay (?:also )?refer to\b/,
  /\bis the act of\b/,
  /\bis the practice of\b/,
  /\bis the process of\b/,
  /\bis the study of\b/,
  /\bis the science of\b/,
  /\bis the art of\b/,
  /\bis one of the\b/,
  /\bis (?:a|an) 20\d\d\b/,
  /\bis (?:a|an|the) (?:type|form|kind|class|genre|variant|species|subspecies|genus|family|order|breed|group|category|variety|term|word|concept|notion|practice|process|method|technique|procedure|style|branch|field|study|theory|system|algorithm|language|software|program|framework|protocol|format|brand|company|corporation|organization|agency|institution|city|town|village|country|nation|province|state|region|district|river|mountain|island|lake|sea|ocean|desert|forest|park|road|street|bridge|building|station|airport|port|museum|festival|holiday|event|sport|weapon|vehicle|automobile|car|truck|aircraft|airplane|ship|vessel|train|engine|machine|device|tool|appliance|product|food|dish|drink|beverage|disease|disorder|illness|condition|gene|protein|enzyme|element|compound|mineral|metal|material|fabric|colour|color|surname|nickname|acronym|abbreviation)\b/,
  /\b(?:surname|given name|family name|disambiguation|common noun|proper noun)\b/,
  /\b(?:animated|manga|anime|television|web) (?:series|film|movie|novel)\b/,
  /\b(?:film|movie|television series|manga series|anime series|video game|album|soundtrack|song|novel|franchise|light novel)\b/,
  // "X is a 2017 American action thriller film", "X is a travel technology company"
  /\bis (?:a|an|the) (?:\w+ ){0,4}(?:company|corporation|software|product|film|movie|series|album|song|game|vehicle|automobile|aircraft|weapon|city|country|language|program|brand)\b/,
];

/** Phrases that mark a page as a person, a character or a legend. */
const CHARACTER_SIGNALS: RegExp[] = [
  /\b(?:character|protagonist|antagonist|hero|heroine|villain|superhero|supervillain|antihero|supporting character)\b/,
  /\bfictional\b/,
  /\b(?:voiced by|portrayed by|created by|drawn by|debuted in|appears in)\b/,
  /\b(?:sorcerer|sorceress|wizard|witch|warlock|mage|magician|necromancer|druid|shaman|vampire|werewolf|demon|devil|angel|deity|god|goddess|spirit|monster|creature|dragon|mecha|android|cyborg|robot|alien|mutant|superhuman|shinobi|ninja|samurai|ronin|warrior|assassin|knight|paladin|swordsman|swordswoman|marksman|spearman|berserker|mercenary|pirate|hunter|gladiator|soldier|general|commander|warlord|admiral)\b/,
  /\b(?:king|queen|emperor|empress|prince|princess|duke|duchess|count|countess|lord|lady|shogun|pharaoh|monarch|ruler|tsar|sultan|khan|chancellor|president|prime minister|saint|prophet)\b/,
  /\b(?:mytholog|legend|legendary|folklore)\b/,
  /\b(?:is|was) an? (?:male|female)\b/,
  /\bborn (?:on |in |c\. |about )?\d{1,4}\b/,
  /\b(?:actor|actress|singer|musician|rapper|writer|author|novelist|poet|artist|painter|sculptor|philosopher|scientist|physicist|chemist|biologist|mathematician|politician|statesman|revolutionary|explorer|navigator|inventor|engineer|architect|athlete|boxer|wrestler|footballer|basketball player|baseball player|martial artist|military officer|businessman|entrepreneur|monk|priest)\b/,
];

function haystack(candidate: SearchCandidate): string {
  return `${candidate.name} ${candidate.blurb ?? ''}`.toLowerCase();
}

export function hasCharacterSignal(text: string): boolean {
  return CHARACTER_SIGNALS.some((re) => re.test(text));
}

export function hasNonCharacterSignal(text: string): boolean {
  return NON_CHARACTER_SIGNALS.some((re) => re.test(text));
}

/**
 * A page that describes a *work* rather than a person — "American Assassin is a
 * 2017 American action thriller film…". Stronger than a mere negative signal,
 * because the title itself can contain a character word ("…Assassin…").
 */
const WORK_SIGNALS: RegExp[] = [
  /\b(?:is|was) (?:a|an|the) (?:\w+ ){0,4}(?:film|movie|series|album|song|soundtrack|video game|novel|manga|anime|company|corporation|software|product|franchise|brand|program)\b/,
  /\b(?:television series|manga series|anime series|light novel|video game series|animated series)\b/,
];

export function hasWorkSignal(text: string): boolean {
  return WORK_SIGNALS.some((re) => re.test(text));
}

/** "Mitsubishi Lancer" / "Naruto Uzumaki" — a multi-word proper noun. */
function isMultiWordProperNoun(name: string): boolean {
  const bare = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const words = bare.split(/\s+/).filter((w) => /[a-z]{2,}/i.test(w));
  if (words.length < 2) return false;
  return words.every((w) => w[0] === w[0].toUpperCase());
}

/**
 * True when this candidate looks like a person or character rather than a
 * concept, work, place or product.
 */
export function isCharacterCandidate(candidate: SearchCandidate, _query: string): boolean {
  if (candidate.provider === 'custom' || candidate.provider === 'fallback') return true;
  if (TRUSTED_PROVIDERS.has(candidate.provider)) return true;

  // "(Verse)", "(software)", "… Series" pages are never people.
  if (hasNonCharacterTitle(candidate.name)) return false;

  const text = haystack(candidate);
  const negative = hasNonCharacterSignal(text);
  const positive = hasCharacterSignal(text);

  // A page that describes a film or a game is never a person, no matter what
  // character word its title happens to contain.
  if (hasWorkSignal(text)) return false;

  // VS Battles only hosts character profiles — be lenient, drop only clear noise.
  if (candidate.provider === 'vsb') return !(negative && !positive);

  // Wikipedia / Fandom: be strict. Reject anything clearly not a person, then
  // accept characters, people, and multi-word proper nouns (usually names).
  if (negative) return false;
  if (positive) return true;
  if (!candidate.blurb) return true;
  return isMultiWordProperNoun(candidate.name);
}

/** Higher is a better match. Used to sort the merged candidate list. */
export function characterScore(candidate: SearchCandidate, query: string): number {
  let score = titleSimilarity(query, candidate.name) * 40;

  // "Kirito (Post-Aincrad)" should beat an obscure "Kirito Kamui" when the
  // player simply typed the name.
  const asked = normalize(query);
  const stripped = normalize(candidate.name.replace(/\s*\([^)]*\)\s*$/, ''));
  if (stripped && stripped === asked) score += 25;

  // AniList answers to the character's official name, so "Kirito" comes back as
  // "Kazuto Kirigaya" with "Kirito" among its aliases. Ranking on the alias keeps
  // the entry — and its real artwork — in front of the player.
  if (
    candidate.aliases?.some((alias) => {
      const bare = normalize(alias.replace(/\s*\([^)]*\)\s*/g, ' '));
      return bare && bare === asked;
    })
  ) {
    score += 30;
  }

  switch (candidate.provider) {
    case 'anilist':
    case 'tmdb':
      score += 22;
      break;
    case 'vsb':
      score += 14;
      break;
    case 'fandom':
      score += 8;
      break;
    case 'fallback':
    case 'custom':
      score += 18;
      break;
    default:
      score += 3;
  }

  const text = haystack(candidate);
  if (hasCharacterSignal(text)) score += 6;
  if (hasNonCharacterSignal(text)) score -= 8;
  // "Kirito (Sword Art Online)" reads like a disambiguated character profile.
  if (/\(.+\)/.test(candidate.name)) score += 2;

  return score;
}
