import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLASSES,
  DEFAULT_SETTINGS,
  type ArenaMatch,
  type Profile,
  type Servant,
  type ServantClass,
} from '@hgd/shared';
import { Room } from '../src/rooms/Room';
import { LEVELS, TIERS } from '../src/research/tiers';

/*
 * "The vote system does not work." The Arena's owner gate refused the two
 * Masters whose Servants were fighting — and the client's own check for "am I
 * in this match?" only ever looked at the first Servant in the list, so one of
 * them was even shown an enabled ballot. A two-Master room could therefore
 * never cast a counting vote: every match ended 0-0 and fell to the host.
 *
 * These tests pin the fixed rules: every Master holds a ballot in every match,
 * a ballot that is cast always counts, an empty window re-opens exactly once,
 * a tied reveal can no longer be restarted by the vote clock, and the Arena
 * refuses to start below three Masters.
 */

function profileFor(name: string): Profile {
  return {
    key: name.toLowerCase(),
    name,
    source: 'Test',
    tierPeak: '7-B',
    tierBase: '7-B',
    tierIndex: TIERS.indexOf('7-B'),
    speed: 'Hypersonic',
    speedIndex: 8,
    durability: 'City',
    durabilityIndex: LEVELS.indexOf('City'),
    range: 'Extended Melee Range',
    rangeIndex: 1,
    intelligence: 'Average',
    intelligenceIndex: 45,
    abilities: [],
    keyAbilityName: 'Strike',
    weaknesses: [],
    archetype: 'fighter',
    tags: ['honorable'],
    alignment: 'good',
    haxScore: 0,
    confidence: 'high',
    sources: [],
    baseScore: 50,
  };
}

function servantFor(index: number, playerId: string): Servant {
  const cls = CLASSES[index % CLASSES.length] as ServantClass;
  const name = `Servant${index}`;
  return {
    id: `s${index}`,
    playerId,
    masterName: `Master${index}`,
    cls,
    character: {
      key: `test:${index}`,
      name,
      source: 'Test',
      provider: 'custom',
      imageUrl: '',
      submittedBy: playerId,
    },
    profile: profileFor(name),
  };
}

interface DebateRoom {
  room: Room;
  host: string;
  masters: string[];
  spectators: string[];
}

/** A ready-to-start Debate room: Masters joined, Servants summoned, quick clocks. */
function debateRoom(masterCount: number, spectatorCount = 0, mode: 'DEBATE' | 'WAR' = 'DEBATE'): DebateRoom {
  const room = new Room('TEST', () => {}, () => {});
  const masters: string[] = [];
  for (let i = 0; i < masterCount; i++) {
    const joined = room.join(`Master${i + 1}`, `socket-m${i}`);
    if (!joined.playerId) throw new Error('the room refused a Master');
    masters.push(joined.playerId);
  }
  const spectators: string[] = [];
  for (let i = 0; i < spectatorCount; i++) {
    const joined = room.join(`Watcher${i + 1}`, `socket-s${i}`, true);
    if (!joined.playerId) throw new Error('the room refused a spectator');
    spectators.push(joined.playerId);
  }
  room.settings = {
    ...DEFAULT_SETTINGS,
    mode,
    classes: [...DEFAULT_SETTINGS.classes],
    war: { ...DEFAULT_SETTINGS.war },
    debate: { ...DEFAULT_SETTINGS.debate, argueSec: 1, voteSec: 2 },
  };
  room.servants = masters.map((id, index) => servantFor(index, id));
  return { room, host: masters[0]!, masters, spectators };
}

/** Start the bracket and let the INTRO and ARGUE clocks run out. */
function openBallotBox(room: Room, host: string): ArenaMatch {
  room.phase = 'SUMMON';
  const started = room.startArena(host);
  expect(started.ok).toBe(true);
  vi.advanceTimersByTime(4_000); // INTRO
  vi.advanceTimersByTime(1_000); // ARGUE (argueSec)
  expect(room.arena.phase).toBe('VOTE');
  const match = room.arena.bracket.find((m) => m.id === room.arena.currentMatchId);
  if (!match) throw new Error('the arena never opened a match');
  return match;
}

describe('debate arena ballots', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts the votes of the two Masters whose Servants are fighting', () => {
    vi.useFakeTimers();
    const { room, host, masters } = debateRoom(3);
    const match = openBallotBox(room, host);
    const owners = [match.a, match.b].map((id) => room.servants.find((s) => s.id === id)?.playerId);
    expect(owners).toHaveLength(2);

    // The two fighters' Masters vote for `a`, the bye Master for `b`. If either
    // owner's ballot were dropped again this lands 1-1 and falls to the host.
    for (const id of masters) room.arenaVote(id, owners.includes(id) ? 'a' : 'b');

    expect(match.voters).toHaveLength(3);
    expect(match.votesA).toBe(2);
    expect(match.votesB).toBe(1);
    expect(match.tieBroken).toBeUndefined();
    expect(match.winner).toBe(match.a);
    expect(room.arena.phase).toBe('REVEAL');
  });

  it('resolves as soon as every Master has voted, without waiting for the clock', () => {
    vi.useFakeTimers();
    const { room, host, masters } = debateRoom(3);
    const match = openBallotBox(room, host);

    for (const id of masters.slice(0, -1)) room.arenaVote(id, 'a');
    expect(room.arena.phase).toBe('VOTE'); // one ballot still out

    room.arenaVote(masters[masters.length - 1]!, 'a');
    expect(room.arena.phase).toBe('REVEAL');
    expect(match.votesA).toBe(3);
  });

  it('refuses a spectator without stalling the room', () => {
    vi.useFakeTimers();
    const { room, host, masters, spectators } = debateRoom(3, 1);
    openBallotBox(room, host);

    const refused = room.arenaVote(spectators[0]!, 'a');
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/spectator/i);

    for (const id of masters) room.arenaVote(id, 'a');
    expect(room.arena.phase).toBe('REVEAL');
  });

  it('re-opens an empty ballot window exactly once, then hands the host the pick', () => {
    vi.useFakeTimers();
    const { room, host } = debateRoom(3);
    const match = openBallotBox(room, host);

    vi.advanceTimersByTime(2_000); // voteSec with nobody voting
    expect(room.arena.phase).toBe('VOTE');
    expect(match.voteWindow).toBe(1);

    vi.advanceTimersByTime(2_000); // the one extra window
    expect(room.arena.phase).toBe('REVEAL');
    expect(match.tieBroken).toBe('host');
    expect(match.winner).toBeUndefined();

    // The clock is spent: it must never hand out a third window.
    vi.advanceTimersByTime(30_000);
    expect(room.arena.phase).toBe('REVEAL');
    expect(room.arena.currentMatchId).toBe(match.id);
  });

  it('keeps the host able to settle a tied reveal, and advances after the pick', () => {
    vi.useFakeTimers();
    const { room, host } = debateRoom(3);
    const match = openBallotBox(room, host);

    vi.advanceTimersByTime(2_000);
    vi.advanceTimersByTime(2_000);
    expect(room.arena.phase).toBe('REVEAL');

    // Only the host may pick, and only one of the two fighters.
    expect(room.arenaTiebreak('nobody', match.a!)).toBe(false);
    expect(room.arenaTiebreak(host, 's99')).toBe(false);
    expect(room.arenaTiebreak(host, match.b!)).toBe(true);
    expect(match.winner).toBe(match.b);
    expect(match.tieBroken).toBe('host');

    vi.advanceTimersByTime(6_000); // the reveal window
    expect(room.arena.currentMatchId).not.toBe(match.id);
  });

  it('does not let the vote clock restart a tie the whole room voted on', () => {
    vi.useFakeTimers();
    const { room, host, masters } = debateRoom(4);
    const match = openBallotBox(room, host);

    // Every Master votes, evenly split: the room resolves itself into a host
    // tie-break while the vote clock is still pending.
    masters.forEach((id, index) => room.arenaVote(id, index % 2 === 0 ? 'a' : 'b'));
    expect(match.votesA).toBe(2);
    expect(match.votesB).toBe(2);
    expect(room.arena.phase).toBe('REVEAL');
    expect(match.tieBroken).toBe('host');

    // The stale clock used to fire here, restarting the match with the ballots
    // wiped and nobody able to see what happened.
    vi.advanceTimersByTime(30_000);
    expect(room.arena.currentMatchId).toBe(match.id);
    expect(room.arena.phase).toBe('REVEAL');
    expect(match.voters).toHaveLength(4);
    expect(match.winner).toBeUndefined();

    expect(room.arenaTiebreak(host, match.a!)).toBe(true);
    vi.advanceTimersByTime(6_000);
    expect(room.arena.currentMatchId).not.toBe(match.id);
  });

  it('shows a tied match honestly to the whole room, counts and names alike', () => {
    vi.useFakeTimers();
    const { room, host, masters } = debateRoom(4);
    const match = openBallotBox(room, host);

    masters.forEach((id, index) => room.arenaVote(id, index % 2 === 0 ? 'a' : 'b'));
    expect(match.tieBroken).toBe('host');

    // A 2-2 tie is decided (it goes to the host), so nobody's snapshot may
    // still claim the match is open — that is what showed the room "0 votes".
    for (const id of masters) {
      const seen = room.sanitize(id).arena!.bracket.find((m) => m.id === match.id)!;
      expect(seen.votesA).toBe(2);
      expect(seen.votesB).toBe(2);
      expect(seen.voters).toHaveLength(4);
      expect(seen.tieBroken).toBe('host');
    }
  });

  it('hides other ballots until the reveal and shows every one after it', () => {
    vi.useFakeTimers();
    const { room, host, masters } = debateRoom(3);
    const match = openBallotBox(room, host);

    room.arenaVote(masters[1]!, 'a');
    const secret = room.sanitize(host).arena!.bracket.find((m) => m.id === match.id)!;
    expect(secret.voters).toHaveLength(0);
    expect(secret.votesA).toBe(0);
    const ownVote = room.sanitize(masters[1]!).arena!.bracket.find((m) => m.id === match.id)!;
    expect(ownVote.voters.map((v) => v.voterId)).toEqual([masters[1]]);

    for (const id of masters) room.arenaVote(id, 'a');
    expect(room.arena.phase).toBe('REVEAL');
    const revealed = room.sanitize(host).arena!.bracket.find((m) => m.id === match.id)!;
    expect(revealed.voters).toHaveLength(3);
    expect(revealed.votesA).toBe(3);
  });

  it('refuses to draft or start a Debate Arena below three Masters', () => {
    const pair = debateRoom(2);
    expect(pair.room.startDraft(pair.host).ok).toBe(false);
    expect(pair.room.startDraft(pair.host).error).toMatch(/at least 3 Masters/);
    expect(pair.room.startArena(pair.host).ok).toBe(false);

    const trio = debateRoom(3);
    expect(trio.room.startDraft(trio.host).ok).toBe(true);

    // A two-Master WAR is still a legal game.
    const war = debateRoom(2, 0, 'WAR');
    expect(war.room.startDraft(war.host).ok).toBe(true);
  });

  it('clears the chat and the bracket on rematch and on the way back to the lobby', () => {
    const { room, host } = debateRoom(3);
    room.addChat(host, 'Gae Bolg beats everything');
    expect(room.sanitize(host).chat).toHaveLength(1);

    expect(room.rematch(host)).toBe(true);
    expect(room.chat).toHaveLength(0);
    expect(room.sanitize(host).chat).toHaveLength(0);
    expect(room.sanitize(host).arena).toBeUndefined();
    expect(room.arena.phase).toBe('IDLE');

    room.addChat(host, 'again, from the top');
    expect(room.toLobby(host)).toBe(true);
    expect(room.chat).toHaveLength(0);
    expect(room.sanitize(host).chat).toHaveLength(0);
  });
});
