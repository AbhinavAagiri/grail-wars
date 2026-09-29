import { describe, expect, it } from 'vitest';
import type { SearchCandidate } from '@hgd/shared';
import { characterScore, hasCharacterSignal, isCharacterCandidate } from '../src/api/characterFilter';

function candidate(overrides: Partial<SearchCandidate>): SearchCandidate {
  return {
    key: 'k',
    name: 'Name',
    source: 'Wikipedia',
    provider: 'wikipedia',
    thumb: '',
    ...overrides,
  };
}

describe('character search filtering', () => {
  it('always keeps results from character databases', () => {
    for (const provider of ['anilist', 'tmdb', 'fallback', 'custom'] as const) {
      const c = candidate({ provider, name: 'Lancer', blurb: 'The Mitsubishi Lancer is an automobile.' });
      expect(isCharacterCandidate(c, 'lancer')).toBe(true);
    }
  });

  it('rejects the abstract noun when the player types a class name', () => {
    const assassination = candidate({
      name: 'Assassination',
      blurb: 'Assassination is the wilful murder of a notable person, carried out suddenly.',
    });
    expect(isCharacterCandidate(assassination, 'assassin')).toBe(false);
  });

  it('rejects the car when the player types "lancer"', () => {
    const car = candidate({
      name: 'Mitsubishi Lancer',
      blurb: 'The Mitsubishi Lancer is an automobile produced by Mitsubishi Motors since 1973.',
    });
    expect(isCharacterCandidate(car, 'lancer')).toBe(false);
  });

  it('rejects the sword when the player types "saber"', () => {
    const sword = candidate({
      name: 'Saber',
      blurb: 'A sabre is a type of backsword with a curved blade used by cavalry.',
    });
    expect(isCharacterCandidate(sword, 'saber')).toBe(false);
  });

  it('rejects places and works', () => {
    const paris = candidate({ name: 'Paris', blurb: 'Paris is the capital and largest city of France.' });
    const film = candidate({
      name: 'Lancer (2019 film)',
      blurb: 'Lancer is a 2019 film directed by an independent filmmaker.',
    });
    expect(isCharacterCandidate(paris, 'paris')).toBe(false);
    expect(isCharacterCandidate(film, 'lancer')).toBe(false);
  });

  it('keeps historical figures, legends and characters', () => {
    const king = candidate({ name: 'King Arthur', blurb: 'King Arthur is a legendary British leader of the late 5th century.' });
    const naruto = candidate({ name: 'Naruto Uzumaki', blurb: 'Naruto Uzumaki is a fictional character and the protagonist of the manga Naruto.' });
    const caesar = candidate({ name: 'Julius Caesar', blurb: 'Gaius Julius Caesar was a Roman general and statesman.' });
    const kirito = candidate({ name: 'Kirito', blurb: 'Kirito is the protagonist of the Sword Art Online light novels.' });
    const disambiguated = candidate({ name: 'Kirito (Sword Art Online)', blurb: '' });

    expect(isCharacterCandidate(king, 'king arthur')).toBe(true);
    expect(isCharacterCandidate(naruto, 'naruto')).toBe(true);
    expect(isCharacterCandidate(caesar, 'caesar')).toBe(true);
    expect(isCharacterCandidate(kirito, 'kirito')).toBe(true);
    expect(isCharacterCandidate(disambiguated, 'kirito')).toBe(true);
  });

  it('reads disambiguated proper nouns as names', () => {
    expect(hasCharacterSignal('naruto uzumaki is a fictional character')).toBe(true);
    expect(hasCharacterSignal('the mitsubishi lancer is an automobile')).toBe(false);
  });

  it('ranks a real character above a same-name wikipedia page', () => {
    const anilist = candidate({ provider: 'anilist', name: 'Kirito', blurb: '' });
    const wiki = candidate({ name: 'Kirito (musician)', blurb: 'Kirito is a Japanese rock musician.' });
    expect(characterScore(anilist, 'kirito')).toBeGreaterThan(characterScore(wiki, 'kirito'));
  });

  it('drops works, products and "verse" pages by title alone', () => {
    const software = candidate({ name: 'Saber (software)', blurb: 'Saber is a travel technology company.' });
    const verse = candidate({ provider: 'vsb', name: 'Naruto (Verse)', blurb: 'Powers of the Naruto verse.' });
    const game = candidate({ provider: 'vsb', name: 'Naruto: Ultimate Ninja Series', blurb: '' });
    expect(isCharacterCandidate(software, 'saber')).toBe(false);
    expect(isCharacterCandidate(verse, 'naruto')).toBe(false);
    expect(isCharacterCandidate(game, 'naruto')).toBe(false);
  });

  it('drops film pages that advertise themselves with adjectives', () => {
    const film = candidate({
      provider: 'vsb',
      name: 'American Assassin',
      blurb: 'American Assassin is a 2017 American action thriller film directed by Michael Cuesta.',
    });
    expect(isCharacterCandidate(film, 'assassin')).toBe(false);
  });

  it('prefers the plain-named character over a longer same-prefix name', () => {
    const realOne = candidate({ provider: 'vsb', name: 'Kirito (Post-Aincrad)', blurb: 'Kirito is the protagonist of Sword Art Online.' });
    const other = candidate({ provider: 'anilist', name: 'Kirito Kamui', source: 'PSYCHO-PASS 2', blurb: '' });
    expect(characterScore(realOne, 'kirito')).toBeGreaterThan(characterScore(other, 'kirito'));
  });
});
