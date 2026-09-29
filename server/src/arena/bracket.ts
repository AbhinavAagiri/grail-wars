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

export function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return Math.max(2, size);
}

export const ROUND_NAMES = ['Round 1', 'Quarterfinals', 'Semifinals', 'Final'];

export function roundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd <= 0) return 'Final';
  if (fromEnd === 1) return 'Semifinals';
  if (fromEnd === 2) return 'Quarterfinals';
  return `Round ${round}`;
}

/**
 * Build a single-elimination bracket. When the entrant count is not a power of
 * two, the lowest-numbered slots after the shuffle receive byes.
 */
export function buildBracket(servantIds: string[], seed: number): ArenaMatch[] {
  const rng: Rng = seedrandom(String(seed));
  const shuffled = shuffleWith(rng, servantIds);
  const size = nextPowerOfTwo(shuffled.length);
  const slots: (string | undefined)[] = new Array(size).fill(undefined);
  shuffled.forEach((id, i) => {
    slots[i] = id;
  });

  const firstRoundMatches = size / 2;
  const matches: ArenaMatch[] = [];
  for (let slot = 0; slot < firstRoundMatches; slot++) {
    const a = slots[slot * 2];
    const b = slots[slot * 2 + 1];
    const match: ArenaMatch = {
      id: `r1m${slot}`,
      round: 1,
      slot,
      a,
      b,
      votesA: 0,
      votesB: 0,
      voters: [],
    };
    if (a && !b) match.bye = a;
    else if (b && !a) match.bye = b;
    if (match.bye) match.winner = match.bye;
    matches.push(match);
  }

  const totalRounds = Math.log2(size);
  for (let round = 2; round <= totalRounds; round++) {
    const count = size / Math.pow(2, round);
    for (let slot = 0; slot < count; slot++) {
      matches.push({
        id: `r${round}m${slot}`,
        round,
        slot,
        votesA: 0,
        votesB: 0,
        voters: [],
      });
    }
  }

  propagateByes(matches, totalRounds);
  return matches;
}

/** Push automatic byes forward so the next round is populated. */
export function propagateByes(matches: ArenaMatch[], totalRounds: number): void {
  for (let round = 1; round < totalRounds; round++) {
    const current = matches.filter((m) => m.round === round);
    for (const match of current) {
      if (!match.winner) continue;
      const next = matches.find((m) => m.round === round + 1 && m.slot === Math.floor(match.slot / 2));
      if (!next) continue;
      if (match.slot % 2 === 0) next.a = match.winner;
      else next.b = match.winner;
    }
  }
}

export function matchById(matches: ArenaMatch[], id: string | undefined): ArenaMatch | undefined {
  if (!id) return undefined;
  return matches.find((m) => m.id === id);
}

/** The next playable match: no bye, both fighters known, no winner yet. */
export function nextPlayableMatch(matches: ArenaMatch[], totalRounds: number): ArenaMatch | undefined {
  for (let round = 1; round <= totalRounds; round++) {
    const match = matches
      .filter((m) => m.round === round && !m.winner && !m.bye && m.a && m.b)
      .sort((x, y) => x.slot - y.slot)[0];
    if (match) return match;
  }
  return undefined;
}

export function totalRoundsFor(matches: ArenaMatch[]): number {
  return matches.reduce((max, m) => Math.max(max, m.round), 1);
}

export function setMatchWinner(matches: ArenaMatch[], matchId: string, winnerId: string, totalRounds: number): void {
  const match = matchById(matches, matchId);
  if (!match) return;
  match.winner = winnerId;
  const next = matches.find((m) => m.round === match.round + 1 && m.slot === Math.floor(match.slot / 2));
  if (next) {
    if (match.slot % 2 === 0) next.a = winnerId;
    else next.b = winnerId;
  } else if (match.round === totalRounds) {
    // Champion: nothing to propagate.
  }
}

export interface VoteCount {
  a: number;
  b: number;
  total: number;
}

export function countVotes(matches: ArenaMatch[], matchId: string): VoteCount {
  const match = matchById(matches, matchId);
  if (!match) return { a: 0, b: 0, total: 0 };
  let a = 0;
  let b = 0;
  for (const v of match.voters) {
    if (v.choice === 'a') a++;
    else b++;
  }
  return { a, b, total: a + b };
}

export function isChampion(matches: ArenaMatch[], totalRounds: number): string | undefined {
  const final = matches.find((m) => m.round === totalRounds);
  return final?.winner;
}
