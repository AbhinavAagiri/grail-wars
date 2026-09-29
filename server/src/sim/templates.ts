import type { Servant, Token } from '@hgd/shared';
import { CLASS_META } from '@hgd/shared';
import templatesRaw from '../data/templates.json';
import locationsRaw from '../data/locations.json';
import { normalize } from '../util/text';

export { WORLD_LOCATIONS, WAR_LOCATION_IDS, randomWarLocations, warLocationById } from './locations';

export interface TemplateRequirements {
  targetTag?: string[];
  actorTag?: string[];
  /** e.g. ">=8", "<=-4" */
  scoreGap?: string;
  targetInjuriesAtLeast?: number;
  needsAlliance?: boolean;
  needsGrudge?: boolean;
  metBefore?: boolean;
  classMismatch?: boolean;
  alignment?: 'good' | 'neutral' | 'evil';
  minAlive?: number;
  maxAlive?: number;
}

export interface TemplateEffects {
  duel?: boolean;
  lethal?: boolean;
  team?: boolean;
  chaos?: boolean;
  finale?: boolean;
  ambush?: boolean;
  scouted?: boolean;
  trap?: boolean;
  alliance?: boolean;
  allianceBreak?: boolean;
  betrayal?: boolean;
  injury?: number;
  heal?: boolean;
  rest?: boolean;
  buff?: boolean;
  morale?: number;
  manaDelta?: number;
  masterInjury?: boolean;
  masterKill?: boolean;
  grudgeAll?: boolean;
  manaAll?: number;
  flag?: string;
  /** explicit override: who dies without a duel */
  outcome?: 'actor_dies' | 'target_dies' | 'none';
}

export interface TemplateDef {
  id: string;
  category: string;
  weight: number;
  days: number[];
  roles: string[];
  requires?: TemplateRequirements;
  effects?: TemplateEffects;
  text: string[];
}

export interface LocationDef {
  id: string;
  name: string;
}

export const TEMPLATES = templatesRaw as TemplateDef[];
export const LOCATIONS = locationsRaw as LocationDef[];

export const TEMPLATE_BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

/** Templates never used directly by the scheduler; the Director picks them itself. */
export const RESERVED_CATEGORIES = new Set(['outcome', 'wish', 'finale']);

export function templatesInCategory(category: string): TemplateDef[] {
  return TEMPLATES.filter((t) => t.category === category);
}

export function locationName(id: string): string {
  return LOCATIONS.find((l) => l.id === id)?.name ?? 'the city';
}

export function randomLocationId(rng: () => number): string {
  return LOCATIONS[Math.floor(rng() * LOCATIONS.length)]?.id ?? LOCATIONS[0].id;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

export interface RenderContext {
  actor?: Servant;
  target?: Servant;
  ally?: Servant;
  winner?: Servant;
  loser?: Servant;
  location: string;
  survivors: number;
  day: number;
}

function classLabel(servant: Servant | undefined): string {
  if (!servant) return 'Servant';
  return CLASS_META[servant.cls].label;
}

function abilityName(servant: Servant | undefined): string {
  return servant?.profile?.keyAbilityName ?? 'their signature technique';
}

/**
 * Convert a template string into typed tokens. Unknown placeholders are
 * reported by `renderTemplate` as a null return so tests can catch authoring
 * mistakes instead of shipping literal "{FOO}" text.
 */
export function renderTemplate(text: string, ctx: RenderContext): Token[] | null {
  const tokens: Token[] = [];
  const re = /\{([A-Za-z_.]+)\}/g;
  let last = 0;
  let match: RegExpExecArray | null;

  const pushText = (value: string) => {
    if (!value) return;
    const prev = tokens[tokens.length - 1];
    if (prev && prev.t === 'text') prev.v += value;
    else tokens.push({ t: 'text', v: value });
  };

  const pushName = (servant: Servant | undefined) => {
    if (!servant) {
      pushText('a Servant');
      return;
    }
    tokens.push({ t: 'name', servantId: servant.id, v: servant.character.name });
  };

  const pushNp = (servant: Servant | undefined) => {
    tokens.push({ t: 'np', v: abilityName(servant) });
  };

  while ((match = re.exec(text)) !== null) {
    pushText(text.slice(last, match.index));
    const key = match[1];
    switch (key) {
      case 'A': pushName(ctx.actor); break;
      case 'B': pushName(ctx.target); break;
      case 'C': pushName(ctx.ally); break;
      case 'W': pushName(ctx.winner); break;
      case 'X': pushName(ctx.loser); break;
      case 'MA': pushText(ctx.actor?.masterName ?? 'their Master'); break;
      case 'MB': pushText(ctx.target?.masterName ?? 'their Master'); break;
      case 'MC': pushText(ctx.ally?.masterName ?? 'their Master'); break;
      case 'MW': pushText(ctx.winner?.masterName ?? 'their Master'); break;
      case 'ML': pushText(ctx.loser?.masterName ?? 'their Master'); break;
      case 'cA': pushText(classLabel(ctx.actor)); break;
      case 'cB': pushText(classLabel(ctx.target)); break;
      case 'cC': pushText(classLabel(ctx.ally)); break;
      case 'L': pushText(ctx.location); break;
      case 'NP_A': pushNp(ctx.actor); break;
      case 'NP_B': pushNp(ctx.target); break;
      case 'NP_C': pushNp(ctx.ally); break;
      case 'NP_W': pushNp(ctx.winner); break;
      case 'NP_X': pushNp(ctx.loser); break;
      case 'NP_L': pushNp(ctx.loser); break;
      case 'n': pushText(String(ctx.survivors)); break;
      case 'day': pushText(String(ctx.day)); break;
      default:
        return null;
    }
    last = match.index + match[0].length;
  }
  pushText(text.slice(last));
  return tokens;
}

/** Plain-text version of tokens (used for the LLM narration guard and tests). */
export function tokensToText(tokens: Token[]): string {
  return tokens.map((t) => t.v).join('');
}

/** Unresolved placeholders left in a rendered string, if any. */
export function unresolvedPlaceholders(tokens: Token[]): string[] {
  return tokens
    .map((t) => t.v)
    .join(' ')
    .match(/\{[^}]+\}/g) ?? [];
}

export function templateMatchesTags(servant: Servant, tags: string[] | undefined): boolean {
  if (!tags?.length) return true;
  const own = servant.profile?.tags ?? [];
  return tags.some((t) => own.includes(t as (typeof own)[number]));
}

export function normalizeTagList(tags: string[]): string[] {
  return tags.map((t) => normalize(t));
}
