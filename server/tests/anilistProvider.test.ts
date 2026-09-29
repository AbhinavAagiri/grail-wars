import { describe, expect, it, vi } from 'vitest';

/*
 * AniList files characters under their in-universe legal name and keeps the name
 * everyone actually uses in `alternative` — Kirito is "Kazuto Kirigaya". These
 * tests pin the two things that broke when we ignored that: the name shown back
 * to a player who searched the alias, and the artwork AniList returns for a
 * character it has no picture of.
 */

vi.mock('../src/util/http', () => ({
  politePostJson: vi.fn(),
  politeJson: vi.fn(),
  politeFetch: vi.fn(),
  sleep: vi.fn(async () => undefined),
  HttpError: class HttpError extends Error {},
}));

const { politePostJson } = await import('../src/util/http');
const { searchAniList, nameVariants, displayName, hasArtwork, mediaTitles } = await import(
  '../src/research/providers/anilist'
);

function payload(characters: unknown[]) {
  return { data: { Page: { characters } } };
}

const kiritoNode = {
  id: 36765,
  name: {
    full: 'Kazuto Kirigaya',
    native: '桐ヶ谷和人',
    userPreferred: 'Kazuto Kirigaya',
    alternative: ['Kirito (キリト)', 'The Black Swordsman', 'Daddy'],
  },
  image: { large: 'https://s4.anilist.co/file/anilistcdn/character/large/b36765-BnLbXg0Tzzh9.png' },
  media: { nodes: [{ title: { romaji: 'Sword Art Online', english: 'Sword Art Online' } }] },
};

const noArtworkNode = {
  id: 341115,
  name: { full: 'Kirito Kujou', alternative: [] },
  image: { large: 'https://s4.anilist.co/file/anilistcdn/character/large/default.jpg' },
  media: { nodes: [{ title: { romaji: 'Tasogare Outfocus', english: 'Twilight Out of Focus' } }] },
};

describe('nameVariants', () => {
  it('collects the official, preferred, native and alternative names', () => {
    expect(nameVariants(kiritoNode)).toEqual([
      'Kazuto Kirigaya',
      '桐ヶ谷和人',
      'Kirito (キリト)',
      'The Black Swordsman',
      'Daddy',
    ]);
  });
});

describe('displayName', () => {
  it('shows the alias the player searched for', () => {
    expect(displayName('Kazuto Kirigaya', nameVariants(kiritoNode), 'kirito')).toBe('Kirito');
  });

  it('keeps the official name when it already contains the search term', () => {
    expect(displayName('Naruto Uzumaki', ['Naruto Uzumaki'], 'naruto')).toBe('Naruto Uzumaki');
    expect(displayName('Son Goku', ['Son Goku', 'Kakarot'], 'goku')).toBe('Son Goku');
  });

  it('leaves the name alone when no alias matches', () => {
    expect(displayName('Kazuto Kirigaya', nameVariants(kiritoNode), 'asuna')).toBe('Kazuto Kirigaya');
  });
});

describe('hasArtwork', () => {
  it('rejects the grey silhouette AniList serves for characters it has no art for', () => {
    expect(hasArtwork('https://s4.anilist.co/file/anilistcdn/character/large/default.jpg')).toBe(false);
    expect(hasArtwork('')).toBe(false);
    expect(hasArtwork('https://s4.anilist.co/file/anilistcdn/character/large/b36765.png')).toBe(true);
  });
});

describe('mediaTitles', () => {
  it('keeps both romaji and English titles', () => {
    const node = {
      media: { nodes: [{ title: { romaji: 'Lupin III', english: 'Lupin the 3rd' } }] },
    };
    expect(mediaTitles(node)).toEqual(['Lupin III', 'Lupin the 3rd']);
  });
});

describe('searchAniList', () => {
  it('answers a search for the alias and carries the aliases and works along', async () => {
    vi.mocked(politePostJson).mockResolvedValue(payload([kiritoNode, noArtworkNode]));
    const candidates = await searchAniList('Kirito');

    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.name).toBe('Kirito');
    expect(candidates[0]!.source).toBe('Sword Art Online');
    expect(candidates[0]!.aliases).toContain('The Black Swordsman');
    expect(candidates[0]!.aliases).toContain('桐ヶ谷和人');
    expect(candidates[0]!.titles).toEqual(['Sword Art Online']);
  });

  it('drops entries that only have the placeholder silhouette', async () => {
    vi.mocked(politePostJson).mockResolvedValue(payload([kiritoNode, noArtworkNode]));
    const candidates = await searchAniList('Kirito');
    expect(candidates[1]!.name).toBe('Kirito Kujou');
    expect(candidates[1]!.thumb).toBe('');
  });

  it('passes the query through to the API', async () => {
    vi.mocked(politePostJson).mockResolvedValue(payload([]));
    await searchAniList('Rimuru Tempest');
    expect(vi.mocked(politePostJson)).toHaveBeenCalledWith('https://graphql.anilist.co', {
      query: expect.stringContaining('characters(search: $q)'),
      variables: { q: 'Rimuru Tempest' },
    });
  });

  it('returns nothing when the API answers with a non-list', async () => {
    vi.mocked(politePostJson).mockResolvedValue({ data: null });
    expect(await searchAniList('Kirito')).toEqual([]);
  });
});
