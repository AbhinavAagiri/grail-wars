import type {
  Character,
  EventBanner,
  EventPhaseName,
  Margin,
  Profile,
  RoomSettings,
  Servant,
  Token,
  WarDay,
  WarEvent,
  WarLocation,
  WarTimeline,
} from '@hgd/shared';
import { WISH_TEMPLATES } from '@hgd/shared';
import {
  deathNoticeTokens,
  nightfallTokens as narrationNightfallTokens,
  prologueTokens,
  vantageTokens,
  wishLine,
} from './narration';
import seedrandom from 'seedrandom';
import { EXTRA_LETHAL_BUDGET, MAX_PAIR_ENCOUNTERS, TEMPLATE_FRESHNESS_WINDOW } from './config';
import {
  effectiveScore,
  resolveDuel,
  teamEffective,
  type Combatant,
  type DuelResult,
  type Rng,
} from './score';
import {
  TEMPLATE_BY_ID,
  locationName,
  randomLocationId,
  renderTemplate,
  type RenderContext,
  type TemplateDef,
} from './templates';
import {
  addGrudge,
  addTrap,
  adjustMana,
  adjustMorale,
  allianceOf,
  breakAlliance,
  encounterCount,
  expireAlliances,
  fightManaCost,
  formAlliance,
  getServant,
  getState,
  hasGrudge,
  heal,
  injure,
  initialState,
  kill,
  livingCount,
  livingIds,
  markScouted,
  metBefore,
  nightfallRecovery,
  noteAppearance,
  recordEncounter,
  resetAppearances,
  type WorldState,
} from './world';

export interface DirectorInput {
  servants: Servant[];
  settings: RoomSettings;
  seed: number;
  unsummoned: Character[];
  /** the real-world city the war is fought in, if the room resolved one */
  warLocation?: WarLocation | null;
}

/* ------------------------------------------------------------------ */
/* Acts                                                                */
/* ------------------------------------------------------------------ */

interface Act {
  title: string;
  weights: Record<string, number>;
}

const ACT1: Act = {
  title: 'Summoning & Scouting',
  weights: { scouting: 20, social: 20, alliance: 10, flavor: 20, master: 15, skirmish: 15 },
};
const ACT2: Act = {
  title: 'First Blood',
  weights: {
    skirmish: 15, duel: 15, scouting: 10, social: 15, master: 15,
    environmental: 10, flavor: 10, hunt: 10,
  },
};
const ACT3: Act = {
  title: 'Alliances & Betrayals',
  weights: {
    duel: 15, skirmish: 10, betrayal: 15, alliance: 10, global: 10,
    master: 15, hunt: 10, flavor: 10, teamup: 5,
  },
};
const ACT4: Act = {
  title: 'The Grail Stirs',
  weights: {
    duel: 20, skirmish: 15, master_hunt: 15, rematch: 15, global: 10,
    environmental: 10, flavor: 10, chaos: 5,
  },
};
const ACT5: Act = {
  title: 'The Final Night',
  weights: { duel: 40, skirmish: 20, rematch: 15, personal: 15, global: 10 },
};

const ACTS = [ACT1, ACT2, ACT3, ACT4, ACT5];

/**
 * Templates are authored against a five-act structure. Wars of 3 or 7 days are
 * mapped onto that scale so every act's templates stay reachable:
 * first day = Act 1, last = Act 5, second-to-last = Act 4, and the days between
 * alternate Acts 2 and 3.
 */
export function actDayOf(day: number, totalDays: number): number {
  if (totalDays <= 1) return 5;
  if (day <= 1) return 1;
  if (day >= totalDays) return 5;
  if (day === totalDays - 1) return 4;
  return day % 2 === 0 ? 2 : 3;
}

export function actForDay(day: number, totalDays: number): Act {
  return ACTS[actDayOf(day, totalDays) - 1];
}

const FIGHT_CATEGORIES = new Set([
  'skirmish', 'duel', 'hunt', 'rematch', 'teamup', 'chaos', 'master_hunt', 'betrayal',
]);
const NON_LETHAL_ON_DAY_1 = new Set([
  'duel', 'hunt', 'rematch', 'teamup', 'chaos', 'master_hunt', 'betrayal',
]);
const CALM_CATEGORIES = ['social', 'flavor', 'master', 'scouting', 'rest', 'personal', 'environmental', 'trap'];

/* ------------------------------------------------------------------ */
/* Death schedule                                                      */
/* ------------------------------------------------------------------ */

/** Survivor targets at the END of each day (Section 13.5). */
export function deathSchedule(n: number, days: number): number[] {
  if (days <= 0) return [];
  if (n <= 1) return new Array(days).fill(1);
  const curve = (x: number) => Math.pow(x, 1.6);
  const targets: number[] = [];
  for (let d = 1; d <= days; d++) {
    if (d === days) targets.push(1);
    else if (d === days - 1) targets.push(Math.min(2, n - 1));
    else targets.push(Math.round(n - (n - 1) * curve(d / days)));
  }
  targets[0] = n <= 3 ? n : n - 1;
  for (let i = 0; i < days; i++) {
    targets[i] = Math.max(1, Math.min(n, targets[i]));
    if (i > 0 && targets[i] > targets[i - 1]) targets[i] = targets[i - 1];
  }
  return targets;
}

/* ------------------------------------------------------------------ */
/* Random helpers                                                      */
/* ------------------------------------------------------------------ */

function randInt(rng: Rng, min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function pick<T>(rng: Rng, list: readonly T[]): T {
  if (!list.length) throw new Error('pick() on an empty list');
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

function weightedPick<T>(rng: Rng, items: readonly T[], weightOf: (item: T) => number): T | null {
  let total = 0;
  const weights = items.map((item) => {
    const w = Math.max(0, weightOf(item));
    total += w;
    return w;
  });
  if (total <= 0) return null;
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

function shuffle<T>(rng: Rng, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function fallbackProfile(servant: Servant): Profile {
  return {
    key: servant.character.key,
    name: servant.character.name,
    source: servant.character.source,
    tierPeak: 'Unknown', tierBase: 'Unknown', tierIndex: 0,
    speed: 'Unknown', speedIndex: 0,
    durability: 'Unknown', durabilityIndex: 0,
    range: 'Unknown', rangeIndex: 0,
    intelligence: 'Average', intelligenceIndex: 45,
    abilities: [], keyAbilityName: 'their signature technique',
    weaknesses: [], archetype: 'fighter',
    tags: ['stoic'], alignment: 'neutral', haxScore: 0,
    confidence: 'low', sources: [], baseScore: 30,
  };
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export function runSimulation(input: DirectorInput): WarTimeline {
  const { servants, settings, seed, unsummoned } = input;
  const warLocation = input.warLocation ?? null;
  const style = settings.war.narration;
  const rng: Rng = seedrandom(String(seed));
  const world = initialState(servants);
  const n = servants.length;
  const days = Math.max(3, Math.min(7, settings.war.days || 5));
  const targets = deathSchedule(n, days);
  const rivals = pickRivals(servants);

  const warDays: WarDay[] = [];
  const daySummaries: WarTimeline['daySummaries'] = [];
  const usedRecently: string[] = [];
  let eventCounter = 0;

  const makeEvent = (partial: Omit<WarEvent, 'id' | 'index'>): WarEvent => ({
    ...partial,
    id: `e${eventCounter}`,
    index: eventCounter++,
  });

  for (let day = 1; day <= days; day++) {
    world.day = day;
    resetAppearances(world);
    expireAlliances(world);
    const act = actForDay(day, days);
    const dayEvents: WarEvent[] = [];
    let lastParticipants: string[] = [];
    let budget = EXTRA_LETHAL_BUDGET;

    const push = (event: WarEvent) => {
      dayEvents.push(event);
      lastParticipants = event.participants.map((p) => p.servantId);
      for (const p of event.participants) noteAppearance(world, p.servantId);
      if (event.templateId && event.templateId !== 'nightfall') {
        usedRecently.push(event.templateId);
        while (usedRecently.length > TEMPLATE_FRESHNESS_WINDOW) usedRecently.shift();
      }
    };

    const baseArgs = (): Omit<GenerateArgs, 'category' | 'lethal' | 'allowMutual' | 'decisive' | 'slot'> => ({
      day,
      rng,
      world,
      settings,
      rivals,
      usedRecently,
      lastParticipants,
      totalDays: days,
      warLocation,
    });

    /** 0, 1 or 2+ consecutive fight events immediately before the cursor. */
    const trailingFights = (): number => {
      let count = 0;
      for (let i = dayEvents.length - 1; i >= 0; i--) {
        if (!FIGHT_CATEGORIES.has(dayEvents[i].category)) break;
        count++;
      }
      return count;
    };

    /** Insert a quiet beat so we never show three fights in a row. */
    const breakMonotony = (): void => {
      if (trailingFights() < 2) return;
      generateEvent(
        {
          ...baseArgs(),
          category: pick(rng, CALM_CATEGORIES),
          slot: dayEvents.length,
          lethal: false,
          allowMutual: false,
          decisive: false,
        },
        push,
        makeEvent,
      );
    };

    // --- Prologue -------------------------------------------------
    if (day === 1) {
      const tpl = TEMPLATE_BY_ID.get('global_prologue');
      const styled = prologueTokens(style, rng, warLocation);
      const rendered =
        styled ?? (tpl ? renderText(tpl, rng, { location: 'the city', survivors: livingCount(world), day }) : null);
      if (rendered) {
        push(
          makeEvent({
            day,
            phase: 'night',
            category: 'global',
            templateId: styled ? 'narration_prologue' : (tpl?.id ?? 'global_prologue'),
            location: warLocation?.name ?? 'the city',
            participants: servants.map((s) => ({ servantId: s.id, role: 'witness' as const })),
            tokens: rendered,
            deaths: [],
            injured: [],
            banner: 'global',
          }),
        );
        world.flags.add('prologue');
      }
    }

    // --- Regular slots -------------------------------------------
    const count = randInt(rng, settings.war.minEventsPerDay, settings.war.maxEventsPerDay);
    const slotCategories = planSlots(rng, act, count, day, days, n);
    const lastDay = day === days;
    const regularSlots = lastDay ? Math.max(0, slotCategories.length - 1) : slotCategories.length;

    for (let slot = 0; slot < regularSlots; slot++) {
      let category = slotCategories[slot];
      if (FIGHT_CATEGORIES.has(category) && trailingFights() >= 2) {
        category = pick(rng, CALM_CATEGORIES);
      }
      const lethal = day >= 2 && livingCount(world) > targets[day - 1];
      generateEvent(
        {
          ...baseArgs(),
          category,
          slot: dayEvents.length,
          lethal,
          allowMutual: true,
          decisive: false,
        },
        push,
        makeEvent,
      );
    }

    // --- Spotlight fairness: everyone appears at least once -------
    for (const id of livingIds(world)) {
      if ((world.appearancesToday.get(id) ?? 0) > 0) continue;
      generateEvent(
        {
          ...baseArgs(),
          category: pick(rng, ['flavor', 'rest', 'scouting']),
          slot: dayEvents.length,
          lethal: false,
          allowMutual: false,
          decisive: false,
          forceActor: id,
        },
        push,
        makeEvent,
      );
    }

    // --- Extra lethal events to reach the day's survivor target ---
    while (livingCount(world) > targets[day - 1] && budget > 0 && livingCount(world) > 1) {
      budget--;
      breakMonotony();
      const before = livingCount(world);
      generateEvent(
        {
          ...baseArgs(),
          category: pick(rng, ['hunt', 'duel']),
          slot: dayEvents.length,
          lethal: true,
          allowMutual: true,
          decisive: false,
          ignoreFreshness: true,
        },
        push,
        makeEvent,
      );
      if (livingCount(world) === before) break;
    }

    // --- Finale ---------------------------------------------------
    // Guarantees exactly one survivor: decisive duels cannot end in mercy,
    // rescue or mutual destruction, so each one removes exactly one Servant.
    if (lastDay) {
      let guard = 0;
      while (livingCount(world) > 2 && guard++ < 40) {
        breakMonotony();
        const before = livingCount(world);
        generateEvent(
          {
            ...baseArgs(),
            category: 'duel',
            slot: dayEvents.length,
            lethal: true,
            allowMutual: false,
            decisive: true,
            ignoreFreshness: true,
          },
          push,
          makeEvent,
        );
        if (livingCount(world) === before) break;
      }
      if (livingCount(world) === 2) {
        breakMonotony();
        generateEvent(
          {
            ...baseArgs(),
            category: 'finale',
            slot: dayEvents.length,
            lethal: true,
            allowMutual: false,
            decisive: true,
            ignoreFreshness: true,
          },
          push,
          makeEvent,
        );
      }
      guard = 0;
      while (livingCount(world) > 1 && guard++ < 40) {
        breakMonotony();
        const before = livingCount(world);
        generateEvent(
          {
            ...baseArgs(),
            category: 'duel',
            slot: dayEvents.length,
            lethal: true,
            allowMutual: false,
            decisive: true,
            ignoreFreshness: true,
          },
          push,
          makeEvent,
        );
        if (livingCount(world) === before) break;
      }
    }

    // --- Nightfall -------------------------------------------------
    nightfallRecovery(world);
    const fallen = [...world.state.entries()]
      .filter(([, s]) => !s.alive && s.diedOnDay === day)
      .map(([id]) => id);
    const remaining = livingIds(world);

    dayEvents.push(
      makeEvent({
        day,
        phase: 'night',
        category: 'nightfall',
        templateId: 'nightfall',
        location: warLocation?.name ?? 'the city',
        participants: fallen.map((id) => ({ servantId: id, role: 'witness' as const })),
        tokens: narrationNightfallTokens(
          style,
          rng,
          fallen.map((id) => ({ id, name: getServant(world, id).character.name })),
          remaining.length,
          day,
          warLocation,
        ),
        deaths: [],
        injured: [],
        banner: fallen.length ? 'death' : undefined,
      }),
    );

    warDays.push({ day, title: act.title, events: dayEvents, fallen, remaining });
    daySummaries.push({ day, title: act.title, fallen, remaining });

    if (livingCount(world) <= 1) break;
  }

  // Guarantee exactly one winner.
  let winnerId = livingIds(world)[0] ?? '';
  if (!winnerId) {
    const byDeathOrder = [...world.state.entries()].sort(
      (a, b) => (b[1].diedOnDay ?? 0) - (a[1].diedOnDay ?? 0),
    );
    winnerId = byDeathOrder[0]?.[0] ?? servants[0]?.id ?? '';
  }
  const winner = getServant(world, winnerId);

  return {
    seed,
    days: warDays,
    daySummaries,
    winnerId,
    wish: generateWish(rng, winner, style),
    servants,
    unsummoned,
  };
}

/* ------------------------------------------------------------------ */
/* Rivals                                                              */
/* ------------------------------------------------------------------ */

interface RivalPair {
  a: string;
  b: string;
}

function pickRivals(servants: Servant[]): RivalPair[] {
  const scored = servants.filter((s) => s.profile);
  const pairs: { a: string; b: string; diff: number }[] = [];
  for (let i = 0; i < scored.length; i++) {
    for (let j = i + 1; j < scored.length; j++) {
      const diff = Math.abs((scored[i].profile?.baseScore ?? 0) - (scored[j].profile?.baseScore ?? 0));
      pairs.push({ a: scored[i].id, b: scored[j].id, diff });
    }
  }
  pairs.sort((x, y) => x.diff - y.diff);
  const chosen: RivalPair[] = [];
  for (const p of pairs) {
    if (p.diff >= 6 || chosen.length >= 2) break;
    if (chosen.some((c) => c.a === p.a || c.a === p.b || c.b === p.a || c.b === p.b)) continue;
    chosen.push({ a: p.a, b: p.b });
  }
  return chosen;
}

function areRivals(rivals: RivalPair[], a: string, b: string): boolean {
  return rivals.some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
}

/* ------------------------------------------------------------------ */
/* Slot planning                                                       */
/* ------------------------------------------------------------------ */

function planSlots(rng: Rng, act: Act, count: number, day: number, days: number, n: number): string[] {
  const categories = Object.keys(act.weights);
  const slots: string[] = [];
  for (let i = 0; i < count; i++) {
    slots.push(weightedPick(rng, categories, (c) => act.weights[c] ?? 0) ?? 'social');
  }
  if (day === 1) {
    for (let i = 0; i < slots.length; i++) {
      if (NON_LETHAL_ON_DAY_1.has(slots[i])) slots[i] = 'skirmish';
    }
  }
  if (!slots.some((s) => FIGHT_CATEGORIES.has(s))) {
    slots[randInt(rng, 0, slots.length - 1)] = day === 1 ? 'skirmish' : 'duel';
  }
  if (n <= 3) {
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] === 'teamup' || slots[i] === 'chaos') slots[i] = 'duel';
    }
  }
  void days;
  return slots;
}

/* ------------------------------------------------------------------ */
/* Event generation                                                    */
/* ------------------------------------------------------------------ */

interface GenerateArgs {
  category: string;
  day: number;
  /** war length, used to normalise template day filters onto the five acts */
  totalDays: number;
  slot: number;
  rng: Rng;
  world: WorldState;
  settings: RoomSettings;
  lethal: boolean;
  rivals: RivalPair[];
  usedRecently: string[];
  lastParticipants: string[];
  allowMutual: boolean;
  decisive: boolean;
  forceActor?: string;
  ignoreFreshness?: boolean;
  warLocation: WarLocation | null;
}

type PushFn = (event: WarEvent) => void;
type MakeFn = (partial: Omit<WarEvent, 'id' | 'index'>) => WarEvent;

const PHASES: EventPhaseName[] = ['morning', 'afternoon', 'evening', 'night'];

function generateEvent(args: GenerateArgs, push: PushFn, makeEvent: MakeFn): void {
  if (args.category === 'global') {
    generateGlobalEvent(args, push, makeEvent);
    return;
  }

  const { category, day, rng, world, settings, usedRecently } = args;
  const living = livingIds(world);
  if (!living.length) return;

  const chosen = chooseParticipants(args, living);
  if (!chosen.length || !chosen[0]) return;

  // Never use the exact same group twice in a row.
  if (
    living.length > 2 &&
    args.lastParticipants.length > 0 &&
    args.lastParticipants.length === chosen.length &&
    args.lastParticipants.every((id) => chosen.includes(id))
  ) {
    const alt = living.filter((id) => !chosen.includes(id));
    if (alt.length) chosen[randInt(rng, 0, chosen.length - 1)] = pick(rng, alt);
  }

  const actor = getServant(world, chosen[0]);
  const targetCandidate = chosen[1] ? getServant(world, chosen[1]) : undefined;
  const allyCandidate = chosen[2] ? getServant(world, chosen[2]) : undefined;

  const candidates = templatesFor(category).filter((tpl) =>
    templateAllowed(tpl, args, actor, targetCandidate, allyCandidate, usedRecently),
  );
  let template: TemplateDef | null = weightedPick(rng, candidates, (t) => t.weight) ?? candidates[0] ?? null;
  if (!template) template = TEMPLATE_BY_ID.get('flavor_moon') ?? null;
  if (!template) return;

  // Trim participants to exactly the roles the chosen template uses, so the
  // sentence and the portrait row can never disagree.
  const roles = template.roles ?? [];
  const target = roles.includes('target') ? targetCandidate : undefined;
  const ally = roles.includes('ally') ? allyCandidate : undefined;

  const effects = template.effects ?? {};
  const locationId = randomLocationId(rng);
  const deaths: string[] = [];
  const injured: string[] = [];
  let banner: EventBanner | undefined;
  let explain: WarEvent['explain'];
  let tokens: Token[] | null;

  const combatants: Combatant[] = [];
  if (effects.duel && target) {
    combatants.push(toCombatant(world, actor.id));
    combatants.push(toCombatant(world, target.id));
    if (ally) combatants.push(toCombatant(world, ally.id));
  }

  if (effects.duel && target) {
    const result = resolveFight(args, combatants, {
      ambush: Boolean(effects.ambush || effects.betrayal),
      trap: Boolean(effects.trap),
    });
    explain = buildExplain(result, actor, target);
    const renderCtx = {
      actor, target, ally,
      location: locationName(locationId),
      survivors: livingCount(world),
      day,
    };
    if (effects.finale) {
      // Finale templates narrate the outcome themselves, so they need the
      // winner and loser rather than the setup roles.
      tokens = renderText(template, rng, {
        ...renderCtx,
        winner: result.winnerId ? getServant(world, result.winnerId) : undefined,
        loser: result.loserId ? getServant(world, result.loserId) : undefined,
      });
    } else {
      const setup = renderText(template, rng, renderCtx);
      const outcome = renderOutcome(args, result, actor, target, ally, Boolean(effects.ambush));
      tokens = mergeTokens(setup, outcome);
    }
    applyFightEffects(args, result, combatants, Boolean(effects.masterKill), deaths, injured);
    if (deaths.length) {
      banner = 'death';
      // Hunger Games / Fate add their own signature for a death on the field.
      const notice = deathNoticeTokens(settings.war.narration, rng, deaths.length);
      if (notice) tokens = [...(tokens ?? []), ...notice];
    }
  } else {
    tokens = renderText(template, rng, {
      actor, target, ally,
      location: locationName(locationId),
      survivors: livingCount(world),
      day,
    });
    // Scouting reads differently depending on the city it happens in.
    if (args.category === 'scouting' && args.warLocation) {
      tokens = mergeTokens(
        tokens,
        vantageTokens(rng, args.warLocation, { id: actor.id, name: actor.character.name }),
      );
    }
    applyNonFightEffects(args, actor, target, locationId, effects, injured);
  }

  if (effects.alliance) banner = 'alliance';
  if (effects.betrayal) banner = 'betrayal';
  if (effects.finale) banner = 'finale';
  if (!tokens) return;    push(
      makeEvent({
        day,
        phase: phaseFor(args.slot),
        category: template.category,
        templateId: template.id,
      location: locationName(locationId),
      participants: [
        { servantId: actor.id, role: 'actor' as const },
        ...(target ? [{ servantId: target.id, role: 'target' as const }] : []),
        ...(ally ? [{ servantId: ally.id, role: 'ally' as const }] : []),
      ],
      tokens,
      deaths,
      injured,
      banner,
      explain,
    }),
  );
  void settings;
}

function phaseFor(slotIndex: number): EventPhaseName {
  // Group events in threes so the day always reads morning → night in order.
  return PHASES[Math.min(PHASES.length - 1, Math.floor(slotIndex / 3))];
}

/** Global events either address the whole roster or single out one Servant. */
function generateGlobalEvent(args: GenerateArgs, push: PushFn, makeEvent: MakeFn): void {
  const { day, rng, world, settings, usedRecently } = args;
  const living = livingIds(world);
  if (!living.length) return;

  const candidates = templatesFor('global').filter((tpl) => {
    if (tpl.days.length && !tpl.days.includes(actDayOf(day, args.totalDays))) return false;
    const flag = tpl.effects?.flag;
    if (flag && world.flags.has(flag)) return false;
    if (!args.ignoreFreshness && usedRecently.includes(tpl.id)) return false;
    return true;
  });
  const template = weightedPick(rng, candidates, (t) => t.weight) ?? candidates[0] ?? null;
  if (!template) return;

  const spotlight = living.reduce((best, id) => {
    const score = (x: string) =>
      getState(world, x).kills * 100 + (getServant(world, x).profile?.baseScore ?? 0);
    return score(id) > score(best) ? id : best;
  }, living[0]);

  const roles = template.roles ?? [];
  const everyone = roles.includes('all');
  const participants = everyone
    ? living.map((id) => ({ servantId: id, role: 'witness' as const }))
    : [{ servantId: spotlight, role: 'target' as const }];

  const actor = getServant(world, everyone ? living[0] : spotlight);
  const target = everyone ? undefined : getServant(world, spotlight);
  const locationId = randomLocationId(rng);

  const tokens = renderText(template, rng, {
    actor,
    target,
    location: locationName(locationId),
    survivors: livingCount(world),
    day,
  });
  if (!tokens) return;

  const injured: string[] = [];
  applyNonFightEffects(args, actor, target, locationId, template.effects ?? {}, injured);
  if (template.effects?.flag) world.flags.add(template.effects.flag);

  push(
    makeEvent({
      day,
      phase: phaseFor(args.slot),
      category: 'global',
      templateId: template.id,
      location: locationName(locationId),
      participants,
      tokens,
      deaths: [],
      injured,
      banner: 'global',
    }),
  );
  void settings;
}

function toCombatant(world: WorldState, id: string): Combatant {
  const servant = getServant(world, id);
  return {
    id,
    cls: servant.cls,
    profile: servant.profile ?? fallbackProfile(servant),
    state: getState(world, id),
  };
}

/* ------------------------------------------------------------------ */
/* Participant selection                                               */
/* ------------------------------------------------------------------ */

function chooseParticipants(args: GenerateArgs, living: string[]): string[] {
  const { category, rng, world, forceActor } = args;

  if (forceActor) {
    const others = living.filter((id) => id !== forceActor);
    return others.length && rng() < 0.4 ? [forceActor, pick(rng, others)] : [forceActor];
  }
  if (living.length < 2) return [living[0]];

  if (category === 'teamup' || category === 'chaos') {
    return shuffle(rng, living).slice(0, Math.min(3, living.length));
  }

  if (category === 'master_hunt') {
    const stealthy = living.filter((id) => {
      const s = getServant(world, id);
      return s.cls === 'assassin' || s.profile?.archetype === 'stealth';
    });
    if (stealthy.length) {
      const attacker = pick(rng, stealthy);
      const targets = living.filter((id) => id !== attacker && getState(world, id).masterAlive);
      if (targets.length) return [attacker, pick(rng, targets)];
    }
  }

  return weightedPair(args, living);
}

function pairWeight(args: GenerateArgs, a: string, b: string): number {
  const { world, rivals, category } = args;
  const sa = getState(world, a);
  const sb = getState(world, b);
  if (!sa.alive || !sb.alive) return 0;

  const spotlight = (id: string) => 1 / (1 + (world.appearancesToday.get(id) ?? 0));
  let weight = spotlight(a) * spotlight(b);

  if (hasGrudge(world, a, b) || hasGrudge(world, b, a)) weight *= 3;
  if (areRivals(rivals, a, b)) weight *= 2.5;
  if (!metBefore(world, a, b)) weight *= 2;
  if (encounterCount(world, a, b) >= MAX_PAIR_ENCOUNTERS && category !== 'finale' && !args.decisive) return 0;
  if (allianceOf(world, a, b) && category !== 'betrayal' && category !== 'alliance_break') weight *= 0.2;
  if ((category === 'hunt' || category === 'master_hunt') && (sb.injuries >= 2 || sb.masterless)) weight *= 2;
  if ((category === 'hunt' || category === 'master_hunt') && (sa.injuries >= 2 || sa.masterless)) weight *= 2;

  const profA = getServant(world, a).profile;
  const profB = getServant(world, b).profile;
  if (profA?.alignment === 'evil' && profB?.alignment === 'good') weight *= 1.5;
  if (profB?.alignment === 'evil' && profA?.alignment === 'good') weight *= 1.5;

  return weight;
}

function weightedPair(args: GenerateArgs, living: string[]): string[] {
  const pairs: string[][] = [];
  for (let i = 0; i < living.length; i++) {
    for (let j = i + 1; j < living.length; j++) pairs.push([living[i], living[j]]);
  }
  const chosen = weightedPick(args.rng, pairs, (p) => pairWeight(args, p[0], p[1]));
  if (chosen) return chosen;
  // Every pair was excluded (e.g. all have met too often): force the best remaining.
  const forced = weightedPick(args.rng, pairs, () => 1);
  if (forced) return forced;
  return shuffle(args.rng, living).slice(0, 2);
}

/* ------------------------------------------------------------------ */
/* Template filtering                                                  */
/* ------------------------------------------------------------------ */

function templatesFor(category: string): TemplateDef[] {
  return [...TEMPLATE_BY_ID.values()].filter((t) => t.category === category);
}

function templateAllowed(
  tpl: TemplateDef,
  args: GenerateArgs,
  actor: Servant,
  target: Servant | undefined,
  ally: Servant | undefined,
  usedRecently: string[],
): boolean {
  const { world } = args;
  const actDay = actDayOf(args.day, args.totalDays);
  if (tpl.days.length && !tpl.days.includes(actDay)) return false;
  if (!args.ignoreFreshness && usedRecently.includes(tpl.id)) return false;

  const flag = tpl.effects?.flag;
  if (flag && world.flags.has(flag)) return false;

  const roles = tpl.roles ?? [];
  const needsTarget = roles.includes('target');
  const needsAlly = roles.includes('ally');
  if (needsTarget && !target) return false;
  if (needsAlly && !ally) return false;

  const req = tpl.requires;
  if (!req) return true;

  if (req.targetTag) {
    if (!target) return false;
    const tags = target.profile?.tags ?? [];
    if (!req.targetTag.some((t) => tags.includes(t as (typeof tags)[number]))) return false;
  }
  if (req.actorTag) {
    const tags = actor.profile?.tags ?? [];
    if (!req.actorTag.some((t) => tags.includes(t as (typeof tags)[number]))) return false;
  }
  if (req.scoreGap && target) {
    const gap = (actor.profile?.baseScore ?? 30) - (target.profile?.baseScore ?? 30);
    const m = req.scoreGap.match(/^(>=|<=|>|<)\s*(-?\d+)$/);
    if (!m) return false;
    const value = Number(m[2]);
    const ok =
      (m[1] === '>=' && gap >= value) ||
      (m[1] === '<=' && gap <= value) ||
      (m[1] === '>' && gap > value) ||
      (m[1] === '<' && gap < value);
    if (!ok) return false;
  }
  if (req.targetInjuriesAtLeast !== undefined) {
    if (!target || getState(world, target.id).injuries < req.targetInjuriesAtLeast) return false;
  }
  if (req.needsAlliance && (!target || !allianceOf(world, actor.id, target.id))) return false;
  if (req.needsGrudge) {
    if (!target) return false;
    if (!hasGrudge(world, actor.id, target.id) && !hasGrudge(world, target.id, actor.id)) return false;
  }
  if (req.metBefore && (!target || !metBefore(world, actor.id, target.id))) return false;
  if (req.classMismatch && !isClassMismatch(actor)) return false;
  if (req.alignment && actor.profile && actor.profile.alignment !== req.alignment) return false;
  return true;
}

/** e.g. a mage summoned as Berserker, or a monster as Saber. */
export function isClassMismatch(servant: Servant): boolean {
  const archetype = servant.profile?.archetype;
  if (!archetype) return false;
  const natural: Record<string, string[]> = {
    saber: ['swordsman', 'brawler', 'leader'],
    archer: ['ranged', 'monster'],
    lancer: ['swordsman', 'brawler', 'ranged'],
    rider: ['leader', 'monster'],
    caster: ['mage'],
    assassin: ['stealth', 'ranged'],
    berserker: ['monster', 'brawler'],
    shielder: ['swordsman', 'brawler', 'leader'],
    ruler: ['leader', 'mage'],
    avenger: ['stealth', 'mage', 'monster'],
  };
  return !(natural[servant.cls] ?? []).includes(archetype);
}

/* ------------------------------------------------------------------ */
/* Fight resolution + effects                                          */
/* ------------------------------------------------------------------ */

interface FightResult extends DuelResult {
  combatants: Combatant[];
}

function resolveFight(
  args: GenerateArgs,
  combatants: Combatant[],
  opts: { ambush?: boolean; trap?: boolean },
): FightResult {
  const { rng, world, settings, lethal, allowMutual, decisive } = args;

  if (combatants.length === 3) {
    const [a, ally, target] = combatants;
    const adv = settings.war.classAdvantage;
    const ea = teamEffective([
      effectiveScore(a, { classAdvantage: adv, opponent: target, attacking: true, ambush: opts.ambush }),
      effectiveScore(ally, { classAdvantage: adv, opponent: target, attacking: true }),
    ]);
    const eb = effectiveScore(target, { classAdvantage: adv, opponent: a }).score;
    const diff = ea - eb;
    const margin = marginOf(diff);
    const teamWins = Math.abs(diff) >= 3 ? diff > 0 : rng() < 0.5 + diff / 6;
    const weaker = a.profile.baseScore <= ally.profile.baseScore ? a : ally;
    const winner = teamWins ? a : target;
    const loser = teamWins ? target : weaker;
    return {
      winnerId: winner.id,
      loserId: loser.id,
      outcome: lethal ? 'kill' : margin === 'razor' ? 'stalemate' : 'retreat',
      margin,
      ea: Math.round(ea * 10) / 10,
      eb: Math.round(eb * 10) / 10,
      tossUp: Math.abs(diff) < 3,
      modifiers: [
        { label: 'Team-up', value: Math.round(diff * 10) / 10 },
        { label: 'Outnumbered', value: 0 },
      ],
      detail: teamWins ? 'The pair overwhelms the target.' : 'The target breaks the pair apart.',
      combatants,
    };
  }

  const result = resolveDuel(combatants[0], combatants[1], {
    rng,
    lethal,
    classAdvantage: settings.war.classAdvantage,
    commandSpellRescues: settings.war.commandSpellRescues,
    allowMutual: allowMutual && !world.mutualUsed,
    ambush: opts.ambush,
    trap: opts.trap ? 3 : undefined,
    decisive,
  });
  return { ...result, combatants };
}

function marginOf(diff: number): Margin {
  const abs = Math.abs(diff);
  if (abs >= 20) return 'stomp';
  if (abs >= 10) return 'clear';
  if (abs >= 3) return 'narrow';
  return 'razor';
}

function buildExplain(result: DuelResult, actor: Servant, target: Servant | undefined): WarEvent['explain'] {
  return {
    a: actor.character.name,
    b: target?.character.name ?? '—',
    ea: result.ea,
    eb: result.eb,
    modifiers: result.modifiers.slice(0, 8),
    result: result.tossUp
      ? `${result.detail} (too close to call — decided by fate, seeded)`
      : result.detail,
  };
}

function applyFightEffects(
  args: GenerateArgs,
  result: FightResult,
  combatants: Combatant[],
  masterKill: boolean,
  deaths: string[],
  injured: string[],
): void {
  const { world, day } = args;
  const winnerId = result.winnerId;
  const loserId = result.loserId;

  for (const c of combatants) {
    getState(world, c.id).buffNextFight = 0;
    adjustMana(world, c.id, -fightManaCost(world, c.id));
  }

  const handleDeath = (id: string) => {
    if (!getState(world, id).alive) return;
    kill(world, id, day, winnerId ?? undefined);
    deaths.push(id);
  };

  switch (result.outcome) {
    case 'kill': {
      if (loserId) handleDeath(loserId);
      if (winnerId) {
        getState(world, winnerId).kills += 1;
        adjustMorale(world, winnerId, 1);
      }
      if (loserId) {
        adjustMorale(world, loserId, -1);
        if (winnerId) addGrudge(world, loserId, winnerId);
      }
      break;
    }
    case 'mutual': {
      for (const c of combatants) handleDeath(c.id);
      world.mutualUsed = true;
      break;
    }
    case 'mercy': {
      if (loserId) {
        injure(world, loserId, 2);
        injured.push(loserId);
        adjustMorale(world, loserId, -1);
        if (winnerId) addGrudge(world, loserId, winnerId);
      }
      if (winnerId) adjustMorale(world, winnerId, 1);
      break;
    }
    case 'escape': {
      if (loserId) {
        const l = getState(world, loserId);
        l.rescueUsed = true;
        l.commandSpellsLeft = Math.max(0, l.commandSpellsLeft - 1);
        injure(world, loserId, 2);
        injured.push(loserId);
        if (winnerId) addGrudge(world, loserId, winnerId);
      }
      break;
    }
    case 'retreat': {
      if (loserId) {
        injure(world, loserId, result.margin === 'stomp' ? 2 : 1);
        injured.push(loserId);
        adjustMorale(world, loserId, -1);
        if (winnerId) addGrudge(world, loserId, winnerId);
      }
      if (result.margin === 'razor' && winnerId) injure(world, winnerId, 1);
      if (winnerId) adjustMorale(world, winnerId, 1);
      break;
    }
    case 'stalemate': {
      for (const c of combatants) {
        injure(world, c.id, 1);
        injured.push(c.id);
      }
      break;
    }
    case 'master_kill': {
      if (loserId) markMasterless(world, loserId);
      break;
    }
  }

  if (masterKill && result.outcome !== 'master_kill' && winnerId) {
    const attacker = combatants.find((c) => c.id === winnerId);
    const victim = combatants.find((c) => c.id !== winnerId && getState(world, c.id).masterAlive);
    if (attacker && victim) {
      const exposed = victim.state.injuries >= 2 || victim.state.mana < 60;
      const stealthy = attacker.cls === 'assassin' || attacker.profile.archetype === 'stealth';
      if (exposed && stealthy) markMasterless(world, victim.id);
    }
  }

  // Masterless Servants fade away within their next two events.
  for (const [id, st] of world.state) {
    if (!st.alive || !st.masterless || st.fadeIn === undefined) continue;
    st.fadeIn -= 1;
    if (st.fadeIn <= 0) {
      kill(world, id, day);
      deaths.push(id);
    }
  }

  if (result.winnerId && result.loserId) recordEncounter(world, result.winnerId, result.loserId);
}

function markMasterless(world: WorldState, id: string): void {
  const st = getState(world, id);
  st.masterAlive = false;
  st.masterless = true;
  st.fadeIn = 2;
}

function applyNonFightEffects(
  args: GenerateArgs,
  actor: Servant,
  target: Servant | undefined,
  locationId: string,
  effects: NonNullable<TemplateDef['effects']>,
  injured: string[],
): void {
  const { world } = args;

  if (effects.scouted && target) markScouted(world, actor.id, target.id);
  if (effects.trap) addTrap(world, actor.id, locationId);
  if (effects.alliance && target) formAlliance(world, actor.id, target.id);
  if ((effects.allianceBreak || effects.betrayal) && target) breakAlliance(world, actor.id, target.id);

  if (effects.rest) {
    heal(world, actor.id, 1);
    adjustMana(world, actor.id, 30);
  }
  if (effects.heal) heal(world, actor.id, 1);
  if (effects.buff) {
    const st = getState(world, actor.id);
    st.buffNextFight = Math.max(st.buffNextFight, 5);
    st.commandSpellsLeft = Math.max(0, st.commandSpellsLeft - 1);
  }
  if (effects.injury) {
    injure(world, actor.id, effects.injury);
    injured.push(actor.id);
  }
  if (effects.morale) adjustMorale(world, actor.id, effects.morale);
  if (effects.manaDelta) adjustMana(world, actor.id, effects.manaDelta);
  if (effects.masterInjury) adjustMana(world, actor.id, -10);
  if (effects.grudgeAll) {
    const victimId = target?.id ?? actor.id;
    for (const id of livingIds(world)) {
      if (id !== victimId) addGrudge(world, id, victimId);
    }
    world.flags.add(`churchHunt:${victimId}`);
  }
  if (effects.manaAll) {
    for (const id of livingIds(world)) adjustMana(world, id, effects.manaAll);
  }
}

/* ------------------------------------------------------------------ */
/* Rendering helpers                                                   */
/* ------------------------------------------------------------------ */

function renderText(
  tpl: TemplateDef,
  rng: Rng,
  ctx: Partial<RenderContext> & Pick<RenderContext, 'location' | 'survivors' | 'day'>,
): Token[] | null {
  if (!tpl.text.length) return null;
  const text = tpl.text[Math.min(tpl.text.length - 1, Math.floor(rng() * tpl.text.length))];
  return renderTemplate(text, {
    actor: ctx.actor,
    target: ctx.target,
    ally: ctx.ally,
    winner: ctx.winner,
    loser: ctx.loser,
    location: ctx.location,
    survivors: ctx.survivors,
    day: ctx.day,
  });
}

const OUTCOME_BY_KEY: Record<string, string> = {
  'kill:stomp': 'out_stomp_kill',
  'kill:clear': 'out_clear_kill',
  'kill:narrow': 'out_narrow_kill',
  'kill:razor': 'out_razor_kill',
  'retreat:stomp': 'out_stomp_retreat',
  'retreat:clear': 'out_clear_retreat',
  'retreat:narrow': 'out_clear_retreat',
  'retreat:razor': 'out_clear_retreat',
  stalemate: 'out_stalemate',
  mutual: 'out_mutual',
  mercy: 'out_mercy',
  escape: 'out_command_spell',
  master_kill: 'out_master_kill',
};

function renderOutcome(
  args: GenerateArgs,
  result: FightResult,
  actor: Servant,
  target: Servant | undefined,
  ally: Servant | undefined,
  ambush: boolean,
): Token[] | null {
  const { world, rng } = args;
  const winner = result.winnerId ? getServant(world, result.winnerId) : undefined;
  const loser = result.loserId ? getServant(world, result.loserId) : undefined;

  let id: string | undefined;
  if (result.combatants.length === 3) id = 'out_team_up';
  else if (ambush && result.winnerId && result.winnerId === result.combatants[0]?.id) id = 'out_ambush_win';
  else id = OUTCOME_BY_KEY[`${result.outcome}:${result.margin}`] ?? OUTCOME_BY_KEY[result.outcome];
  if (!id) id = 'out_stalemate';

  const tpl = TEMPLATE_BY_ID.get(id);
  if (!tpl) return null;
  return renderText(tpl, rng, {
    actor, target, ally, winner, loser,
    location: locationName(randomLocationId(rng)),
    survivors: livingCount(world),
    day: args.day,
  });
}

function mergeTokens(setup: Token[] | null, outcome: Token[] | null): Token[] | null {
  if (!setup) return outcome;
  if (!outcome) return setup;
  return [...setup, { t: 'text', v: ' ' }, ...outcome];
}

/* ------------------------------------------------------------------ */
/* Wish                                                                */
/* ------------------------------------------------------------------ */

function generateWish(rng: Rng, winner: Servant, style: RoomSettings['war']['narration']): string {
  const alignment = winner.profile?.alignment ?? 'neutral';
  const list = WISH_TEMPLATES[alignment] ?? WISH_TEMPLATES.neutral;
  const name = winner.profile?.name ?? winner.character.name;
  return wishLine(style, rng, name, pick(rng, list));
}
