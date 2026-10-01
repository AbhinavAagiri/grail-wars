import { describe, expect, it } from 'vitest';
import { CLASSES, type AiPool } from '@hgd/shared';
import { POOL_SIZE, buildDraftPools } from '../src/rooms/draftPool';

/*
 * Request #5: with AI Chooses on, every class is dealt 25 characters from the
 * chosen roster (anime only, history only, or mixed).
 */

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const REAL_WORLD_SOURCES = /^(?:History|Greek mythology|Norse mythology|Legend|Mythology)$/;

describe('buildDraftPools', () => {
  it('deals a full, unique roster for every class', () => {
    const pools = buildDraftPools(CLASSES, 'mixed', seeded(7));
    for (const cls of CLASSES) {
      const list = pools[cls] ?? [];
      expect(list.length, `${cls} should have ${POOL_SIZE} characters`).toBe(POOL_SIZE);
      expect(new Set(list.map((c) => c.key)).size).toBe(POOL_SIZE);
      expect(list.every((c) => c.name.length > 0)).toBe(true);
    }
  });

  it('keeps real-world figures out of an anime-only draft', () => {
    const pools = buildDraftPools(CLASSES, 'anime', seeded(11));
    for (const cls of CLASSES) {
      for (const entry of pools[cls] ?? []) {
        expect(REAL_WORLD_SOURCES.test(entry.source), `${entry.name} (${entry.source})`).toBe(false);
      }
    }
  });

  it('deals history-only drafts from historical and legendary figures', () => {
    const pools = buildDraftPools(['saber', 'caster', 'ruler'], 'history', seeded(13));
    const sources = new Set([
      ...(pools.saber ?? []).map((c) => c.source),
      ...(pools.caster ?? []).map((c) => c.source),
      ...(pools.ruler ?? []).map((c) => c.source),
    ]);
    expect([...sources].some((source) => /history|mytholog|legend/i.test(source))).toBe(true);
  });

  it('mixes both rosters when asked to', () => {
    const pools = buildDraftPools(['saber'], 'mixed', seeded(17));
    const sources = (pools.saber ?? []).map((c) => c.source);
    expect(sources.some((source) => REAL_WORLD_SOURCES.test(source))).toBe(true);
    expect(sources.some((source) => !REAL_WORLD_SOURCES.test(source))).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    const a = buildDraftPools(['saber'], 'mixed', seeded(3));
    const b = buildDraftPools(['saber'], 'mixed', seeded(3));
    expect(a.saber?.map((c) => c.key)).toEqual(b.saber?.map((c) => c.key));
  });

  it('always deals the hand-curated canon in its own class, and nowhere else', () => {
    // Kirito was filed as a Shielder by a scrape and never reached the Saber
    // list; the canon is dealt into Saber and removed from Shielder/Ruler.
    const pools = buildDraftPools(CLASSES, 'anime', seeded(23));
    const blade = (cls: (typeof CLASSES)[number]) => (pools[cls] ?? []).map((c) => c.name);
    expect(blade('saber')).toContain('Kirito');
    expect(blade('saber')).toContain('Asuna');
    expect(blade('rider')).toContain('Hiccup');
    expect(blade('shielder')).not.toContain('Kirito');
    expect(blade('ruler')).not.toContain('Kirito');
    expect(blade('avenger')).not.toContain('Rin Tohsaka');
  });

  it('respects the roster the host chose when it deals the canon', () => {
    const anime = buildDraftPools(['rider'], 'anime', seeded(29));
    expect((anime.rider ?? []).map((c) => c.name)).toContain('Hiccup');
  });

  it('leaves pool characters without images so room snapshots stay small', () => {
    const pools = buildDraftPools(['saber'], 'mixed' satisfies AiPool, seeded(5));
    expect(pools.saber?.every((c) => c.imageUrl === '')).toBe(true);
    expect(pools.saber?.every((c) => c.provider === 'roster' || c.provider === 'fallback')).toBe(true);
  });
});
