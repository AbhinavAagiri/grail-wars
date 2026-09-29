import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEVELS,
  SPEED_SCALE,
  TIERS,
  parseDurability,
  parseIntelligence,
  parseRange,
  parseSpeed,
  parseTier,
} from '../src/research/tiers';
import { extractFields, htmlToLines, parseVsbPage } from '../src/research/parseVsb';
import { extractAbilities, deriveAlignment, deriveArchetype, deriveTags, fallbackTier } from '../src/research/heuristics';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
function fixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

describe('tier parsing', () => {
  it('parses a simple tier', () => {
    const result = parseTier('Tier: 7-B');
    expect(result.tierPeak).toBe('7-B');
    expect(result.tierIndex).toBe((TIERS as readonly string[]).indexOf('7-B'));
  });

  it('handles Low and High prefixes', () => {
    const low = parseTier('Low 2-C');
    expect(low.tierPeak).toBe('Low 2-C');
    expect(low.tierIndex).toBeCloseTo((TIERS as readonly string[]).indexOf('2-C') - 0.33, 5);

    const high = parseTier('High 6-A');
    expect(high.tierPeak).toBe('High 6-A');
    expect(high.tierIndex).toBeCloseTo((TIERS as readonly string[]).indexOf('6-A') + 0.33, 5);
  });

  it('treats High 1-A as its own entry, not a modifier', () => {
    const result = parseTier('High 1-A');
    expect(result.tierIndex).toBe((TIERS as readonly string[]).indexOf('High 1-A'));
  });

  it('picks the peak from "At least 5-B, likely 4-C"', () => {
    const result = parseTier('At least 5-B, likely 4-C');
    expect(result.tierPeak).toBe('4-C');
    expect(result.tierIndex).toBe((TIERS as readonly string[]).indexOf('4-C'));
  });

  it('ignores tiers hedged with Possibly / Unknown', () => {
    const result = parseTier('7-B, possibly 5-A');
    expect(result.tierPeak).toBe('7-B');

    const onlyHedged = parseTier('Possibly 5-A');
    expect(onlyHedged.tierPeak).toBe('Unknown');
    expect(onlyHedged.uncertain).toBe(true);
  });

  it('takes the highest accepted token when several are listed', () => {
    // "Low 2-C" sits just below 2-C and well above "High 6-A", so it wins.
    const result = parseTier('Low 2-C | High 6-A');
    expect(result.tierPeak).toBe('Low 2-C');
    expect(result.tierIndex).toBeGreaterThan((TIERS as readonly string[]).indexOf('6-A'));
    expect(result.tierIndex).toBeLessThan((TIERS as readonly string[]).indexOf('2-C'));
  });

  it('exposes a monotonic ordering', () => {
    expect(TIERS.length).toBeGreaterThan(20);
    expect((TIERS as readonly string[]).indexOf('7-B')).toBeGreaterThan(
      (TIERS as readonly string[]).indexOf('9-C'),
    );
  });
});

describe('speed parsing prefers the longest match', () => {
  it('reads Massively Hypersonic over Hypersonic', () => {
    expect(parseSpeed('Massively Hypersonic')?.label).toBe('Massively Hypersonic');
  });
  it('reads Sub-Relativistic over Relativistic', () => {
    expect(parseSpeed('Sub-Relativistic')?.label).toBe('Sub-Relativistic');
  });
  it('reads MFTL', () => {
    expect(parseSpeed('MFTL')?.label).toBe('MFTL');
    expect(parseSpeed('Massively FTL')?.label).toBe('MFTL');
  });
  it('orders scales correctly', () => {
    const slow = parseSpeed('Peak Human')!.index;
    const fast = parseSpeed('MFTL')!.index;
    expect(fast).toBeGreaterThan(slow);
    expect(SPEED_SCALE[fast]).toBe('MFTL');
  });
});

describe('durability and range parsing', () => {
  it('reads level words', () => {
    expect(parseDurability('City level')?.label).toBe('City');
    expect(parseDurability('Small Country level')?.label).toBe('Small Country');
  });
  it('prefers the higher level word when several appear', () => {
    expect(parseDurability('Wall level, higher with shields (City level)')?.label).toBe('City');
  });
  it('returns null for unknown durability', () => {
    expect(parseDurability('Unknown')).toBeNull();
  });
  it('maps range words', () => {
    expect(parseRange('Extended Melee Range')?.label).toBe('Extended Melee Range');
    const long = parseRange('Kilometers');
    const melee = parseRange('Standard Melee Range');
    expect(long!.index).toBeGreaterThan(melee!.index);
  });
  it('keeps the level scale ordered', () => {
    expect(LEVELS.indexOf('City')).toBeGreaterThan(LEVELS.indexOf('Wall'));
  });
});

describe('intelligence parsing', () => {
  it('maps labels to scores', () => {
    expect(parseIntelligence('Nigh-Omniscient').index).toBe(100);
    expect(parseIntelligence('Genius').index).toBe(85);
    expect(parseIntelligence('Gifted').index).toBe(70);
    expect(parseIntelligence('something else').index).toBe(45);
  });
});

describe('VS Battles page parsing', () => {
  it('extracts the stat block from a clean page', () => {
    const page = parseVsbPage(fixture('vsb-tier7b.html'));
    expect(page.empty).toBe(false);
    expect(page.fields.Tier).toContain('7-B');
    expect(page.fields.Speed).toBe('Hypersonic');
    expect(page.fields.Durability).toBe('City level');
    expect(page.fields['Powers and Abilities']).toContain('Weapon Mastery');
    expect(page.fields.Intelligence).toBe('Gifted');
    expect(page.imageUrl).toContain('static.wikia.nocookie.net');
  });

  it('does not bleed one field into the next', () => {
    const page = parseVsbPage(fixture('vsb-tier7b.html'));
    expect(page.fields.Speed).not.toContain('Durability');
    expect(page.fields.Durability).not.toContain('Stamina');
  });

  it('reads multi-tier hedged wording', () => {
    const page = parseVsbPage(fixture('vsb-multitier.html'));
    const tier = parseTier(`${page.fields.Tier ?? ''} ${page.fields['Attack Potency'] ?? ''}`);
    expect(tier.tierPeak).toBe('4-C');
    expect(parseSpeed(page.fields.Speed ?? '')?.label).toBe('Massively Hypersonic');
    expect(parseDurability(page.fields.Durability ?? '')?.label).toBe('Small Country');
  });

  it('reads Low/High prefixed tiers from a page', () => {
    const page = parseVsbPage(fixture('vsb-low2c.html'));
    const tier = parseTier(page.fields.Tier ?? '');
    expect(tier.tierPeak).toBe('Low 2-C');
    expect(tier.tierIndex).toBeGreaterThan((TIERS as readonly string[]).indexOf('6-A'));
  });

  it('flattens HTML into clean lines', () => {
    const lines = htmlToLines('<p>Hello<br/>World</p><ul><li>Item</li></ul>');
    expect(lines).toEqual(['Hello', 'World', 'Item']);
  });

  it('parses label/value pairs, joining continuation lines', () => {
    const fields = extractFields(['Tier: 9-A', 'Speed: Supersonic', 'more speed text', 'Durability: Wall level']);
    expect(fields.Tier).toBe('9-A');
    expect(fields.Speed).toBe('Supersonic more speed text');
    expect(fields.Durability).toBe('Wall level');
  });
});

describe('ability extraction and hax scoring', () => {
  it('scores reality warping above plain combat skills', () => {
    const plain = extractAbilities('Martial Arts, Weapon Mastery');
    const crazy = extractAbilities('Reality Warping, Existence Erasure');
    expect(crazy.haxScore).toBeGreaterThan(plain.haxScore);
    expect(crazy.abilities.map((a) => a.name)).toContain('Reality Warping');
  });

  it('caps resistances at 15', () => {
    const many = Array.from({ length: 12 }, (_, i) => `Resistance to Thing${i}`).join(', ');
    const { haxScore } = extractAbilities(many);
    expect(haxScore).toBeLessThanOrEqual(15);
  });

  it('does not double count a broad and a narrow rule', () => {
    const { abilities } = extractAbilities('Regeneration (High-Godly)');
    expect(abilities.map((a) => a.name)).toEqual(['Regeneration (High-Godly)']);
  });
});

describe('tags, alignment and archetype', () => {
  it('derives evil alignment from ruthless text', () => {
    const tags = deriveTags('a tyrant who murders anyone who opposes him', 'test-key');
    expect(tags).toContain('ruthless');
    expect(deriveAlignment(tags)).toBe('evil');
  });

  it('derives good alignment from honorable text', () => {
    const tags = deriveTags('a knight bound by honor and duty who protects the weak', 'test-key-2');
    expect(deriveAlignment(tags)).toBe('good');
  });

  it('always returns three tags, deterministically', () => {
    const a = deriveTags('nothing useful here', 'stable-key');
    const b = deriveTags('nothing useful here', 'stable-key');
    expect(a).toHaveLength(3);
    expect(a).toEqual(b);
  });

  it('derives archetypes', () => {
    expect(deriveArchetype('a master swordsman')).toBe('swordsman');
    expect(deriveArchetype('an archmage')).toBe('mage');
    expect(deriveArchetype('a sniper')).toBe('ranged');
    expect(deriveArchetype('a dragon')).toBe('monster');
    expect(deriveArchetype('someone ordinary')).toBe('fighter');
  });
});

describe('heuristic fallback tiers', () => {
  it('uses keywords when no wiki page exists', () => {
    expect(fallbackTier('a primordial god of creation').tier).toBe('3-A');
    expect(fallbackTier('an ancient dragon').tier).toBe('7-A');
    expect(fallbackTier('a vampire noble').tier).toBe('9-A');
    expect(fallbackTier('a samurai of the Edo period').tier).toBe('9-B');
    expect(fallbackTier('a detective in London').tier).toBe('10-B');
    expect(fallbackTier('a quiet historian').tier).toBe('10-C');
  });
});
