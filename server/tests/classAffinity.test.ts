import { describe, expect, it } from 'vitest';
import {
  CLASS_TRAITS,
  classRefusal,
  classVerdictFor,
  combineClassVerdicts,
  curatedClasses,
  verdictFromEvidence,
} from '../src/research/classAffinity';
import { canonClasses } from '../src/data/canon';
import type { Character } from '@hgd/shared';

/*
 * Request #4: a Saber-class Servant must be a swordsman, an Archer must fight
 * at range, and a character the game cannot place at all is refused instead of
 * being seated in a class that makes no sense.
 */

function character(name: string, source = 'Custom'): Character {
  return { key: `test:${name}`, name, source, provider: 'custom', imageUrl: '', submittedBy: 'dev' };
}

describe('verdictFromEvidence', () => {
  it('places a sword user in Saber', () => {
    const verdict = verdictFromEvidence('Artoria Pendragon', {
      categories: ['Sword Users', 'Knights', 'Kings'],
      classification: 'Saber-class Servant',
      equipment: 'Excalibur',
    });
    expect(verdict.verified).toBe(true);
    expect(verdict.classes).toContain('saber');
    expect(verdict.evidence).toBe('wiki');
  });

  it('ignores prose that names other characters', () => {
    // Artoria's page says she has fought Berserker and cut down Assassin; that
    // must not make her eligible for those classes.
    const verdict = verdictFromEvidence('Artoria Pendragon', {
      categories: ['Sword Users', 'Knights'],
      classification: 'Saber-class Servant',
      equipment: 'Excalibur',
      powers: 'Weapon Mastery',
      notable: 'Cut down Assassin in a single strike and fought Berserker',
      bio: 'Her rival Archer and the mad Berserker both sought her death.',
    });
    expect(verdict.classes).toEqual(['saber']);
    expect(verdict.classes).not.toContain('assassin');
    expect(verdict.classes).not.toContain('berserker');
    expect(verdict.classes).not.toContain('archer');
  });

  it('falls back to biography prose when the wiki has no categories', () => {
    const verdict = verdictFromEvidence('The Nameless One', { bio: 'A legendary spearwoman of the north.' });
    expect(verdict.verified).toBe(true);
    expect(verdict.classes).toContain('lancer');
    expect(verdict.evidence).toBe('bio');
  });

  it('accepts a name that states the class outright', () => {
    const verdict = verdictFromEvidence('Saber', {});
    expect(verdict.verified).toBe(true);
    expect(verdict.classes).toEqual(['saber']);
    expect(verdict.evidence).toBe('name');
  });

  it('refuses a character nothing can place', () => {
    const verdict = verdictFromEvidence('Zyx the Unknown', {});
    expect(verdict.verified).toBe(false);
    expect(verdict.classes).toEqual([]);
    expect(verdict.evidence).toBe('none');
  });
});

describe('curatedClasses', () => {
  it('trusts the game\'s own class-tagged lists', () => {
    expect(curatedClasses('King Arthur')).toContain('saber');
    expect(curatedClasses('Robin Hood')).toContain('archer');
    expect(curatedClasses('')).toEqual([]);
    expect(curatedClasses('Nobody At All')).toEqual([]);
  });
});

describe('classRefusal', () => {
  it('names the classes the character could be drafted as', () => {
    const message = classRefusal(character('Artoria Pendragon'), {
      classes: ['saber', 'ruler'],
      verified: true,
      evidence: 'wiki',
    });
    expect(message).toContain('Saber or Ruler');
  });

  it('explains an unverifiable pick', () => {
    const message = classRefusal(character('Zyx the Unknown'), {
      classes: [],
      verified: false,
      evidence: 'none',
    });
    expect(message).toContain("couldn't confirm");
  });
});

describe('the hand-curated canon', () => {
  it('reads the names wikis and databases actually use', () => {
    expect(canonClasses('Kirito')).toEqual(['saber']);
    expect(canonClasses('Kirito (Post-Aincrad)')).toEqual(['saber']);
    expect(canonClasses('Kazuto Kirigaya')).toEqual(['saber']);
    expect(canonClasses('Hiccup Horrendous Haddock III')).toEqual(['rider']);
    expect(canonClasses('Vegeta')).toContain('avenger');
    expect(canonClasses('Artoria Pendragon')).toEqual([]);
  });

  it('settles the three reported misfires without a wiki lookup', async () => {
    const kirito = await classVerdictFor(character('Kirito'), 'saber');
    expect(kirito.classes).toEqual(['saber']);
    expect(kirito.verified).toBe(true);

    const hiccup = await classVerdictFor(character('Hiccup Horrendous Haddock III'), 'rider');
    expect(hiccup.classes).toContain('rider');

    const vegeta = await classVerdictFor(character('Vegeta'), 'avenger');
    expect(vegeta.classes).toContain('avenger');
    expect(vegeta.classes).toContain('berserker');
  });

  it('removes the classes a scrape mis-filed the character in', async () => {
    const asShielder = await classVerdictFor(character('Kirito'), 'shielder');
    expect(asShielder.classes).not.toContain('shielder');
    expect(classRefusal(character('Kirito'), asShielder)).toContain('Saber');

    const rin = await classVerdictFor(character('Rin Tohsaka'), 'avenger');
    expect(rin.classes).toEqual(['caster']);
  });

  it('keeps the curated rosters as a floor when the wiki proves another class', () => {
    const merged = combineClassVerdicts(['shielder', 'ruler'], {
      classes: ['saber'],
      verified: true,
      evidence: 'wiki',
    });
    expect(merged.classes).toEqual(['saber', 'shielder', 'ruler']);
    expect(merged.verified).toBe(true);
    expect(merged.evidence).toBe('curated');

    const nothing = combineClassVerdicts([], { classes: [], verified: false, evidence: 'none' });
    expect(nothing.verified).toBe(false);
    expect(nothing.classes).toEqual([]);
  });
});

describe('CLASS_TRAITS', () => {
  it('covers the weapon and role signature of every class', () => {
    expect(CLASS_TRAITS.saber.test('Master Swordswoman')).toBe(true);
    expect(CLASS_TRAITS.archer.test('Expert marksman and sniper')).toBe(true);
    expect(CLASS_TRAITS.lancer.test('wields a spear')).toBe(true);
    expect(CLASS_TRAITS.rider.test('cavalry commander')).toBe(true);
    expect(CLASS_TRAITS.caster.test('a powerful sorcerer')).toBe(true);
    expect(CLASS_TRAITS.assassin.test('trained ninja')).toBe(true);
    expect(CLASS_TRAITS.berserker.test('a raging monster')).toBe(true);
    expect(CLASS_TRAITS.shielder.test('guardian with a shield')).toBe(true);
    expect(CLASS_TRAITS.ruler.test('the king of Britain')).toBe(true);
    expect(CLASS_TRAITS.avenger.test('driven by vengeance')).toBe(true);
  });
});
