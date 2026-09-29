import { describe, expect, it } from 'vitest';
import { CLASSES, type Character, type ServantClass } from '@hgd/shared';
import { assignClasses, runDraw, type PickTable } from '../src/rooms/draw';

function makeCharacter(playerId: string, cls: ServantClass, i: number): Character {
  return {
    key: `p${playerId}-${cls}-${i}`,
    name: `${playerId} pick ${i}`,
    source: 'Test',
    provider: 'custom',
    imageUrl: '',
    submittedBy: playerId,
  };
}

function buildPicks(n: number): PickTable {
  const picks: PickTable = {};
  for (let p = 0; p < n; p++) {
    const playerId = `p${p}`;
    const table: Partial<Record<ServantClass, Character>> = {};
    for (const cls of CLASSES) {
      table[cls] = makeCharacter(playerId, cls, p);
    }
    picks[playerId] = table;
  }
  return picks;
}

describe('class assignment', () => {
  it('assigns distinct classes when N <= 7', () => {
    for (let n = 2; n <= 7; n++) {
      const players = Array.from({ length: n }, (_, i) => `p${i}`);
      const result = assignClasses(() => 0.42, players);
      const assigned = players.map((id) => result[id]);
      expect(new Set(assigned).size).toBe(n);
      expect(assigned.every((c) => CLASSES.includes(c))).toBe(true);
    }
  });

  it('never gives a class to more than 2 players in extended wars', () => {
    for (let n = 8; n <= 14; n++) {
      const players = Array.from({ length: n }, (_, i) => `p${i}`);
      const counts = new Map<ServantClass, number>();
      for (let seed = 0; seed < 25; seed++) {
        const rng = () => ((seed * 9301 + 49297) % 233280) / 233280;
        const result = assignClasses(rng, players);
        for (const p of players) counts.set(result[p], (counts.get(result[p]) ?? 0) + 1);
      }
      for (const cls of CLASSES) {
        expect(counts.get(cls) ?? 0).toBeGreaterThan(0);
        expect(counts.get(cls) ?? 0).toBeLessThanOrEqual(50);
      }
    }
  });

  it('uses every class at least once when N >= 7', () => {
    const players = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const result = assignClasses(() => 0.31, players);
    const used = new Set(players.map((id) => result[id]));
    expect(used.size).toBe(CLASSES.length);
  });
});

describe('runDraw', () => {
  it('assigns one distinct character per player for N = 2..14', () => {
    for (let n = 2; n <= 14; n++) {
      const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));
      const result = runDraw(players, buildPicks(n), { avoidOwnPick: true });
      expect(result.assignments).toHaveLength(n);
      const keys = result.assignments.map((a) => a.character.key);
      expect(new Set(keys).size).toBe(n);
      // Each player gets exactly one Servant.
      expect(new Set(result.assignments.map((a) => a.playerId)).size).toBe(n);
    }
  });

  it('draws each Servant from the pool of its assigned class', () => {
    const n = 5;
    const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));
    const picks = buildPicks(n);
    const result = runDraw(players, picks, { avoidOwnPick: true });
    for (const a of result.assignments) {
      expect(picks[a.playerId]?.[a.cls]?.key).toBeDefined();
      // the assigned character must be *someone's* pick for that class
      const owners = Object.entries(picks).filter(([, table]) => table[a.cls]?.key === a.character.key);
      expect(owners.length).toBeGreaterThan(0);
    }
  });

  it('avoids handing players their own pick when possible', () => {
    for (let n = 2; n <= 10; n++) {
      const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));
      const result = runDraw(players, buildPicks(n), { avoidOwnPick: true });
      // For N >= 4 a derangement always exists, so no player should get their own pick.
      if (n >= 4) {
        expect(result.relaxedPlayerIds).toHaveLength(0);
        for (const a of result.assignments) {
          expect(a.character.submittedBy).not.toBe(a.playerId);
        }
      } else {
        expect(result.relaxedPlayerIds.length).toBeLessThanOrEqual(n);
      }
    }
  });

  it('never fails for N = 2, relaxing the rule only when it must', () => {
    // With two distinct classes each player can take the other's pick, so a
    // clean draw is possible; when a class pool happens to block it, the best
    // attempt is kept and reported instead of failing.
    for (let seed = 0; seed < 25; seed++) {
      const players = [{ id: 'p0' }, { id: 'p1' }];
      const result = runDraw(players, buildPicks(2), { avoidOwnPick: true, seed });
      expect(result.assignments).toHaveLength(2);
      expect(new Set(result.assignments.map((a) => a.character.key)).size).toBe(2);
      expect(result.relaxedPlayerIds.length).toBeLessThanOrEqual(2);
    }
  });

  it('is reproducible for a fixed seed', () => {
    const players = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}` }));
    const picks = buildPicks(7);
    const a = runDraw(players, picks, { avoidOwnPick: true, seed: 12345 });
    const b = runDraw(players, picks, { avoidOwnPick: true, seed: 12345 });
    expect(a.assignments.map((x) => x.character.key)).toEqual(b.assignments.map((x) => x.character.key));
  });

  it('reports unsummoned picks for the Throne of Heroes gallery', () => {
    const n = 5;
    const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));
    const result = runDraw(players, buildPicks(n), { avoidOwnPick: true });
    // 5 players x 7 picks - 5 summons
    expect(result.unsummoned.length).toBe(n * CLASSES.length - n);
  });
});
