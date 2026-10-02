import { useEffect, useRef } from 'react';
import type { RoomState } from '@hgd/shared';
import { enabledClasses } from '@hgd/shared';
import { useStore } from '../store';
import { playSting } from '../lib/sound';

interface Board {
  phase: RoomState['phase'];
  picks: string[];
  checks: string[];
  locked: boolean;
}

/**
 * The one place the client decides a sting is due.
 *
 * Every moment worth a sound is a transition the client already has: a war
 * event arriving on its socket, a match opening, the phase moving on, or a slot
 * on your own draft board changing. Watching those here — rather than calling a
 * speaker from each page — keeps the stings in one list that can be read, tuned
 * or muted as a whole, and means a screen added later makes a sound only if it
 * changes one of these things.
 *
 * The first snapshot of a room is a baseline, never a cue: joining a room
 * mid-war, or reloading a page, must not fire a volley of stings for a state
 * that was already true before the player's eyes were on it.
 */
export function SoundCues() {
  const room = useStore((s) => s.room);
  const playerId = useStore((s) => s.playerId);
  const warEvent = useStore((s) => s.warEvent);
  const final = useStore((s) => s.final);
  const arenaMatch = useStore((s) => s.arenaMatch);
  const arenaResult = useStore((s) => s.arenaResult);
  const championId = useStore((s) => s.championId);

  const seen = useRef({ eventId: '', finalKey: '', matchId: '', resultId: '', championId: '' });

  // The war's own pushes, one event at a time: the tick that walks the war
  // forward, or the deeper note when that event says someone fell.
  useEffect(() => {
    if (!warEvent || seen.current.eventId === warEvent.id) return;
    seen.current.eventId = warEvent.id;
    playSting(warEvent.deaths.length ? 'fall' : 'tick');
  }, [warEvent]);

  useEffect(() => {
    if (!final) return;
    const key = `${final.winnerId}:${final.wish}`;
    if (seen.current.finalKey === key) return;
    seen.current.finalKey = key;
    playSting('finale');
  }, [final]);

  useEffect(() => {
    if (!arenaMatch || seen.current.matchId === arenaMatch.id) return;
    seen.current.matchId = arenaMatch.id;
    playSting('arena');
  }, [arenaMatch]);

  useEffect(() => {
    const id = arenaResult?.match.id;
    if (!id || seen.current.resultId === id) return;
    seen.current.resultId = id;
    playSting('verdict');
  }, [arenaResult]);

  useEffect(() => {
    if (!championId || seen.current.championId === championId) return;
    seen.current.championId = championId;
    playSting('finale');
  }, [championId]);

  const board = useRef<Board | null>(null);
  useEffect(() => {
    if (!room) {
      board.current = null;
      return;
    }
    const classes = enabledClasses(room.settings.classes);
    const picks = classes.map((cls) => room.myPicks?.[cls]?.key ?? '');
    const checks = classes.map((cls) => room.myPickChecks?.[cls]?.status ?? '');
    const me = room.players.find((p) => p.id === playerId);
    const locked = Boolean(me && !me.isSpectator && me.locked);

    const prev = board.current;
    board.current = { phase: room.phase, picks, checks, locked };
    if (!prev) return;

    if (prev.phase !== room.phase) {
      if (room.phase === 'SUMMON') playSting('summon');
      else if (room.phase === 'WAR') playSting('war');
    }
    for (let i = 0; i < classes.length; i += 1) {
      if (!prev.picks[i] && picks[i]) playSting('pick');
      if (prev.checks[i] !== checks[i]) {
        if (checks[i] === 'ok') playSting('clean');
        else if (checks[i] === 'flagged' || checks[i] === 'refused') playSting('flagged');
      }
    }
    if (!prev.locked && locked) playSting('lock');
  }, [room, playerId]);

  return null;
}
