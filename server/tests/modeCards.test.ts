import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, MODE_CARDS, type Mode } from '@hgd/shared';

/*
 * The mode grid is drawn from one list, so the home page and the lobby can
 * never disagree about which modes exist or which of them can be played. These
 * are the invariants that make that true; they are checked here rather than in
 * the pages because a slipped flag is invisible until someone clicks the card.
 */

const playable = MODE_CARDS.filter((card) => card.playable);
const teased = MODE_CARDS.filter((card) => !card.playable);

describe('the mode cards', () => {
  it('gives every card a title, an icon and a blurb', () => {
    for (const card of MODE_CARDS) {
      expect(card.title.trim()).not.toBe('');
      expect(card.icon.trim()).not.toBe('');
      expect(card.blurb.trim()).not.toBe('');
    }
  });

  it('names each card once, and each mode once', () => {
    const titles = MODE_CARDS.map((card) => card.title);
    expect(new Set(titles).size).toBe(titles.length);

    const modes: Mode[] = playable.map((card) => card.mode);
    expect(new Set(modes).size).toBe(modes.length);
  });

  it('leaves a coming-soon card with no mode to select and no second badge', () => {
    for (const card of teased) {
      expect(card.mode).toBeNull();
      // The two chips share the card's top-right corner: a card wears one or the other.
      expect(card.badge).toBeUndefined();
    }
  });

  it('offers the room default as a playable card', () => {
    const modes: Mode[] = playable.map((card) => card.mode);
    expect(modes).toContain(DEFAULT_SETTINGS.mode);
  });

  it('keeps a teaser in the list, so the grid still says what is coming', () => {
    expect(teased.length).toBeGreaterThan(0);
  });
});
