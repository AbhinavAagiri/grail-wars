/**
 * Real-world political figures are not Grail War material.
 *
 * The Grail summons heroes, villains, legends and *characters*. A living
 * office-holder is none of those, and a real person the scaling engine has no
 * profile for also gets mismatched to whichever fictional character shares the
 * name — which is exactly what happened when a sitting vice president was
 * drafted and then powerscaled as a cartoon villain.
 *
 * Two nets, because one is not enough:
 *
 *   1. an explicit denylist of contemporary political figures, which works with
 *      no network at all and catches name variants ("J.D. Vance", "Donald J.
 *      Trump");
 *   2. a content rule for everyone else — a political office plus a modern
 *      (1900s+) date in the same biography. Historical rulers stay draftable
 *      (the history roster is built from monarchs and revolutionaries), so the
 *      rule deliberately keys on *modern* politics, and a page that reads as a
 *      fictional character is never refused.
 *
 * The game's own rosters and fallback list are exempt: those were already
 * filtered to pre-modern and legendary figures when they were built.
 */
import type { Character } from '@hgd/shared';
import { canonClassesFor, curatedClasses } from './classAffinity';
import { collectCharacterEvidence } from './index';
import { normalize } from '../util/text';
import politicalRaw from '../data/political-figures.json';

/* ------------------------------------------------------------------ */
/* Denylist                                                            */
/* ------------------------------------------------------------------ */

/** squashed name variant → the display name the list spells. */
const DENY = new Map<string, string>();

/**
 * The variants a name may be written in. Wiki titles keep middle initials and
 * punctuation that normalising does not remove ("J.D. Vance" → "j d vance"), so
 * both the fully squashed form and the form with single-letter tokens dropped
 * are indexed. Very short results are ignored so a two-letter surname cannot
 * collide with anything.
 */
export function nameVariants(name: string): Set<string> {
  const normal = normalize(name);
  const words = normal.split(' ').filter(Boolean);
  const out = new Set<string>();
  const squashed = words.join('');
  if (squashed.length >= 6) out.add(squashed);
  const collapsed = words.filter((word) => word.length > 1).join('');
  if (collapsed.length >= 6) out.add(collapsed);
  return out;
}

for (const raw of politicalRaw as string[]) {
  const label = String(raw ?? '').trim();
  if (!label) continue;
  for (const variant of nameVariants(label)) {
    if (!DENY.has(variant)) DENY.set(variant, label);
  }
}

/** The denylisted figure this name matches, if any. */
export function denylistedPoliticalFigure(name: string): string | undefined {
  for (const variant of nameVariants(name)) {
    const hit = DENY.get(variant);
    if (hit) return hit;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Content rule                                                        */
/* ------------------------------------------------------------------ */

/** Holding — or having held — a political office. */
const OFFICE_RE =
  /\b(?:politician|political (?:figure|leader)|senator|congressm(?:an|en)|congresswoman|representative|member of parliament|prime minister|\bmp\b|president|vice[- ]president|chancellor|premier|governor|mayor|secretary of state|secretary of defense|attorney general|party leader|head of state|head of government|statesm(?:an|en)|lawmaker|legislator|cabinet minister|parliament|white house|kremlin|downing street)\b/i;

/** A date that puts the person in modern politics. */
const MODERN_RE = /\b(?:19|20)\d{2}\b/;

/** A page that is about a character in a work of fiction, not a real person. */
const FICTIONAL_RE =
  /\b(?:fictional|fictitious|character (?:in|from|of|created)|portrayed by|voiced by|created by|comic book|anime and manga|manga series|video game series|light novel|television series)\b/i;

/**
 * True when a biography reads as a contemporary political figure: an office
 * plus a modern date, and no fictional framing. Julius Caesar ("Roman general
 * and statesman", no modern year) passes; JD Vance ("American politician …
 * born August 2, 1984") does not.
 */
export function looksLikeModernPoliticalFigure(text: string): boolean {
  if (!text) return false;
  if (FICTIONAL_RE.test(text)) return false;
  if (!OFFICE_RE.test(text)) return false;
  return MODERN_RE.test(text);
}

/** The same rule over a search result's title and blurb. */
export function looksLikePoliticalCandidate(name: string, blurb?: string): boolean {
  if (denylistedPoliticalFigure(name)) return true;
  return looksLikeModernPoliticalFigure(blurb ?? '');
}

/* ------------------------------------------------------------------ */
/* Draft gate                                                          */
/* ------------------------------------------------------------------ */

const REFUSAL = (name: string) =>
  `${name} is a real-world political figure — the Grail summons heroes, villains and legends, not modern politics. ` +
  'This game does not condone the use of political figures.';

/**
 * Characters the game's own data already vouches for: the rosters dealt by AI
 * Chooses, the built-in fallback list, the hand-written canon and every name a
 * roster mentions. They were screened when that data was written and a history
 * draft is *supposed* to contain rulers, so the content rule does not apply to
 * them (the name denylist still does). This is also what keeps the draft fast:
 * a curated pick never pays for a wiki lookup just to be checked twice.
 */
function isPreScreened(character: Character): boolean {
  if (character.provider === 'roster' || character.provider === 'fallback') return true;
  return canonClassesFor(character.name).length > 0 || curatedClasses(character.name).length > 0;
}

/**
 * Why this character cannot be drafted, or null when they can. Costs one wiki
 * lookup at most, and that lookup is the one the class verdict needs anyway.
 */
export async function politicalRefusal(character: Character): Promise<string | null> {
  if (denylistedPoliticalFigure(character.name)) return REFUSAL(character.name);
  if (isPreScreened(character)) return null;

  const evidence = await collectCharacterEvidence(character).catch(() => null);
  if (!evidence) return null;
  const page = evidence.vsb?.page;
  const text = [
    evidence.info.text,
    page?.categories?.join(' '),
    page?.fields.Classification,
    page?.fields['Standard Equipment'],
  ]
    .filter(Boolean)
    .join('. ');
  return looksLikeModernPoliticalFigure(text) ? REFUSAL(character.name) : null;
}
