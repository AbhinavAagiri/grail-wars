import { describe, expect, it } from 'vitest';
import {
  nameMatchScore,
  rankVsbCandidates,
  scoreVsbPage,
  vsbQueries,
  type NameHints,
} from '../src/research/vsbLookup';
import type { VsBPage } from '../src/research/providers/vsbattles';

/*
 * The bug these tests pin down: Fate's "Saber" lives at "Artoria Pendragon
 * (Saber)" on VS Battles. Ranking by title similarity alone rejected that page
 * (the class parenthetical caps the score at 0.8), every lookup failed, and the
 * character was scaled from an unrelated Wikipedia article at the 10-C human
 * baseline.
 */

const saberHints: NameHints = {
  names: ['Artoria Pendragon', 'Saber', 'King Arthur'],
  titles: ['Fate/stay night', 'Fate/Zero'],
};

function page(overrides: Partial<VsBPage> = {}): VsBPage {
  return {
    title: 'Artoria Pendragon (Saber)',
    pageUrl: 'https://vsbattles.fandom.com/wiki/Artoria_Pendragon_(Saber)',
    fields: {
      Tier: 'High 6-C, Low 6-B with Excalibur',
      Speed: 'Massively Hypersonic',
      Durability: 'Large Island level+',
      Origin: 'Fate/stay night',
      Classification: 'Saber-class Servant',
      'Powers and Abilities': 'Superhuman Physical Characteristics, Weapon Mastery',
    },
    categories: ['Sword Users', 'Knights', 'Fate', 'Nasuverse'],
    empty: false,
    ...overrides,
  };
}

describe('vsbQueries', () => {
  it('searches the player name, the name plus source, and AniList names', () => {
    const queries = vsbQueries({ name: 'Saber', source: 'Fate/stay night' }, saberHints);
    expect(queries[0]).toBe('Saber');
    expect(queries).toContain('Saber Fate/stay night');
    expect(queries).toContain('Artoria Pendragon');
  });

  it('skips native-script aliases the wiki can never match', () => {
    const queries = vsbQueries(
      { name: 'Kirito', source: 'Sword Art Online' },
      { names: ['Kazuto Kirigaya', '桐ヶ谷和人'], titles: [] },
    );
    expect(queries.some((query) => query.includes('桐'))).toBe(false);
    expect(queries).toContain('Kazuto Kirigaya');
  });
});

describe('rankVsbCandidates', () => {
  it('prefers the page whose bare title is one of the character names', () => {
    const ranked = rankVsbCandidates({ name: 'Saber', source: 'Fate/stay night' }, saberHints, [
      {
        hit: { title: 'Altria Pendragon (Honkai: Star Rail)', pageId: 1, snippet: '' },
        position: 0,
      },
      {
        hit: { title: 'Artoria Pendragon (Saber)', pageId: 2, snippet: '' },
        position: 1,
      },
    ]);
    expect(ranked[0]?.title).toBe('Artoria Pendragon (Saber)');
  });
});

describe('scoreVsbPage', () => {
  it('scores a page whose Origin names the source above a namesake', () => {
    const right = scoreVsbPage({ name: 'Saber', source: 'Fate/stay night' }, saberHints, page());
    const namesake = scoreVsbPage(
      { name: 'Saber', source: 'Fate/stay night' },
      saberHints,
      page({
        title: 'Altria Pendragon (Honkai: Star Rail)',
        fields: { Tier: '1-A', Origin: 'Honkai: Star Rail', Classification: 'Saber' },
        categories: ['Honkai: Star Rail'],
      }),
    );
    expect(right).toBeGreaterThan(namesake);
  });

  it('gives credit when the parenthetical is one of the character names', () => {
    const withQualifier = scoreVsbPage({ name: 'Saber', source: 'Fate/stay night' }, saberHints, page());
    const withoutQualifier = scoreVsbPage(
      { name: 'Saber', source: 'Fate/stay night' },
      saberHints,
      page({ title: 'Artoria Pendragon' }),
    );
    expect(withQualifier).toBeGreaterThan(withoutQualifier);
  });
});

describe('nameMatchScore', () => {
  it('treats different word order as the same character', () => {
    expect(nameMatchScore('Son Goku', 'Gokuu Son')).toBe(1);
    expect(nameMatchScore('Artoria Pendragon', 'Artoria Pendragon (Saber)')).toBe(2);
    expect(nameMatchScore('Artoria Pendragon', 'Heroine X')).toBe(0);
  });
});
