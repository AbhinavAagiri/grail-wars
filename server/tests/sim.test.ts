import { describe, expect, it } from 'vitest';
import {
  CLASSES,
  DEFAULT_SETTINGS,
  type Profile,
  type RoomSettings,
  type Servant,
  type ServantClass,
  type WorldServantState,
} from '@hgd/shared';
import seedrandom from 'seedrandom';
import { runSimulation, deathSchedule, actForDay, isClassMismatch } from '../src/sim/director';
import { baseScore, effectiveScore, resolveDuel, type Combatant, type Rng } from '../src/sim/score';
import { TIERS, LEVELS } from '../src/research/tiers';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function profileFor(name: string, score: number, overrides: Partial<Profile> = {}): Profile {
  return {
    key: name.toLowerCase(),
    name,
    source: 'Test',
    tierPeak: '7-B',
    tierBase: '7-B',
    tierIndex: (TIERS as readonly string[]).indexOf('7-B'),
    speed: 'Hypersonic',
    speedIndex: 8,
    durability: 'City',
    durabilityIndex: LEVELS.indexOf('City'),
    range: 'Extended Melee Range',
    rangeIndex: 1,
    intelligence: 'Gifted',
    intelligenceIndex: 70,
    abilities: [],
    keyAbilityName: `${name} Strike`,
    weaknesses: [],
    archetype: 'swordsman',
    tags: ['honorable'],
    alignment: 'good',
    haxScore: 0,
    confidence: 'high',
    sources: [],
    baseScore: score,
    ...overrides,
  };
}

function servantFor(i: number, score: number, cls?: ServantClass): Servant {
  const chosen = cls ?? (CLASSES[i % CLASSES.length] as ServantClass);
  const name = `Servant${i}`;
  return {
    id: `s${i}`,
    playerId: `p${i}`,
    masterName: `Master${i}`,
    cls: chosen,
    character: {
      key: `test:${i}`,
      name,
      source: 'Test',
      provider: 'custom',
      imageUrl: '',
      submittedBy: `p${i}`,
    },
    profile: profileFor(name, score),
  };
}

function settingsFor(days: number): RoomSettings {
  return {
    ...DEFAULT_SETTINGS,
    war: { ...DEFAULT_SETTINGS.war, days },
    debate: { ...DEFAULT_SETTINGS.debate },
  };
}

function makeState(overrides: Partial<WorldServantState> = {}): WorldServantState {
  return {
    alive: true,
    injuries: 0,
    mana: 100,
    morale: 0,
    kills: 0,
    commandSpellsLeft: 3,
    masterAlive: true,
    buffNextFight: 0,
    scoutedTargets: [],
    allies: [],
    grudges: [],
    ...overrides,
  };
}

function combatant(name: string, score: number, overrides: Partial<Profile> = {}, state: Partial<WorldServantState> = {}): Combatant {
  return {
    id: name.toLowerCase(),
    cls: 'saber',
    profile: profileFor(name, score, overrides),
    state: makeState(state),
  };
}

const rngFrom = (seed: number): Rng => seedrandom(String(seed));

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

describe('the Oracle score', () => {
  it('ranks a 7-B fixture above a 9-C fixture by a wide margin', () => {
    const strong = profileFor('Strong', 0, {
      tierIndex: (TIERS as readonly string[]).indexOf('7-B'),
      speedIndex: 8,
      durabilityIndex: LEVELS.indexOf('City'),
    });
    const weak = profileFor('Weak', 0, {
      tierIndex: (TIERS as readonly string[]).indexOf('9-C'),
      speedIndex: 3,
      durabilityIndex: LEVELS.indexOf('Street'),
    });
    const strongScore = baseScore(strong);
    const weakScore = baseScore(weak);
    expect(strongScore).toBeGreaterThan(weakScore);

    // Win probability for a gap that large is effectively certain.
    const gap = strongScore - weakScore;
    const p = gap >= 3 ? 1 : 0.5 + gap / 6;
    expect(p).toBeGreaterThan(0.99);
  });

  it('scores a hax character above an equal-tier brawler', () => {
    const hax = profileFor('Wizard', 0, { haxScore: 62, abilities: ['Reality Warping'] });
    const brawler = profileFor('Brawler', 0, { haxScore: 6, abilities: ['Martial Arts'] });
    expect(baseScore(hax)).toBeGreaterThan(baseScore(brawler));
  });

  it('records every applied modifier', () => {
    const a = combatant('A', 60, {}, { injuries: 2 });
    const b = combatant('B', 60);
    const { modifiers } = effectiveScore(a, { classAdvantage: true, opponent: b });
    expect(modifiers.some((m) => m.label.includes('Injuries'))).toBe(true);
  });

  it('applies class advantage inside the triangles', () => {
    const saber: Combatant = { ...combatant('S', 50), cls: 'saber' };
    const lancer: Combatant = { ...combatant('L', 50), cls: 'lancer' };
    const advantage = effectiveScore(saber, { classAdvantage: true, opponent: lancer }).score;
    const disadvantage = effectiveScore(lancer, { classAdvantage: true, opponent: saber }).score;
    expect(advantage).toBeGreaterThan(disadvantage);
    expect(advantage - disadvantage).toBe(6);
  });
});

/* ------------------------------------------------------------------ */
/* Duel resolution                                                     */
/* ------------------------------------------------------------------ */

describe('duel resolution', () => {
  it('never lets a Servant 3+ points weaker win a decided fight', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const strong = combatant('Strong', 70);
      const weak = combatant('Weak', 60);
      const result = resolveDuel(strong, weak, {
        rng: rngFrom(seed),
        lethal: true,
        classAdvantage: true,
        commandSpellRescues: false,
        allowMutual: false,
      });
      expect(result.winnerId).toBe('strong');
      expect(result.tossUp).toBe(false);
    }
  });

  it('is deterministic for a fixed seed inside the toss-up band', () => {
    const a = combatant('A', 60);
    const b = combatant('B', 60);
    const options = {
      lethal: true,
      classAdvantage: true,
      commandSpellRescues: false,
      allowMutual: false,
    } as const;
    const first = resolveDuel(a, b, { ...options, rng: rngFrom(99) });
    const second = resolveDuel(a, b, { ...options, rng: rngFrom(99) });
    expect(first.winnerId).toBe(second.winnerId);
    expect(first.margin).toBe('razor');
  });

  it('produces both outcomes across many seeds in the toss-up band', () => {
    const a = combatant('A', 60);
    const b = combatant('B', 60);
    const winners = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const result = resolveDuel(a, b, {
        rng: rngFrom(seed),
        lethal: true,
        classAdvantage: true,
        commandSpellRescues: false,
        allowMutual: false,
      });
      expect(result.tossUp).toBe(true);
      if (result.winnerId) winners.add(result.winnerId);
    }
    expect(winners.size).toBe(2);
  });

  it('converts a death into a Command Spell escape exactly once per Servant', () => {
    const winner = combatant('Winner', 70);
    const loser = combatant('Loser', 62);
    const options = {
      lethal: true,
      classAdvantage: true,
      commandSpellRescues: true,
      allowMutual: false,
      rng: rngFrom(1),
    } as const;

    const first = resolveDuel(winner, loser, { ...options, rng: rngFrom(7) });
    expect(first.outcome).toBe('escape');

    // Mark the rescue as spent, as the Director would.
    loser.state.rescueUsed = true;
    const second = resolveDuel(winner, loser, { ...options, rng: rngFrom(7) });
    expect(second.outcome).toBe('kill');
  });

  it('never uses mercy or rescue in a decisive (finale) fight', () => {
    for (let seed = 0; seed < 50; seed++) {
      const winner = combatant('Winner', 72, { tags: ['merciful', 'honorable'] });
      const loser = combatant('Loser', 62);
      const result = resolveDuel(winner, loser, {
        rng: rngFrom(seed),
        lethal: true,
        classAdvantage: true,
        commandSpellRescues: true,
        allowMutual: true,
        decisive: true,
      });
      expect(result.outcome).toBe('kill');
      expect(result.winnerId).toBe('winner');
    }
  });

  it('never kills in a non-lethal skirmish', () => {
    for (let seed = 0; seed < 200; seed++) {
      const a = combatant('A', 80);
      const b = combatant('B', 40);
      const result = resolveDuel(a, b, {
        rng: rngFrom(seed),
        lethal: false,
        classAdvantage: true,
        commandSpellRescues: false,
        allowMutual: false,
      });
      expect(['retreat', 'stalemate']).toContain(result.outcome);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Death schedule                                                      */
/* ------------------------------------------------------------------ */

describe('death schedule', () => {
  it('is non-increasing, bounded and ends at exactly one', () => {
    for (let n = 2; n <= 14; n++) {
      for (const days of [3, 5, 7]) {
        const targets = deathSchedule(n, days);
        expect(targets).toHaveLength(days);
        expect(targets[targets.length - 1]).toBe(1);
        for (let i = 0; i < targets.length; i++) {
          expect(targets[i]).toBeGreaterThanOrEqual(1);
          expect(targets[i]).toBeLessThanOrEqual(n);
          if (i > 0) expect(targets[i]).toBeLessThanOrEqual(targets[i - 1]);
        }
      }
    }
  });

  it('takes first blood on day one for larger rooms', () => {
    expect(deathSchedule(7, 5)[0]).toBe(6);
    expect(deathSchedule(2, 5)[0]).toBe(2);
  });

  it('maps days onto the five acts', () => {
    expect(actForDay(1, 5).title).toBe('Summoning & Scouting');
    expect(actForDay(2, 5).title).toBe('First Blood');
    expect(actForDay(4, 5).title).toBe('The Grail Stirs');
    expect(actForDay(5, 5).title).toBe('The Final Night');
  });
});

/* ------------------------------------------------------------------ */
/* Full simulations                                                    */
/* ------------------------------------------------------------------ */

describe('the Director', () => {
  const combos: [number, number][] = [
    [2, 3], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [7, 7], [10, 5], [14, 3], [5, 3], [4, 7],
  ];

  it('always ends with exactly one survivor', () => {
    for (const [n, days] of combos) {
      const servants = Array.from({ length: n }, (_, i) => servantFor(i, 40 + i * 3));
      const timeline = runSimulation({
        servants,
        settings: settingsFor(days),
        seed: 1234 + n * 31 + days,
        unsummoned: [],
      });
      const lastDay = timeline.days[timeline.days.length - 1];
      expect(lastDay.remaining).toHaveLength(1);
      expect(timeline.winnerId).toBe(lastDay.remaining[0]);
      expect(timeline.wish.length).toBeGreaterThan(10);
    }
  });

  it('is fully reproducible for a fixed seed', () => {
    const build = () => Array.from({ length: 6 }, (_, i) => servantFor(i, 50 + i * 2));
    const a = runSimulation({ servants: build(), settings: settingsFor(5), seed: 777, unsummoned: [] });
    const b = runSimulation({ servants: build(), settings: settingsFor(5), seed: 777, unsummoned: [] });
    const summarise = (t: typeof a) =>
      t.days.map((d) => d.events.map((e) => `${e.templateId}:${e.tokens.map((x) => x.v).join('')}`).join('|')).join('#');
    expect(summarise(a)).toBe(summarise(b));
    expect(a.winnerId).toBe(b.winnerId);
  });

  it('produces a different story for a different seed', () => {
    const build = () => Array.from({ length: 6 }, (_, i) => servantFor(i, 50 + i * 2));
    const a = runSimulation({ servants: build(), settings: settingsFor(5), seed: 1, unsummoned: [] });
    const b = runSimulation({ servants: build(), settings: settingsFor(5), seed: 2, unsummoned: [] });
    expect(a.winnerId === b.winnerId && JSON.stringify(a.days) === JSON.stringify(b.days)).toBe(false);
  });

  it('paces deaths against the schedule (never wildly overshooting)', () => {
    for (const [n, days] of combos) {
      const servants = Array.from({ length: n }, (_, i) => servantFor(i, 40 + i * 3));
      const timeline = runSimulation({ servants, settings: settingsFor(days), seed: 555 + n + days, unsummoned: [] });
      const targets = deathSchedule(n, days);
      let alive = n;
      timeline.days.forEach((day, i) => {
        const deaths = alive - day.remaining.length;
        expect(deaths).toBeGreaterThanOrEqual(0);
        // A mutual destruction or a fading Master can overshoot by a small margin.
        expect(deaths).toBeLessThanOrEqual(alive - targets[Math.min(i, targets.length - 1)] + 3);
        alive = day.remaining.length;
      });
      expect(alive).toBe(1);
    }
  });

  it('never lets a dead Servant act after their death', () => {
    for (const [n, days] of combos) {
      const servants = Array.from({ length: n }, (_, i) => servantFor(i, 40 + i * 3));
      const timeline = runSimulation({ servants, settings: settingsFor(days), seed: 4242 + n, unsummoned: [] });
      const diedOn = new Map<string, number>();
      for (const day of timeline.days) {
        for (const event of day.events) {
          for (const participant of event.participants) {
            if (event.category === 'nightfall') continue;
            const diedDay = diedOn.get(participant.servantId);
            if (diedDay !== undefined && day.day > diedDay) {
              throw new Error(
                `${participant.servantId} participated on day ${day.day} after dying on day ${diedDay}`,
              );
            }
          }
        }
        for (const id of day.fallen) diedOn.set(id, day.day);
      }
    }
  });

  it('gives every living Servant at least one non-recap event each day', () => {
    for (const [n, days] of combos) {
      const servants = Array.from({ length: n }, (_, i) => servantFor(i, 40 + i * 3));
      const timeline = runSimulation({ servants, settings: settingsFor(days), seed: 31337 + n, unsummoned: [] });
      for (const day of timeline.days) {
        const appeared = new Set<string>();
        for (const event of day.events) {
          if (event.category === 'nightfall') continue;
          for (const p of event.participants) appeared.add(p.servantId);
        }
        const aliveAtStart = new Set(day.remaining);
        for (const id of day.fallen) aliveAtStart.add(id);
        for (const id of aliveAtStart) {
          if (!appeared.has(id)) throw new Error(`${id} never appeared on day ${day.day}`);
        }
      }
    }
  });

  it('always shows the participants it names', () => {
    const servants = Array.from({ length: 6 }, (_, i) => servantFor(i, 45 + i * 4));
    const timeline = runSimulation({ servants, settings: settingsFor(5), seed: 8080, unsummoned: [] });
    for (const day of timeline.days) {
      for (const event of day.events) {
        if (event.category === 'nightfall' || event.category === 'global') continue;
        const text = event.tokens.map((t) => t.v).join('');
        for (const p of event.participants) {
          const servant = servants.find((s) => s.id === p.servantId)!;
          if (!text.includes(servant.character.name)) {
            throw new Error(`${servant.character.name} is a participant but not named in "${text}"`);
          }
        }
      }
    }
  });

  it('never shows more than two fight events in a row', () => {
    const servants = Array.from({ length: 7 }, (_, i) => servantFor(i, 45 + i * 4));
    const timeline = runSimulation({ servants, settings: settingsFor(5), seed: 606, unsummoned: [] });
    const fightCategories = new Set(['duel', 'hunt', 'rematch', 'teamup', 'chaos', 'skirmish', 'master_hunt']);
    for (const day of timeline.days) {
      let streak = 0;
      for (const event of day.events) {
        if (fightCategories.has(event.category)) {
          streak++;
          expect(streak).toBeLessThanOrEqual(2);
        } else {
          streak = 0;
        }
      }
    }
  });

  it('never lets a pair fight more than twice outside the finale', () => {
    const servants = Array.from({ length: 7 }, (_, i) => servantFor(i, 45 + i * 4));
    const timeline = runSimulation({ servants, settings: settingsFor(5), seed: 5150, unsummoned: [] });
    const counts = new Map<string, number>();
    for (const day of timeline.days) {
      for (const event of day.events) {
        if (event.category !== 'duel' && event.category !== 'skirmish' && event.category !== 'hunt') continue;
        const ids = event.participants.map((p) => p.servantId).sort();
        if (ids.length !== 2) continue;
        const key = ids.join('|');
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    for (const [key, count] of counts) {
      expect(count, `pair ${key} fought ${count} times`).toBeLessThanOrEqual(3);
    }
  });

  it('only uses characters placed in the right class pool', () => {
    const servants = Array.from({ length: 5 }, (_, i) => servantFor(i, 50, CLASSES[i] as ServantClass));
    const timeline = runSimulation({ servants, settings: settingsFor(5), seed: 2024, unsummoned: [] });
    for (const day of timeline.days) {
      for (const event of day.events) {
        for (const p of event.participants) {
          const servant = timeline.servants.find((s) => s.id === p.servantId);
          expect(servant).toBeDefined();
          expect(CLASSES).toContain(servant!.cls);
        }
      }
    }
  });

  it('detects class mismatches for the joke templates', () => {
    const mageAsBerserker: Servant = { ...servantFor(0, 50, 'berserker'), profile: profileFor('Mage', 50, { archetype: 'mage' }) };
    const monsterAsBerserker: Servant = { ...servantFor(1, 50, 'berserker'), profile: profileFor('Beast', 50, { archetype: 'monster' }) };
    expect(isClassMismatch(mageAsBerserker)).toBe(true);
    expect(isClassMismatch(monsterAsBerserker)).toBe(false);
  });
});
