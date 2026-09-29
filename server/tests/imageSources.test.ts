import { describe, expect, it, vi } from 'vitest';
import type { Character } from '@hgd/shared';
import { generatedAvatar, isPlaceholderImage } from '../src/util/imageUrl';
import { bestAniListMatch, buildImageCandidates, isAnimeMangaCharacter } from '../src/research';

/*
 * Every provider is stubbed so these tests describe the *rules* of the image
 * waterfall rather than the network: anime and manga characters are pictured
 * with anime/manga artwork, everybody else may fall back to Wikipedia, and a
 * generated initials avatar is never allowed to shadow real art.
 */

vi.mock('../src/research/providers/anilist', async () => ({
  // Keep the real helpers (bareName, displayName, …); only the network call is stubbed.
  ...(await vi.importActual<typeof import('../src/research/providers/anilist')>(
    '../src/research/providers/anilist',
  )),
  searchAniList: vi.fn(async (query: string) => {
    const q = query.toLowerCase();
    if (q.includes('kirito')) {
      return [
        {
          providerId: '1',
          // AniList files Kirito under his legal name, with the alias alongside.
          name: 'Kazuto Kirigaya',
          source: 'Sword Art Online',
          thumb: 'https://anilist.example/kirito.jpg',
          aliases: ['Kirito (キリト)', 'The Black Swordsman'],
          titles: ['Sword Art Online'],
        },
      ];
    }
    if (q.includes('achilles')) {
      return [{ providerId: '9', name: 'Achilles', source: 'Fate/Apocrypha', thumb: 'https://anilist.example/achilles.jpg' }];
    }
    return [];
  }),
  getAniListCharacter: vi.fn(async () => null),
}));

vi.mock('../src/research/providers/vsbattles', () => ({
  searchVsb: vi.fn(async () => []),
  fetchVsbPage: vi.fn(async () => null),
  getVsbImage: vi.fn(async (title: string) =>
    title.toLowerCase().includes('kirito') ? 'https://vsb.example/kirito.png' : null,
  ),
}));

vi.mock('../src/research/providers/fandom', () => ({
  resolveWikiSubdomain: vi.fn(() => null),
  searchFandom: vi.fn(async () => []),
  getFandomPageImage: vi.fn(async () => null),
}));

vi.mock('../src/research/providers/wikipedia', () => ({
  searchWikipedia: vi.fn(async () => []),
  getWikipediaSummary: vi.fn(async () => null),
  getWikipediaImage: vi.fn(async (title: string) => `https://wiki.example/${encodeURIComponent(title)}.jpg`),
}));

vi.mock('../src/research/providers/tmdb', () => ({
  searchTmdb: vi.fn(async () => []),
  getTmdbImage: vi.fn(async () => 'https://tmdb.example/poster.jpg'),
}));

vi.mock('../src/research/providers/imageSearch', () => ({
  imageSearchEnabled: vi.fn(() => false),
  searchImages: vi.fn(async () => []),
}));

function character(overrides: Partial<Character> & { name: string }): Character {
  return {
    key: `k:${overrides.name}`,
    source: 'Wikipedia',
    provider: 'wikipedia',
    imageUrl: generatedAvatar(overrides.name),
    submittedBy: 'p1',
    ...overrides,
  };
}

const kirito = character({ name: 'Kirito (Post-Aincrad)', source: 'VS Battles Wiki', provider: 'vsb' });
const achilles = character({ name: 'Achilles', source: 'Greek mythology', provider: 'fallback' });

describe('isPlaceholderImage', () => {
  it('recognises the generated initials avatar', () => {
    expect(isPlaceholderImage(generatedAvatar('Kirito'))).toBe(true);
    expect(isPlaceholderImage('')).toBe(true);
  });

  it('treats real artwork and uploads as real pictures', () => {
    expect(isPlaceholderImage('https://anilist.example/kirito.jpg')).toBe(false);
    expect(isPlaceholderImage('/media/abc123')).toBe(false);
  });

  it('recognises the silhouette AniList serves for characters it has no art for', () => {
    const proxied =
      '/api/image-proxy?url=https%3A%2F%2Fs4.anilist.co%2Ffile%2Fanilistcdn%2Fcharacter%2Flarge%2Fdefault.jpg';
    expect(isPlaceholderImage(proxied)).toBe(true);
  });
});

describe('isAnimeMangaCharacter', () => {
  it('accepts an AniList pick outright', () => {
    expect(isAnimeMangaCharacter(character({ name: 'Rin', provider: 'anilist', source: 'Fate/stay night' }))).toBe(true);
  });

  it('accepts a source that names a drawn medium', () => {
    expect(isAnimeMangaCharacter(character({ name: 'Rin', source: 'Fate/Zero (Visual Novel)' }))).toBe(true);
    expect(isAnimeMangaCharacter(character({ name: 'Rin', source: 'One Piece (manga)' }))).toBe(true);
  });

  it('accepts a confirmed AniList match', () => {
    expect(isAnimeMangaCharacter(kirito, { providerId: '1', name: 'Kirito', source: 'Sword Art Online', thumb: 'x' })).toBe(true);
  });

  it('leaves ordinary wiki characters alone', () => {
    expect(isAnimeMangaCharacter(achilles)).toBe(false);
    expect(isAnimeMangaCharacter(character({ name: 'John Wick', source: 'John Wick', provider: 'tmdb' }))).toBe(false);
  });

  it('exempts real-world figures: the Achilles of myth is not the anime one', () => {
    const fateAchilles = { providerId: '1', name: 'Achilles', source: 'Fate/Apocrypha', thumb: 'https://anilist.example/a.jpg' };
    expect(isAnimeMangaCharacter(achilles, fateAchilles)).toBe(false);
    // …but the same match classifies a non-history pick as anime/manga.
    expect(isAnimeMangaCharacter(character({ name: 'Achilles', source: 'VS Battles Wiki', provider: 'vsb' }), fateAchilles)).toBe(true);
  });

  it('classifies an anime character even when the pick came from Wikipedia', () => {
    const fromWikipedia = character({ name: 'Naruto Uzumaki', source: 'Wikipedia', provider: 'wikipedia' });
    expect(isAnimeMangaCharacter(fromWikipedia, { providerId: 'x', name: 'Naruto Uzumaki', source: 'Naruto', thumb: 'y' })).toBe(true);
  });
});

describe('bestAniListMatch', () => {
  it('matches a version-qualified name to the plain entry', () => {
    const match = bestAniListMatch(kirito, [
      { providerId: '1', name: 'Kirito', source: 'Sword Art Online', thumb: 'https://anilist.example/kirito.jpg' },
    ]);
    expect(match?.name).toBe('Kirito');
  });

  it('refuses to hand a character somebody else\'s portrait', () => {
    const match = bestAniListMatch(achilles, [
      { providerId: '1', name: 'Kirito', source: 'Sword Art Online', thumb: 'https://anilist.example/kirito.jpg' },
    ]);
    expect(match).toBeNull();
  });

  it('ignores entries with no artwork', () => {
    expect(bestAniListMatch(kirito, [{ providerId: '1', name: 'Kirito', source: 'SAO', thumb: '' }])).toBeNull();
  });

  it('matches the alias an anime database files a character under', () => {
    const match = bestAniListMatch(kirito, [
      {
        providerId: '1',
        name: 'Kazuto Kirigaya',
        source: 'Sword Art Online',
        thumb: 'https://anilist.example/kirito.jpg',
        aliases: ['Kirito (キリト)', 'The Black Swordsman'],
      },
    ]);
    expect(match?.name).toBe('Kazuto Kirigaya');
  });

  it('still refuses an alias that belongs to somebody else', () => {
    expect(
      bestAniListMatch(kirito, [
        {
          providerId: '2',
          name: 'Kirito Kamui',
          source: 'PSYCHO-PASS 2',
          thumb: 'https://anilist.example/kamui.jpg',
          aliases: ['Kamui'],
        },
      ]),
    ).toBeNull();
  });

  it('finds a character filed under their series instead of their own name', () => {
    const lupin = character({ name: 'Lupin III', source: 'Lupin III', provider: 'fallback' });
    const match = bestAniListMatch(lupin, [
      {
        providerId: '4',
        name: 'Arsène Lupin III',
        source: 'Lupin the 3rd',
        thumb: 'https://anilist.example/lupin.jpg',
        aliases: ['Lupin Sansei', 'Wolf'],
        titles: ['Lupin III', 'Lupin the 3rd'],
      },
    ]);
    expect(match?.name).toBe('Arsène Lupin III');
  });

  it('does not stretch the series match to a different character in that series', () => {
    const lupin = character({ name: 'Lupin III', source: 'Lupin III', provider: 'fallback' });
    expect(
      bestAniListMatch(lupin, [
        {
          providerId: '5',
          name: 'Daisuke Jigen',
          source: 'Lupin the 3rd',
          thumb: 'https://anilist.example/jigen.jpg',
          titles: ['Lupin III'],
        },
      ]),
    ).toBeNull();
  });

  it('matches a reordered or re-romanised name', () => {
    const goku = character({ name: 'Son Goku (Dragon Ball)', source: 'VS Battles Wiki', provider: 'vsb' });
    const match = bestAniListMatch(goku, [
      { providerId: '2', name: 'Gokuu Son', source: 'Dragon Ball', thumb: 'https://anilist.example/goku.jpg' },
    ]);
    expect(match?.name).toBe('Gokuu Son');
  });

  it('still tells similar names apart', () => {
    const goku = character({ name: 'Son Goku', source: 'VS Battles Wiki', provider: 'vsb' });
    expect(
      bestAniListMatch(goku, [
        { providerId: '3', name: 'Son Goten', source: 'Dragon Ball', thumb: 'https://anilist.example/goten.jpg' },
      ]),
    ).toBeNull();
  });
});

describe('buildImageCandidates', () => {
  it('pictures an anime character with anime/manga artwork only', async () => {
    const images = await buildImageCandidates(kirito);
    expect(images[0]).toContain('anilist');
    expect(images.some((url) => url.includes('wiki.example'))).toBe(false);
    expect(images.some((url) => url.includes('tmdb.example'))).toBe(false);
  });

  it('keeps the encyclopaedia lead image for real-world characters', async () => {
    const images = await buildImageCandidates(achilles);
    expect(images[0]).toContain('wiki.example');
    expect(images.some((url) => url.includes('tmdb.example'))).toBe(true);
  });

  it('uses anime artwork for an anime character picked through Wikipedia', async () => {
    const fromWikipedia = character({ name: 'Achilles', source: 'Wikipedia', provider: 'wikipedia' });
    const images = await buildImageCandidates(fromWikipedia);
    expect(images[0]).toContain('anilist');
    expect(images.some((url) => url.includes('wiki.example'))).toBe(false);
  });

  it('keeps the generated avatar as the last resort, never the lead', async () => {
    const images = await buildImageCandidates(kirito);
    expect(isPlaceholderImage(images[0])).toBe(false);
    expect(isPlaceholderImage(images[images.length - 1])).toBe(true);
  });

  it('never lets a placeholder override a picture the player chose', async () => {
    const picked = await buildImageCandidates({ ...achilles, imageUrl: '/media/uploaded-portrait' });
    expect(picked[0]).toBe('/media/uploaded-portrait');
    // upload, Wikipedia, TMDB, AniList artwork for the same name, avatar
    expect(picked).toHaveLength(5);
  });
});
