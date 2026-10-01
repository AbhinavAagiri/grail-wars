import { describe, expect, it } from 'vitest';
import type { ArenaMatch } from '@hgd/shared';
import {
  buildRound,
  countVotes,
  lastRound,
  matchById,
  nextPlayableMatch,
  roundAdvancers,
  totalRoundsForCount,
} from '../src/arena/bracket';

/*
 * The Debate Arena bracket used to pad the field to the next power of two,
 * which left matches with no fighters in them (6 entrants) and stalled the
 * tournament before a champion could exist. The bracket now halves the field
 * every round, giving an odd field exactly one random bye, so it always ends.
 */

function entrants(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `s${i + 1}`);
}

/** Everyone listed in a round, whether as a fighter or as the bye. */
function roundField(matches: ArenaMatch[], round: number): string[] {
  return matches
    .filter((m) => m.round === round)
    .flatMap((m) => [m.a, m.b].filter((id): id is string => Boolean(id)));
}

/** Play a whole bracket out, always letting the first-listed fighter win. */
function playOut(start: ArenaMatch[]): { matches: ArenaMatch[]; champion: string; rounds: number } {
  const matches = [...start];
  let round = lastRound(matches);
  for (let guard = 0; guard < 64; guard++) {
    for (let match = nextPlayableMatch(matches); match; match = nextPlayableMatch(matches)) {
      match.winner = match.a;
    }
    const advancers = roundAdvancers(matches, round);
    if (advancers.length <= 1) {
      return { matches, champion: advancers[0]!, rounds: round };
    }
    matches.push(...buildRound(advancers, round + 1, `test:${round + 1}`));
    round += 1;
  }
  throw new Error('the bracket never finished');
}

describe('debate bracket', () => {
  it('halves the field every round and always produces a champion', () => {
    for (let count = 2; count <= 16; count++) {
      const ids = entrants(count);
      const round1 = buildRound(ids, 1, `seed:${count}`);
      const { matches, champion } = playOut(round1);

      // Every round holds ceil(field / 2) matches, each advancing one survivor.
      let field = count;
      let round = 1;
      while (field > 1) {
        const current = matches.filter((m) => m.round === round);
        expect(current.length).toBe(Math.ceil(field / 2));
        expect(current.filter((m) => m.bye).length).toBe(field % 2 === 1 ? 1 : 0);
        field = Math.ceil(field / 2);
        round += 1;
      }

      expect(champion).toBeTruthy();
      expect(matches.every((m) => Boolean(m.winner))).toBe(true);
      expect(matches.some((m) => !m.a)).toBe(false);
      // Single elimination: one real match per eliminated character.
      expect(matches.filter((m) => m.a && m.b && !m.bye).length).toBe(count - 1);
      expect(lastRound(matches)).toBe(totalRoundsForCount(count));
    }
  });

  it('gives an odd field exactly one bye, and an even field none', () => {
    for (const count of [3, 5, 7, 9, 11, 13, 15]) {
      const round1 = buildRound(entrants(count), 1, `seed:${count}`);
      const byes = round1.filter((m) => m.bye);
      expect(byes.length).toBe(1);
      expect(byes[0]!.a).toBe(byes[0]!.bye);
      expect(byes[0]!.winner).toBe(byes[0]!.bye);
      expect(byes[0]!.b).toBeUndefined();
    }
    for (const count of [2, 4, 6, 8, 10, 12, 14, 16]) {
      expect(buildRound(entrants(count), 1, `seed:${count}`).some((m) => m.bye)).toBe(false);
    }
  });

  it('puts every entrant in exactly one match per round', () => {
    for (let count = 2; count <= 16; count++) {
      const ids = entrants(count);
      const matches = buildRound(ids, 1, `seed:${count}`);
      const field = roundField(matches, 1).sort();
      expect(field).toEqual([...ids].sort());

      const { matches: played, rounds } = playOut(matches);
      for (let round = 1; round <= rounds; round++) {
        const names = roundField(played, round);
        expect(new Set(names).size).toBe(names.length);
      }
    }
  });

  it('is deterministic for a seed and shuffles differently for another', () => {
    const ids = entrants(16);
    const a = buildRound(ids, 1, 'same-seed').map((m) => [m.a, m.b]);
    const b = buildRound(ids, 1, 'same-seed').map((m) => [m.a, m.b]);
    expect(a).toEqual(b);

    const c = buildRound(ids, 1, 'another-seed').map((m) => [m.a, m.b]);
    expect(c).not.toEqual(a);
  });

  it('skips byes and decided matches when picking the next fight', () => {
    const matches = buildRound(entrants(5), 1, 'pick');
    const bye = matches.find((m) => m.bye)!;
    const first = nextPlayableMatch(matches);
    expect(first).toBeTruthy();
    expect(first!.bye).toBeUndefined();
    expect(nextPlayableMatch([bye])).toBeUndefined();

    first!.winner = first!.a;
    expect(nextPlayableMatch(matches)?.id).not.toBe(first!.id);
  });

  it('counts a and b votes for a match', () => {
    const [match] = buildRound(entrants(2), 1, 'votes');
    match!.voters = [
      { voterId: 'p1', nickname: 'One', choice: 'a' },
      { voterId: 'p2', nickname: 'Two', choice: 'b' },
      { voterId: 'p3', nickname: 'Three', choice: 'a' },
    ];
    expect(countVotes([match!], match!.id)).toEqual({ a: 2, b: 1, total: 3 });
    expect(matchById([match!], 'nope')).toBeUndefined();
  });
});
