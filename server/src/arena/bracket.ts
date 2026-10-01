import type { ArenaMatch } from '@hgd/shared';
import seedrandom from 'seedrandom';
import type { Rng } from '../sim/score';

function shuffleWith<T>(rng: Rng, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * How many rounds a single-elimination bracket of `entrantCount` needs. Each
 * round sends `ceil(field / 2)` survivors forward, so the count halves (rounded
 * up) every round: 5 entrants need 3 rounds, 7 need 3, 8 need 3, 9 need 4.
 */
export function totalRoundsForCount(entrantCount: number): number {
  if (entrantCount <= 1) return 0;
  return Math.ceil(Math.log2(entrantCount));
}

/**
 * Build one round of the bracket. Entrants are paired at random; when the field
 * is odd exactly one random character takes a bye into the next round, so the
 * field always halves cleanly and no match is ever left without fighters.
 *
 * A bye is recorded as a match of its own (with `bye` and `winner` set) so the
 * bracket view can show it and counting stays uniform: every match in a round
 * — played or bye — sends exactly one character forward.
 */
export function buildRound(entrants: readonly string[], round: number, seed: string | number): ArenaMatch[] {
  const rng: Rng = seedrandom(String(seed));
  const shuffled = shuffleWith(rng, entrants);
  const bye = shuffled.length % 2 === 1 ? shuffled[shuffled.length - 1] : undefined;
  const paired = bye ? shuffled.slice(0, -1) : shuffled;
  const matches: ArenaMatch[] = [];

  for (let index = 0; index < paired.length; index += 2) {
    matches.push({
      id: `r${round}m${matches.length}`,
      round,
      slot: matches.length,
      a: paired[index],
      b: paired[index + 1],
      votesA: 0,
      votesB: 0,
      voters: [],
    });
  }

  if (bye) {
    matches.push({
      id: `r${round}m${matches.length}`,
      round,
      slot: matches.length,
      a: bye,
      bye,
      winner: bye,
      votesA: 0,
      votesB: 0,
      voters: [],
    });
  }

  return matches;
}

/** The highest round the bracket has reached, or 0 when it is still empty. */
export function lastRound(matches: readonly ArenaMatch[]): number {
  return matches.reduce((max, m) => Math.max(max, m.round), 0);
}

/** Everyone a finished round sends forward, in slot order — winners and byes alike. */
export function roundAdvancers(matches: readonly ArenaMatch[], round: number): string[] {
  return matches
    .filter((m) => m.round === round)
    .sort((a, b) => a.slot - b.slot)
    .map((m) => m.winner)
    .filter((id): id is string => Boolean(id));
}

export function matchById(matches: ArenaMatch[], id: string | undefined): ArenaMatch | undefined {
  if (!id) return undefined;
  return matches.find((m) => m.id === id);
}

/** The next playable match: no bye, both fighters known, no winner yet. */
export function nextPlayableMatch(matches: readonly ArenaMatch[]): ArenaMatch | undefined {
  return [...matches]
    .filter((m) => !m.winner && !m.bye && m.a && m.b)
    .sort((x, y) => (x.round === y.round ? x.slot - y.slot : x.round - y.round))[0];
}

export interface VoteCount {
  a: number;
  b: number;
  total: number;
}

export function countVotes(matches: ReadonlyArray<ArenaMatch>, matchId: string): VoteCount {
  const match = matches.find((m) => m.id === matchId);
  if (!match) return { a: 0, b: 0, total: 0 };
  let a = 0;
  let b = 0;
  for (const v of match.voters) {
    if (v.choice === 'a') a++;
    else b++;
  }
  return { a, b, total: a + b };
}
