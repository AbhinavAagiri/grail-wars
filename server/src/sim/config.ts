/** Every tunable number the simulation uses. Weights live here on purpose. */

export const SCORE_WEIGHTS = {
  tier: 0.38,
  speed: 0.2,
  durability: 0.18,
  range: 0.06,
  intelligence: 0.08,
  hax: 0.1,
} as const;

/** Class advantage triangles: first beats second. */
export const CLASS_ADV_TRIANGLES: [string, string][] = [
  ['saber', 'lancer'],
  ['lancer', 'archer'],
  ['archer', 'saber'],
  ['rider', 'caster'],
  ['caster', 'assassin'],
  ['assassin', 'rider'],
  // Extra classes (off by default, switched on by the host).
  ['shielder', 'archer'],
  ['shielder', 'lancer'],
  ['berserker', 'shielder'],
  ['ruler', 'berserker'],
  ['ruler', 'avenger'],
  ['avenger', 'caster'],
  ['avenger', 'rider'],
];

/** Class passives, applied in score.effectiveScore and surfaced as modifiers. */
export const SHIELD_WALL_BONUS = 2;
export const AVENGER_GRUDGE_BONUS = 3;

export const CLASS_ADV = 3;

/** Below this score gap the outcome is a seeded coin-flip inside the band. */
export const TOSSUP = 3.0;

export const MARGIN_BANDS = {
  stomp: 20,
  clear: 10,
  narrow: 3,
} as const;

export const INJURY_PENALTY = 4;
export const MANA_LOW_THRESHOLD = 30;
export const MANA_PENALTY_RATE = 0.15;
export const AMBUSH_BONUS = 6;
export const TRAP_BONUS = 3;
export const BERSERKER_BONUS = 2;
export const BUFF_COMMAND_SPELL = 5;
export const SCOUT_BONUS = 2;
export const COUNTER_CAP = 8;
export const AMBUSH_ON_MASTER = 4;

export const MANA = {
  perFight: 10,
  berserkerPerFight: 20,
  highTierExtra: 5,
  highTierThresholdIndex: 16, // ~6-B and above
  restRecover: 30,
  nightfallRecover: 10,
  masterlessDrain: 3,
} as const;

/** Extra lethal events the Director may insert to hit the day's survivor target. */
export const EXTRA_LETHAL_BUDGET = 4;

/** Never repeat a template within this many events. */
export const TEMPLATE_FRESHNESS_WINDOW = 12;
export const FRESHNESS_MULTIPLIER = 0.3;

/** No pair may fight more than this many times (the finale is exempt). */
export const MAX_PAIR_ENCOUNTERS = 2;

export const CFG = {
  score: SCORE_WEIGHTS,
  tossup: TOSSUP,
  classAdv: CLASS_ADV,
  injuryPenalty: INJURY_PENALTY,
  mana: MANA,
  extraLethalBudget: EXTRA_LETHAL_BUDGET,
  freshnessWindow: TEMPLATE_FRESHNESS_WINDOW,
  freshnessMultiplier: FRESHNESS_MULTIPLIER,
  maxPairEncounters: MAX_PAIR_ENCOUNTERS,
} as const;
