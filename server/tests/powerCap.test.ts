import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, POWER_CAPS, type Profile } from '@hgd/shared';
import { applyPowerCap, parsePowerCap } from '../src/research/powerCap';
import { LEVELS, RANGE_SCALE, SPEED_SCALE, TIERS } from '../src/research/tiers';

/*
 * The rules of war offer a Max Power level — a hard cap. Anything researched
 * above it is scaled down to it, because a Servant's tier is only known once
 * research has run. Default: 4-B, Solar System.
 */

function profileFor(overrides: Partial<Profile> = {}): Profile {
  return {
    key: 'test',
    name: 'Test',
    source: 'Test',
    tierPeak: '9-C',
    tierBase: '9-C',
    tierIndex: TIERS.indexOf('9-C'),
    speed: 'Superhuman',
    speedIndex: SPEED_SCALE.indexOf('Superhuman'),
    durability: 'Street',
    durabilityIndex: LEVELS.indexOf('Street'),
    range: 'Extended Melee Range',
    rangeIndex: 1,
    intelligence: 'Average',
    intelligenceIndex: 45,
    abilities: [],
    keyAbilityName: 'Strike',
    weaknesses: [],
    archetype: 'fighter',
    tags: ['honorable'],
    alignment: 'good',
    haxScore: 10,
    confidence: 'high',
    sources: [],
    baseScore: 20,
    ...overrides,
  };
}

describe('the Max Power level', () => {
  it('defaults to 4-B Solar System', () => {
    expect(DEFAULT_SETTINGS.war.maxPowerLevel).toBe('4-B');
    expect(POWER_CAPS.find((cap) => cap.value === '4-B')?.label).toBe('4-B Solar System');
  });

  it('parses a tier code and ignores anything else', () => {
    expect(parsePowerCap('4-B')?.index).toBe(TIERS.indexOf('4-B'));
    expect(parsePowerCap('High 6-A')?.index).toBeCloseTo(TIERS.indexOf('6-A') + 0.33, 5);
    expect(parsePowerCap('Unknown')).toBeNull();
    expect(parsePowerCap('nonsense')).toBeNull();
    expect(parsePowerCap(undefined)).toBeNull();
  });

  it('leaves a Servant at or below the cap completely untouched', () => {
    const low = profileFor();
    expect(applyPowerCap(low, '4-B')).toBe(low);
    const exactly = profileFor({ tierPeak: '4-B', tierBase: '4-B', tierIndex: TIERS.indexOf('4-B') });
    expect(applyPowerCap(exactly, '4-B')).toBe(exactly);
  });

  it('scales everything above the cap down to it', () => {
    const goku = profileFor({
      name: 'Goku',
      tierPeak: '2-A',
      tierBase: '2-A',
      tierIndex: TIERS.indexOf('2-A'),
      speed: 'Immeasurable',
      speedIndex: SPEED_SCALE.indexOf('Immeasurable'),
      durability: 'Multiverse',
      durabilityIndex: LEVELS.indexOf('Multiverse'),
      range: 'Multiverse Range',
      rangeIndex: RANGE_SCALE.indexOf('Multiverse Range'),
      haxScore: 95,
      baseScore: 96.5,
    });

    const capped = applyPowerCap(goku, '4-B');

    expect(capped.tierPeak).toBe('4-B');
    expect(capped.tierBase).toBe('4-B');
    expect(capped.tierIndex).toBe(TIERS.indexOf('4-B'));
    expect(capped.speedIndex).toBeLessThan(goku.speedIndex);
    expect(capped.durabilityIndex).toBeLessThan(goku.durabilityIndex);
    expect(capped.rangeIndex).toBeLessThan(goku.rangeIndex);
    expect(capped.haxScore).toBeLessThan(goku.haxScore);
    expect(capped.baseScore).toBeLessThan(goku.baseScore);
    expect(capped.capped).toEqual({ level: '4-B', from: '2-A' });
    // The labels follow the clamped indices, so the Review screen cannot show
    // "Immeasurable" next to a Solar-System tier.
    expect(capped.speed).toBe(SPEED_SCALE[capped.speedIndex]);
    expect(capped.durability).toBe(LEVELS[capped.durabilityIndex]);
    expect(capped.range).toBe(RANGE_SCALE[capped.rangeIndex]);
    // The researched profile itself is not mutated: raising the cap restores it.
    expect(goku.tierPeak).toBe('2-A');
    expect(goku.baseScore).toBe(96.5);
  });

  it('holds a Servant to a tighter cap the host chooses', () => {
    const capped = applyPowerCap(profileFor({ tierIndex: TIERS.indexOf('6-A'), tierPeak: '6-A' }), '7-A');
    expect(capped.tierPeak).toBe('7-A');
    expect(capped.capped?.from).toBe('6-A');
  });
});
