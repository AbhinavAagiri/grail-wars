import { describe, expect, it } from 'vitest';
import {
  denylistedPoliticalFigure,
  looksLikeModernPoliticalFigure,
  looksLikePoliticalCandidate,
  politicalRefusal,
} from '../src/research/politicalFigures';
import { isCharacterCandidate } from '../src/api/characterFilter';
import type { Character, Provider } from '@hgd/shared';

function character(name: string, provider: Provider = 'wikipedia'): Character {
  return { key: `test:${name}`, name, source: 'Wikipedia', provider, imageUrl: '', submittedBy: 'dev' };
}

/*
 * A sitting vice president was drafted and then powerscaled as a cartoon
 * villain. Real-world political figures are not Servants: the name denylist
 * catches the obvious ones with no network, and the biography rule catches the
 * rest without touching the historical rulers the history roster is built from.
 */

describe('the political-figure denylist', () => {
  it('catches a name however it is punctuated', () => {
    expect(denylistedPoliticalFigure('JD Vance')).toBe('JD Vance');
    expect(denylistedPoliticalFigure('J.D. Vance')).toBe('JD Vance');
    // The full legal name is listed too, so it matches even without the initials.
    expect(denylistedPoliticalFigure('James David Vance')).toBeDefined();
    expect(denylistedPoliticalFigure('Donald J. Trump')).toBe('Donald Trump');
    expect(denylistedPoliticalFigure('Vladimir Putin')).toBe('Vladimir Putin');
    expect(denylistedPoliticalFigure('Keir Starmer')).toBe('Keir Starmer');
  });

  it('leaves characters, legends and surnames alone', () => {
    expect(denylistedPoliticalFigure('Artoria Pendragon')).toBeUndefined();
    expect(denylistedPoliticalFigure('Julius Caesar')).toBeUndefined();
    expect(denylistedPoliticalFigure('Kirito')).toBeUndefined();
    // A bare surname is too short to match on: it is not a full name.
    expect(denylistedPoliticalFigure('Vance')).toBeUndefined();
  });
});

describe('looksLikeModernPoliticalFigure', () => {
  const vance =
    'James David Vance (born August 2, 1984) is an American politician, author, and Marine veteran who has served since 2023 as the 50th vice president of the United States.';

  it('reads a living office-holder from their biography', () => {
    expect(looksLikeModernPoliticalFigure(vance)).toBe(true);
    expect(
      looksLikeModernPoliticalFigure(
        'Donald John Trump is an American politician, media personality, and businessman who has served as the 47th president of the United States since 2025.',
      ),
    ).toBe(true);
  });

  it('still allows the historical rulers a history draft is made of', () => {
    expect(
      looksLikeModernPoliticalFigure(
        'Gaius Julius Caesar (12 July 100 BC – 15 March 44 BC) was a Roman general and statesman. A member of the First Triumvirate, Caesar led the Roman armies in the Gallic Wars.',
      ),
    ).toBe(false);
    expect(
      looksLikeModernPoliticalFigure(
        'Augustus (born Gaius Octavius; 23 September 63 BC – 19 August AD 14) was the first Roman emperor.',
      ),
    ).toBe(false);
  });

  it('never refuses a fictional politician', () => {
    expect(
      looksLikeModernPoliticalFigure(
        'Sheev Palpatine is a fictional character in the Star Wars franchise, a politician and the Dark Lord of the Sith.',
      ),
    ).toBe(false);
  });

  it('needs an office, not just a modern date', () => {
    expect(looksLikeModernPoliticalFigure('Aya Kito (born 1962) was a Japanese writer.')).toBe(false);
    expect(looksLikeModernPoliticalFigure('')).toBe(false);
  });
});

describe('the draft search', () => {
  const candidate = (name: string, blurb?: string) =>
    ({
      key: `test:${name}`,
      name,
      source: 'Wikipedia',
      provider: 'wikipedia' as const,
      thumb: '',
      blurb,
    });

  it('drops a sitting politician before it reaches the draft', () => {
    const blurb =
      'James David Vance is an American politician and lawyer who has served as the 50th vice president of the United States since 2025.';
    expect(isCharacterCandidate(candidate('JD Vance', blurb), 'jd vance')).toBe(false);
    expect(looksLikePoliticalCandidate('JD Vance', blurb)).toBe(true);
  });

  it('refuses a denylisted figure at the draft gate without asking the network', async () => {
    const refusal = await politicalRefusal(character('J.D. Vance'));
    expect(refusal).toContain('political figure');
    expect(refusal).toContain('J.D. Vance');
    expect(refusal).toContain('does not condone the use of political figures');
  });

  it('exempts the game\'s own pre-screened data, without a wiki lookup', async () => {
    // A history roster is supposed to contain rulers; it was filtered when it
    // was built, so the gate must not second-guess it — and a curated name must
    // not pay for a lookup just to be checked twice.
    expect(await politicalRefusal(character('Julius Caesar', 'roster'))).toBeNull();
    expect(await politicalRefusal(character('Simo Häyhä', 'fallback'))).toBeNull();
    expect(await politicalRefusal(character('Kirito', 'custom'))).toBeNull();
    expect(await politicalRefusal(character('Hiccup', 'custom'))).toBeNull();
  });

  it('checks the name even for a pre-screened provider', async () => {
    expect(await politicalRefusal(character('JD Vance', 'roster'))).toContain('political figure');
  });

  it('keeps a legendary ruler and a typed-out character', () => {
    expect(
      isCharacterCandidate(candidate('Julius Caesar', 'Gaius Julius Caesar was a Roman general and statesman.'), 'caesar'),
    ).toBe(true);
    expect(isCharacterCandidate(candidate('Kirito'), 'kirito')).toBe(true);
  });
});
