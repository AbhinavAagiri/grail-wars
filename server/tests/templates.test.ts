import { describe, expect, it } from 'vitest';
import type { Servant } from '@hgd/shared';
import { LOCATIONS, TEMPLATES, renderTemplate, unresolvedPlaceholders, type RenderContext } from '../src/sim/templates';

function makeServant(id: string, name: string, cls: Servant['cls'] = 'saber'): Servant {
  return {
    id,
    playerId: `player-${id}`,
    masterName: `Master ${id}`,
    cls,
    character: {
      key: id,
      name,
      source: 'Test',
      provider: 'custom',
      imageUrl: '',
      submittedBy: `player-${id}`,
    },
    profile: {
      key: id, name, source: 'Test',
      tierPeak: '7-B', tierBase: '7-B', tierIndex: 13,
      speed: 'Hypersonic', speedIndex: 8,
      durability: 'City', durabilityIndex: 15,
      range: 'Extended Melee Range', rangeIndex: 1,
      intelligence: 'Gifted', intelligenceIndex: 70,
      abilities: ['Weapon Mastery'], keyAbilityName: 'Test Strike',
      weaknesses: [], archetype: 'swordsman', tags: ['honorable'],
      alignment: 'good', haxScore: 6, confidence: 'high',
      sources: [], baseScore: 60,
    },
  };
}

const context: RenderContext = {
  actor: makeServant('a', 'Alpha'),
  target: makeServant('b', 'Beta'),
  ally: makeServant('c', 'Gamma'),
  winner: makeServant('a', 'Alpha'),
  loser: makeServant('b', 'Beta'),
  location: 'the old church',
  survivors: 4,
  day: 3,
};

describe('template rendering', () => {
  it('renders every variant of every template with no unresolved placeholders', () => {
    const failures: string[] = [];
    for (const tpl of TEMPLATES) {
      for (const text of tpl.text) {
        const tokens = renderTemplate(text, context);
        if (!tokens) {
          failures.push(`${tpl.id}: unknown placeholder in "${text}"`);
          continue;
        }
        const leftover = unresolvedPlaceholders(tokens);
        if (leftover.length) failures.push(`${tpl.id}: ${leftover.join(', ')}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('renders names as gold name tokens', () => {
    const tokens = renderTemplate('{A} fights {B} at {L}.', context);
    expect(tokens).not.toBeNull();
    const nameTokens = tokens!.filter((t) => t.t === 'name');
    expect(nameTokens).toHaveLength(2);
    expect(nameTokens[0].v).toBe('Alpha');
  });

  it('renders signature moves as np tokens', () => {
    const tokens = renderTemplate('{W} unleashes {NP_W}.', context);
    expect(tokens!.some((t) => t.t === 'np' && t.v === 'Test Strike')).toBe(true);
  });

  it('keeps the location as plain text (never a gold name token)', () => {
    const tokens = renderTemplate('They meet at {L}.', context);
    expect(tokens).toEqual([{ t: 'text', v: 'They meet at the old church.' }]);
    expect(tokens!.every((t) => t.t === 'text')).toBe(true);
  });

  it('falls back to a neutral word when a participant is missing', () => {
    const tokens = renderTemplate('{A} and {X} arrive.', { ...context, loser: undefined });
    const text = tokens!.map((t) => t.v).join('');
    expect(text).not.toContain('{');
    expect(text).toContain('a Servant');
  });

  it('rejects unknown placeholders instead of shipping them', () => {
    expect(renderTemplate('{NOPE} happens', context)).toBeNull();
  });

  it('writes gender-neutral prose (no him/her pronouns)', () => {
    const offenders: string[] = [];
    for (const tpl of TEMPLATES) {
      for (const text of tpl.text) {
        if (/\b(him|his|her|hers|she|he)\b/i.test(text)) offenders.push(`${tpl.id}: ${text}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has a large enough library with all required categories', () => {
    const byCategory = new Map<string, number>();
    for (const tpl of TEMPLATES) byCategory.set(tpl.category, (byCategory.get(tpl.category) ?? 0) + 1);
    const variants = TEMPLATES.reduce((sum, t) => sum + t.text.length, 0);

    expect(variants).toBeGreaterThanOrEqual(150);
    expect(templates().count('scouting')).toBeGreaterThanOrEqual(6);
    expect(templates().count('trap')).toBeGreaterThanOrEqual(3);
    expect(templates().count('social')).toBeGreaterThanOrEqual(8);
    expect(templates().count('alliance')).toBeGreaterThanOrEqual(5);
    expect(templates().count('alliance_break')).toBeGreaterThanOrEqual(3);
    expect(templates().count('betrayal')).toBeGreaterThanOrEqual(4);
    expect(templates().count('diplomacy')).toBeGreaterThanOrEqual(4);
    expect(templates().count('skirmish')).toBeGreaterThanOrEqual(8);
    expect(templates().count('duel')).toBeGreaterThanOrEqual(8);
    expect(templates().count('hunt')).toBeGreaterThanOrEqual(5);
    expect(templates().count('teamup')).toBeGreaterThanOrEqual(4);
    expect(templates().count('chaos')).toBeGreaterThanOrEqual(3);
    expect(templates().count('rematch')).toBeGreaterThanOrEqual(4);
    expect(templates().count('master')).toBeGreaterThanOrEqual(8);
    expect(templates().count('master_hunt')).toBeGreaterThanOrEqual(4);
    expect(templates().count('environmental')).toBeGreaterThanOrEqual(8);
    expect(templates().count('rest')).toBeGreaterThanOrEqual(4);
    expect(templates().count('flavor')).toBeGreaterThanOrEqual(14);
    expect(templates().count('personal')).toBeGreaterThanOrEqual(6);
    expect(templates().count('global')).toBeGreaterThanOrEqual(5);
    expect(templates().count('finale')).toBeGreaterThanOrEqual(4);
    expect(templates().count('wish')).toBeGreaterThanOrEqual(6);
  });

  it('has 16 locations with no trademarked names', () => {
    expect(LOCATIONS.length).toBe(16);
    for (const loc of LOCATIONS) {
      expect(loc.name).not.toMatch(/fuyuki|ryuudou|homurahara|einzbern|matou|tohsaka/i);
    }
  });

  it('gives every template a unique id', () => {
    const ids = new Set(TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(TEMPLATES.length);
  });
});

function templates() {
  return {
    count(category: string): number {
      return TEMPLATES.filter((t) => t.category === category).length;
    },
  };
}
