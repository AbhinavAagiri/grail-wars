import { describe, expect, it } from 'vitest';
import { deriveKeyAbilityName, extractAbilities } from '../src/research/heuristics';
import { extractFields, highestTierToken, htmlToLines, parseVsbPage } from '../src/research/parseVsb';

/* ------------------------------------------------------------------ */
/* Hax: resistances are defensive, not offensive                       */
/* ------------------------------------------------------------------ */

describe('extractAbilities — resistances', () => {
  it('does not hand out offensive hax for "Resistance to X"', () => {
    const { abilities, haxScore } = extractAbilities(
      'Resistance to Existence Erasure, Time Manipulation and Soul Manipulation',
    );
    // A character who merely resists existence erasure cannot erase people.
    expect(abilities.some((a) => a.name === 'Existence Erasure')).toBe(false);
    expect(abilities.some((a) => a.name === 'Time Manipulation')).toBe(false);
    expect(abilities.some((a) => a.name === 'Soul Manipulation')).toBe(false);
    expect(abilities.find((a) => a.name === 'Resistance')?.weight).toBe(9); // 3 distinct × 3
    expect(haxScore).toBe(9);
  });

  it('caps the resistance bonus at 15', () => {
    const list = [
      'Mind Manipulation',
      'Soul Manipulation',
      'Time Manipulation',
      'Fate Manipulation',
      'Gravity Manipulation',
      'Poison Manipulation',
      'Fire Manipulation',
    ];
    const { abilities } = extractAbilities(`Resistance to ${list.join(', ')}`);
    expect(abilities.find((a) => a.name === 'Resistance')?.weight).toBe(15);
  });

  it('still counts genuinely offensive abilities next to resistances', () => {
    const { abilities, haxScore } = extractAbilities('Reality Warping. Resistance to Time Manipulation');
    expect(abilities.some((a) => a.name === 'Reality Warping')).toBe(true);
    expect(abilities.some((a) => a.name === 'Time Manipulation')).toBe(false);
    expect(haxScore).toBe(22 + 3);
  });

  it('ignores vague catch-all resistances', () => {
    const { abilities } = extractAbilities('Resistance to all');
    expect(abilities.some((a) => a.name === 'Resistance')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Named techniques                                                    */
/* ------------------------------------------------------------------ */

describe('deriveKeyAbilityName', () => {
  it('prefers a real technique over the wiki arc/Key list', () => {
    const name = deriveKeyAbilityName({ key: 'Part I | War Arc', notable: 'Kamehameha, other techniques' }, []);
    expect(name).toBe('Kamehameha');
  });

  it('rejects prose fragments in favour of an ability name', () => {
    const name = deriveKeyAbilityName(
      { notable: 'allowing for high-speed movement' },
      [{ name: 'Flight', weight: 6 }],
    );
    expect(name).toBe('Flight');
  });

  it('never returns raw markup', () => {
    const name = deriveKeyAbilityName(
      { notable: 'Gallery[] <img style="" src="https://static.example/x.png"' },
      [{ name: 'Stealth Mastery', weight: 6 }],
    );
    expect(name).toBe('Stealth Mastery');
  });

  it('rejects sentence-like text that starts with a capital', () => {
    const name = deriveKeyAbilityName(
      { notable: "The fruit's major strength" },
      [{ name: 'Absorption', weight: 12 }],
    );
    expect(name).toBe('Absorption');
  });

  it('falls back to the Key field when nothing better exists', () => {
    expect(deriveKeyAbilityName({ key: "Zangetsu: Ichigo's Zanpakutō" }, [])).toBe('Zangetsu');
  });

  it('always returns something usable', () => {
    expect(deriveKeyAbilityName({}, [])).toBe('their signature technique');
  });
});

/* ------------------------------------------------------------------ */
/* Page parsing                                                        */
/* ------------------------------------------------------------------ */

const PAGE_HTML = `
<div class="mw-parser-output">
  <p><b>Tier:</b> At least 5-B, likely 4-C</p>
  <p><b>Speed:</b> Massively Hypersonic</p>
  <p><b>Durability:</b> Country level</p>
  <p><b>Powers and Abilities:</b> Superhuman Physical Characteristics, Reality Warping,
     Resistance to Time Manipulation, Mind Manipulation and Soul Manipulation</p>
  <p><b>Notable Attacks/Techniques:</b> allowing for high-speed movement, Rasengan</p>
  <gallery><img src="https://static.example/gallery-1.png" style="">File caption.png</gallery>
</div>`;

describe('parseVsbPage', () => {
  it('flattens the stat block into labelled fields', () => {
    const page = parseVsbPage(PAGE_HTML, 'Test Character');
    expect(page.empty).toBe(false);
    expect(page.fields.Tier).toContain('5-B');
    expect(page.fields.Speed).toContain('Hypersonic');
    expect(page.fields.Durability).toContain('Country');
  });

  it('never leaks markup or gallery content into the text', () => {
    const lines = htmlToLines(PAGE_HTML);
    expect(lines.some((line) => line.includes('<'))).toBe(false);
    expect(lines.some((line) => line.includes('static.example'))).toBe(false);
  });

  it('scales on peak offence while resistances stay defensive', () => {
    const page = parseVsbPage(PAGE_HTML, 'Test Character');
    const { abilities } = extractAbilities(page.fields['Powers and Abilities'] ?? '');
    expect(abilities.some((a) => a.name === 'Reality Warping')).toBe(true);
    expect(abilities.some((a) => a.name === 'Time Manipulation')).toBe(false);
    expect(abilities.find((a) => a.name === 'Resistance')?.weight).toBe(9);
  });

  it('takes the highest accepted tier on a multi-tier line', () => {
    expect(highestTierToken('At least 5-B, likely 4-C')?.label).toContain('4-C');
  });

  it('keeps label/value pairs when values wrap onto following lines', () => {
    const fields = extractFields(htmlToLines('<div class="mw-parser-output"><p><b>Range:</b></p><p>Tens of kilometers</p></div>'));
    expect(fields.Range).toContain('Tens of kilometers');
  });
});
