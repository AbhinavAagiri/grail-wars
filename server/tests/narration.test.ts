import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Profile, type RoomSettings, type Servant, type ServantClass, type WarLocation } from '@hgd/shared';
import { runSimulation } from '../src/sim/director';
import { randomWarLocations } from '../src/sim/locations';

const LOCATION: WarLocation = { id: 'new-york', name: 'New York City', country: 'United States', kind: 'megacity' };

function profileFor(name: string, score: number): Profile {
  return {
    key: name.toLowerCase(),
    name,
    source: 'Test',
    tierPeak: '7-B',
    tierBase: '7-B',
    tierIndex: 20,
    speed: 'Hypersonic',
    speedIndex: 8,
    durability: 'City',
    durabilityIndex: 10,
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
  };
}

function servantFor(i: number, cls: ServantClass): Servant {
  const name = `Servant${i}`;
  return {
    id: `s${i}`,
    playerId: `p${i}`,
    masterName: `Master${i}`,
    cls,
    character: { key: `t:${i}`, name, source: 'Test', provider: 'custom', imageUrl: '', submittedBy: `p${i}` },
    profile: profileFor(name, 50 + i),
  };
}

function settingsFor(overrides: Partial<RoomSettings['war']> = {}): RoomSettings {
  return {
    ...DEFAULT_SETTINGS,
    classes: [...DEFAULT_SETTINGS.classes],
    war: { ...DEFAULT_SETTINGS.war, days: 3, ...overrides },
    debate: { ...DEFAULT_SETTINGS.debate },
  };
}

const allText = (timeline: ReturnType<typeof runSimulation>): string =>
  timeline.days
    .flatMap((d) => d.events)
    .map((e) => e.tokens.map((t) => t.v).join(''))
    .join('\n');

describe('narration styles', () => {
  it('plays out like the Hunger Games when asked', () => {
    const servants = Array.from({ length: 7 }, (_, i) => servantFor(i, 'saber'));
    const timeline = runSimulation({
      servants,
      settings: settingsFor({ narration: 'hunger_games' }),
      seed: 11,
      unsummoned: [],
      warLocation: LOCATION,
    });
    const text = allText(timeline);
    expect(/Cornucopia|cannon|tributes|Games/i.test(text)).toBe(true);
    expect(text).toContain('New York City');
    expect(timeline.wish.toLowerCase()).toContain('tribute');
  });

  it('ties the narration back to the Fate franchise', () => {
    const servants = Array.from({ length: 6 }, (_, i) => servantFor(i, 'saber'));
    const timeline = runSimulation({
      servants,
      settings: settingsFor({ narration: 'fate' }),
      seed: 22,
      unsummoned: [],
      warLocation: LOCATION,
    });
    const text = allText(timeline);
    expect(/Grail|Spirit Origin|Throne of Heroes|Command Seal/i.test(text)).toBe(true);
    expect(text).toContain('New York City');
    expect(timeline.wish).toMatch(/Grail/i);
  });

  it('keeps the original wording for the templated style', () => {
    const servants = Array.from({ length: 5 }, (_, i) => servantFor(i, 'saber'));
    const timeline = runSimulation({
      servants,
      settings: settingsFor({ narration: 'templated' }),
      seed: 33,
      unsummoned: [],
    });
    const text = allText(timeline);
    expect(text).not.toMatch(/Cornucopia/i);
    expect(timeline.wish).toMatch(/wishes for/);
  });

  it('always still ends with exactly one winner', () => {
    for (const style of ['hunger_games', 'fate'] as const) {
      const servants = Array.from({ length: 8 }, (_, i) =>
        servantFor(i, (['saber', 'shielder', 'ruler', 'avenger', 'caster', 'lancer', 'archer', 'rider'] as ServantClass[])[i]),
      );
      const timeline = runSimulation({
        servants,
        settings: settingsFor({ narration: style }),
        seed: 99,
        unsummoned: [],
        warLocation: LOCATION,
      });
      const last = timeline.days[timeline.days.length - 1];
      expect(last.remaining).toHaveLength(1);
      expect(timeline.winnerId).toBe(last.remaining[0]);
    }
  });
});

describe('war locations', () => {
  it('offers distinct real-world options', () => {
    const options = randomWarLocations(() => 0.42, 3);
    expect(options).toHaveLength(3);
    expect(new Set(options.map((o) => o.id)).size).toBe(3);
    expect(options[0].name.length).toBeGreaterThan(2);
  });

  it('carries the setting into the narration', () => {
    const servants = Array.from({ length: 5 }, (_, i) => servantFor(i, 'saber'));
    const timeline = runSimulation({
      servants,
      settings: settingsFor({ narration: 'templated' }),
      seed: 7,
      unsummoned: [],
      warLocation: LOCATION,
    });
    const scavenging = timeline.days
      .flatMap((d) => d.events)
      .filter((e) => e.category === 'scouting')
      .map((e) => e.tokens.map((t) => t.v).join(''));
    expect(scavenging.some((t) => t.includes('New York City'))).toBe(true);
  });
});
