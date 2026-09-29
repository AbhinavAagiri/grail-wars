import { CLASSES, type Assignment, type Character, type ServantClass } from '@hgd/shared';
import seedrandom from 'seedrandom';
import type { Rng } from '../sim/score';

/** Which classes a room is actually drafting (all of them by default). */
function draftClasses(classes?: readonly ServantClass[]): ServantClass[] {
  return classes && classes.length ? [...classes] : [...CLASSES];
}

export interface DrawPlayer {
  id: string;
}

export type PickTable = Record<string, Partial<Record<ServantClass, Character>>>;

export interface DrawResult {
  assignments: Assignment[];
  seed: number;
  /** players who could not avoid their own pick */
  relaxedPlayerIds: string[];
  unsummoned: Character[];
}

export function newSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

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
 * Assign one class to each player, drawn from the room's enabled classes.
 * N <= enabled → N distinct classes (injective).
 * N > enabled  → every enabled class is used once, then the remainder is spread
 *                so no class has more than 2 players.
 */
export function assignClasses(
  rng: Rng,
  playerIds: string[],
  classesInput?: readonly ServantClass[],
): Record<string, ServantClass> {
  const pool = draftClasses(classesInput);
  const n = playerIds.length;
  const shuffledPlayers = shuffleWith(rng, playerIds);
  const result: Record<string, ServantClass> = {};

  if (n <= pool.length) {
    const classes = shuffleWith(rng, pool).slice(0, n);
    shuffledPlayers.forEach((id, i) => {
      result[id] = classes[i];
    });
    return result;
  }

  // Extended war: base 1 each, then the remainder once more.
  const base = Math.floor(n / pool.length);
  const extraCount = n % pool.length;
  const queue: ServantClass[] = [];
  for (const cls of pool) {
    for (let i = 0; i < base; i++) queue.push(cls);
  }
  const extras = shuffleWith(rng, pool).slice(0, extraCount);
  for (const cls of extras) queue.push(cls);
  const shuffledQueue = shuffleWith(rng, queue);
  shuffledPlayers.forEach((id, i) => {
    result[id] = shuffledQueue[i] ?? pool[i % pool.length];
  });
  return result;
}

function attemptDraw(
  rng: Rng,
  players: DrawPlayer[],
  picks: PickTable,
  avoidOwnPick: boolean,
  classes: readonly ServantClass[],
): { assignments: Assignment[]; violations: string[] } {
  const playerIds = players.map((p) => p.id);
  const classOf = assignClasses(rng, playerIds, classes);

  // Build pools from *players*, not characters, so missing picks are skipped.
  const assignments: Assignment[] = [];
  const violations: string[] = [];

  for (const cls of classes) {
    const claimants = playerIds.filter((id) => classOf[id] === cls);
    if (!claimants.length) continue;

    const pool = players
      .map((p) => picks[p.id]?.[cls])
      .filter((c): c is Character => Boolean(c));
    const shuffledPool = shuffleWith(rng, pool);

    claimants.forEach((playerId, i) => {
      const character = shuffledPool[i % Math.max(1, shuffledPool.length)];
      if (!character) return;
      assignments.push({ playerId, cls, character });
      if (avoidOwnPick && character.submittedBy === playerId) violations.push(playerId);
    });
  }
  return { assignments, violations };
}

/**
 * The full draw. Retries up to 500 times to satisfy the avoid-own-pick rule,
 * then keeps the best (fewest violations) attempt so the game can continue.
 */
export function runDraw(
  players: DrawPlayer[],
  picks: PickTable,
  options: { avoidOwnPick: boolean; seed?: number; classes?: readonly ServantClass[] },
): DrawResult {
  const seed = options.seed ?? newSeed();
  const rng: Rng = seedrandom(String(seed));
  const classes = draftClasses(options.classes);

  let best: { assignments: Assignment[]; violations: string[] } | null = null;
  for (let i = 0; i < 500; i++) {
    const attempt = attemptDraw(rng, players, picks, options.avoidOwnPick, classes);
    if (!best || attempt.violations.length < best.violations.length) best = attempt;
    if (attempt.violations.length === 0) break;
  }
  const result = best ?? { assignments: [], violations: [] };

  const assignedKeys = new Set(result.assignments.map((a) => `${a.character.key}`));
  const unsummoned: Character[] = [];
  const seen = new Set<string>();
  for (const player of players) {
    for (const cls of classes) {
      const character = picks[player.id]?.[cls];
      if (!character) continue;
      if (assignedKeys.has(character.key)) continue;
      const dedupe = `${character.key}|${player.id}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      unsummoned.push(character);
    }
  }

  return {
    assignments: result.assignments,
    seed,
    relaxedPlayerIds: [...new Set(result.violations)],
    unsummoned,
  };
}
