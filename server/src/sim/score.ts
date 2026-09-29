import type { Margin, Profile, ServantClass, WorldServantState } from '@hgd/shared';
import countersRaw from '../data/counters.json';
import { clamp } from '../util/text';
import {
  AMBUSH_ON_MASTER,
  AVENGER_GRUDGE_BONUS,
  BERSERKER_BONUS,
  BUFF_COMMAND_SPELL,
  CLASS_ADV,
  CLASS_ADV_TRIANGLES,
  COUNTER_CAP,
  INJURY_PENALTY,
  MANA_LOW_THRESHOLD,
  MANA_PENALTY_RATE,
  MARGIN_BANDS,
  SCOUT_BONUS,
  SCORE_WEIGHTS,
  SHIELD_WALL_BONUS,
  TRAP_BONUS,
  TOSSUP,
} from './config';
import {
  LEVEL_MAX_INDEX,
  RANGE_MAX_INDEX,
  SPEED_MAX_INDEX,
  TIER_MAX_INDEX,
  norm,
} from '../research/tiers';

export type Rng = () => number;

export interface Modifier {
  label: string;
  value: number;
}

/**
 * The Oracle score shown in the Power Review.
 * Weights live in sim/config.ts so the balance can be tuned in one place.
 */
export function baseScore(p: Pick<Profile, 'tierIndex' | 'speedIndex' | 'durabilityIndex' | 'rangeIndex' | 'intelligenceIndex' | 'haxScore'>): number {
  const score =
    SCORE_WEIGHTS.tier * norm(p.tierIndex, TIER_MAX_INDEX) +
    SCORE_WEIGHTS.speed * norm(p.speedIndex, SPEED_MAX_INDEX) +
    SCORE_WEIGHTS.durability * norm(p.durabilityIndex, LEVEL_MAX_INDEX) +
    SCORE_WEIGHTS.range * norm(p.rangeIndex, RANGE_MAX_INDEX) +
    SCORE_WEIGHTS.intelligence * norm(p.intelligenceIndex, 100) +
    SCORE_WEIGHTS.hax * norm(p.haxScore, 100);
  return Math.round(clamp(score, 0, 100) * 10) / 10;
}

/** +CLASS_ADV when self's class beats the opponent's, −CLASS_ADV when it loses. */
export function classModifier(a: ServantClass, b: ServantClass, enabled: boolean): number {
  if (!enabled || a === b) return 0;
  for (const [beats, loses] of CLASS_ADV_TRIANGLES) {
    if (a === beats && b === loses) return CLASS_ADV;
    if (a === loses && b === beats) return -CLASS_ADV;
  }
  return 0;
}

export function classRelation(a: ServantClass, b: ServantClass): 'advantage' | 'disadvantage' | 'neutral' {
  const m = classModifier(a, b, true);
  if (m > 0) return 'advantage';
  if (m < 0) return 'disadvantage';
  return 'neutral';
}

export function manaPenalty(mana: number): number {
  if (mana >= MANA_LOW_THRESHOLD) return 0;
  return (MANA_LOW_THRESHOLD - mana) * MANA_PENALTY_RATE;
}

export function moraleModifier(morale: number): number {
  return clamp(morale, -2, 2);
}

interface CounterRule {
  id: string;
  if: string[];
  andMissingInB?: string[];
  andAnyInB?: string[];
  bonus: number;
  label: string;
}

const COUNTER_RULES = countersRaw as CounterRule[];

function hasAny(abilities: string[], names: string[]): string | null {
  const lowered = abilities.map((a) => a.toLowerCase());
  for (const name of names) {
    if (lowered.some((a) => a.includes(name.toLowerCase()))) return name;
  }
  return null;
}

/**
 * Ability-based counter bonus. Every applied rule becomes a visible modifier so
 * the "Why?" panel can explain it.
 */
export function counterModifiers(
  a: Pick<Profile, 'abilities'>,
  b: Pick<Profile, 'abilities'>,
): Modifier[] {
  const out: Modifier[] = [];
  let total = 0;
  for (const rule of COUNTER_RULES) {
    if (total >= COUNTER_CAP) break;
    const hit = hasAny(a.abilities, rule.if);
    if (!hit) continue;
    if (rule.andMissingInB && hasAny(b.abilities, rule.andMissingInB)) continue;
    if (rule.andAnyInB && !hasAny(b.abilities, rule.andAnyInB)) continue;
    const value = Math.min(rule.bonus, COUNTER_CAP - total);
    if (value <= 0) continue;
    total += value;
    out.push({ label: rule.label, value });
  }
  return out;
}

export interface Combatant {
  id: string;
  cls: ServantClass;
  profile: Profile;
  state: WorldServantState;
}

export interface EffectiveContext {
  classAdvantage: boolean;
  opponent: Combatant;
  /** attacker in an ambush-capable event */
  attacking?: boolean;
  ambush?: boolean;
  trap?: number;
  goreLevel?: 'standard' | 'mild';
}

export interface EffectiveResult {
  score: number;
  modifiers: Modifier[];
}

/** effective(A, vs B) — Section 13.2 of the spec. */
export function effectiveScore(self: Combatant, ctx: EffectiveContext): EffectiveResult {
  const modifiers: Modifier[] = [];
  let score = self.profile.baseScore;

  const cls = classModifier(self.cls, ctx.opponent.cls, ctx.classAdvantage);
  if (cls !== 0) {
    modifiers.push({ label: `Class advantage (${self.cls} vs ${ctx.opponent.cls})`, value: cls });
    score += cls;
  }

  if (self.state.injuries > 0) {
    const value = -INJURY_PENALTY * self.state.injuries;
    modifiers.push({ label: `Injuries (${self.state.injuries})`, value });
    score += value;
  }

  const mana = manaPenalty(self.state.mana);
  if (mana > 0) {
    const value = -Math.round(mana * 10) / 10;
    modifiers.push({ label: `Low mana (${Math.round(self.state.mana)})`, value });
    score += value;
  }

  const morale = moraleModifier(self.state.morale);
  if (morale !== 0) {
    modifiers.push({ label: `Morale ${morale > 0 ? 'high' : 'low'}`, value: morale });
    score += morale;
  }

  for (const m of counterModifiers(self.profile, ctx.opponent.profile)) {
    modifiers.push(m);
    score += m.value;
  }

  if (ctx.attacking && ctx.ambush) {
    const isAssassin = self.cls === 'assassin' || self.profile.archetype === 'stealth';
    const value = isAssassin ? 6 : 3;
    modifiers.push({ label: isAssassin ? 'Assassin ambush' : 'Ambush', value });
    score += value;
  }

  if (ctx.trap) {
    const value = Math.min(ctx.trap, TRAP_BONUS);
    if (value > 0) {
      modifiers.push({ label: 'Prepared trap', value });
      score += value;
    }
  }

  if (self.state.buffNextFight > 0) {
    modifiers.push({ label: 'Command Spell boost', value: self.state.buffNextFight });
    score += self.state.buffNextFight;
  }

  if (self.state.scoutedTargets.includes(ctx.opponent.id)) {
    modifiers.push({ label: 'Scouted this opponent', value: SCOUT_BONUS });
    score += SCOUT_BONUS;
  }

  if (self.cls === 'berserker') {
    modifiers.push({ label: 'Berserker madness', value: BERSERKER_BONUS });
    score += BERSERKER_BONUS;
  }

  // Shielder: the class passive only applies while they are being attacked.
  if (self.cls === 'shielder' && !ctx.attacking) {
    modifiers.push({ label: 'Shield wall', value: SHIELD_WALL_BONUS });
    score += SHIELD_WALL_BONUS;
  }

  // Avenger: vengeance is literal fuel — grudges become attack power.
  if (self.cls === 'avenger' && self.state.grudges.includes(ctx.opponent.id)) {
    modifiers.push({ label: "Avenger's grudge", value: AVENGER_GRUDGE_BONUS });
    score += AVENGER_GRUDGE_BONUS;
  }

  // Tier gap is surfaced explicitly so the explanation names the real reason.
  const tierGap = self.profile.tierIndex - ctx.opponent.profile.tierIndex;
  if (Math.abs(tierGap) >= 3) {
    modifiers.push({
      label: `Tier ${self.profile.tierPeak} vs ${ctx.opponent.profile.tierPeak}`,
      value: 0,
    });
  }

  return { score: Math.round(score * 10) / 10, modifiers };
}

export function marginFromDiff(diff: number): Margin {
  const abs = Math.abs(diff);
  if (abs >= MARGIN_BANDS.stomp) return 'stomp';
  if (abs >= MARGIN_BANDS.clear) return 'clear';
  if (abs >= MARGIN_BANDS.narrow) return 'narrow';
  return 'razor';
}

export type DuelOutcomeKind =
  | 'kill'
  | 'retreat'
  | 'stalemate'
  | 'mutual'
  | 'mercy'
  | 'escape'
  | 'master_kill';

export interface DuelContext {
  rng: Rng;
  lethal: boolean;
  classAdvantage: boolean;
  commandSpellRescues: boolean;
  /** only one mutual destruction per war */
  allowMutual: boolean;
  ambush?: boolean;
  trap?: number;
  /** finale: no mercy, no Command Spell rescue, no mutual destruction */
  decisive?: boolean;
}

export interface DuelResult {
  winnerId: string | null;
  loserId: string | null;
  outcome: DuelOutcomeKind;
  margin: Margin;
  ea: number;
  eb: number;
  tossUp: boolean;
  modifiers: Modifier[];
  /** winner's explanation-facing label for the losing side */
  detail: string;
}

function hasTag(profile: Profile, tags: string[]): boolean {
  return tags.some((t) => profile.tags.includes(t as Profile['tags'][number]));
}

/**
 * Resolve a 1v1. Outcomes are power-scaled with explicit modifiers; randomness
 * only appears inside the narrow toss-up band and is always seeded.
 */
export function resolveDuel(a: Combatant, b: Combatant, ctx: DuelContext): DuelResult {
  const eaRes = effectiveScore(a, {
    classAdvantage: ctx.classAdvantage,
    opponent: b,
    attacking: true,
    ambush: ctx.ambush,
    trap: ctx.trap,
  });
  const ebRes = effectiveScore(b, {
    classAdvantage: ctx.classAdvantage,
    opponent: a,
  });

  const ea = eaRes.score;
  const eb = ebRes.score;
  const diff = ea - eb;
  const margin = marginFromDiff(diff);

  let winnerIsA: boolean;
  let tossUp = false;
  if (Math.abs(diff) >= TOSSUP) {
    winnerIsA = diff > 0;
  } else {
    tossUp = true;
    const p = 0.5 + diff / (2 * TOSSUP);
    winnerIsA = ctx.rng() < p;
  }

  const winner = winnerIsA ? a : b;
  const loser = winnerIsA ? b : a;
  const modifiers: Modifier[] = [
    ...eaRes.modifiers,
    { label: '---', value: 0 },
    ...ebRes.modifiers.map((m) => ({ label: `${m.label} (opponent)`, value: -m.value })),
  ].filter((m) => m.label !== '---');

  const base = {
    winnerId: winner.id,
    loserId: loser.id,
    margin,
    ea,
    eb,
    tossUp,
    modifiers,
  };

  if (!ctx.lethal) {
    if (margin === 'razor') {
      return { ...base, outcome: 'stalemate', detail: 'Neither could land a decisive blow.' };
    }
    return { ...base, outcome: 'retreat', detail: 'The loser disengages.' };
  }

  // Mutual destruction: rare, only in razor-thin lethal fights between hotheads.
  const reckless = (c: Combatant) =>
    c.cls === 'berserker' || hasTag(c.profile, ['reckless', 'prideful']);
  if (!ctx.decisive && ctx.allowMutual && margin === 'razor' && reckless(a) && reckless(b)) {
    return {
      ...base,
      winnerId: null,
      loserId: null,
      outcome: 'mutual',
      detail: 'Both fighters kill each other in the exchange.',
    };
  }

  // Mercy: a dominant, honorable winner lets a non-treacherous loser crawl away.
  const merciful = hasTag(winner.profile, ['merciful', 'honorable']);
  const loathsome = hasTag(loser.profile, ['treacherous', 'sadistic']);
  if (!ctx.decisive && (margin === 'stomp' || margin === 'clear') && merciful && !loathsome) {
    return { ...base, outcome: 'mercy', detail: `${winner.profile.name} spares ${loser.profile.name}.` };
  }

  // Command Spell rescue: once per Servant per war.
  if (!ctx.decisive && ctx.commandSpellRescues && margin !== 'stomp' && loser.state.masterAlive && loser.state.commandSpellsLeft >= 1 && !loser.state.rescueUsed) {
    return {
      ...base,
      outcome: 'escape',
      detail: `${loser.profile.name}'s Master burns a Command Spell to drag them out alive.`,
    };
  }

  return { ...base, outcome: 'kill', detail: `${winner.profile.name} kills ${loser.profile.name}.` };
}

/**
 * Team-up: max(a1,a2) + 0.35 * min(a1,a2) against the target.
 * Returns the team's effective score.
 */
export function teamEffective(team: EffectiveResult[]): number {
  if (!team.length) return 0;
  const scores = team.map((t) => t.score).sort((x, y) => y - x);
  if (scores.length === 1) return scores[0];
  return scores[0] + 0.35 * scores[1];
}

/** Master assassination: assassin slips past the Servant to kill the Master. */
export function canAssassinateMaster(
  attacker: Combatant,
  target: Combatant,
  ctx: { ambush?: boolean; classAdvantage: boolean },
): { ok: boolean; ea: number; eb: number } {
  const stealth = attacker.cls === 'assassin' || attacker.profile.archetype === 'stealth';
  if (!stealth || !target.state.masterAlive) return { ok: false, ea: 0, eb: 0 };
  const exposed = target.state.injuries >= 2 || target.state.mana < 40;
  if (!exposed) return { ok: false, ea: 0, eb: 0 };
  const eaRes = effectiveScore(attacker, {
    classAdvantage: ctx.classAdvantage,
    opponent: target,
    attacking: true,
    ambush: true,
  });
  const ebRes = effectiveScore(target, { classAdvantage: ctx.classAdvantage, opponent: attacker });
  const ea = eaRes.score + AMBUSH_ON_MASTER;
  return { ok: ea > ebRes.score, ea, eb: ebRes.score };
}
