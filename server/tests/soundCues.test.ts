import { afterEach, describe, expect, it } from 'vitest';
import {
  BURST_MAX,
  BURST_WINDOW_MS,
  STINGS,
  STING_COOLDOWN_MS,
  audioEnabled,
  makeStingGate,
  setAudioEnabled,
  type StingName,
} from '../../client/src/lib/sound';

/*
 * The stings are the client's own concern, but their rules are pure and worth
 * pinning: which recipes exist and what they contain, how long a sting waits
 * before it may ring again, and the ceiling that keeps a burst of war events
 * from turning into noise. The gate takes its clock as an argument, so these
 * tests run a whole war's worth of cues in a microsecond.
 */

const names = Object.keys(STINGS) as StingName[];

describe('the sting recipes', () => {
  it('every sting has at least one note with a real pitch and a bounded ring', () => {
    for (const name of names) {
      const notes = STINGS[name].notes;
      expect(notes.length, name).toBeGreaterThan(0);
      for (const note of notes) {
        expect(note.hz, `${name} hz`).toBeGreaterThan(0);
        expect(note.ms ?? 200, `${name} ms`).toBeLessThanOrEqual(2000);
      }
    }
  });

  it('stays quiet enough to sit under the room', () => {
    for (const name of names) {
      for (const note of STINGS[name].notes) {
        expect(note.gain ?? 0.06, `${name} gain`).toBeLessThanOrEqual(0.12);
      }
    }
  });

  it('the war tick may repeat more often than the default cooldown', () => {
    expect(STINGS.tick.cooldown ?? STING_COOLDOWN_MS).toBeLessThan(STING_COOLDOWN_MS);
  });

  it('has a distinct sting for each moment the cues fire', () => {
    for (const name of ['pick', 'clean', 'flagged', 'lock', 'summon', 'war', 'tick', 'fall', 'arena', 'verdict', 'finale']) {
      expect(names, name).toContain(name);
    }
  });
});

describe('the sting gate', () => {
  it('lets a sting through once and holds its repeat until the cooldown passes', () => {
    const due = makeStingGate();
    expect(due('pick', 1_000)).toBe(true);
    expect(due('pick', 1_000 + STING_COOLDOWN_MS - 1)).toBe(false);
    expect(due('pick', 1_000 + STING_COOLDOWN_MS)).toBe(true);
  });

  it('lets different stings ring at the same moment', () => {
    const due = makeStingGate();
    expect(due('pick', 5_000)).toBe(true);
    expect(due('clean', 5_000)).toBe(true);
    expect(due('flagged', 5_000)).toBe(true);
  });

  it('drops everything past the burst ceiling inside the window', () => {
    const due = makeStingGate();
    const allowed = names.filter((name) => due(name, 20_000));
    expect(allowed.length).toBe(BURST_MAX);
    // and the window is what the ceiling is counted over, not the whole run
    expect(due(names[BURST_MAX]!, 20_000 + BURST_WINDOW_MS)).toBe(true);
  });

  it('plays a war at full speed tick by tick, but not a clump of them', () => {
    // 150 ms apart is the room's fastest autoplay: every event is heard.
    const fast = makeStingGate();
    const atSpeed = [0, 150, 300, 450, 600, 750].filter((at) => fast('tick', at));
    expect(atSpeed.length).toBe(6);
    // The same day arriving in one clump — a replayed state, a jump — is one
    // sting, not six.
    const clump = makeStingGate();
    const atOnce = [0, 5, 10, 15, 20].filter((at) => clump('tick', at));
    expect(atOnce.length).toBe(1);
  });
});

describe('the mute preference', () => {
  afterEach(() => setAudioEnabled(true));

  it('is on by default, and remembers being turned off', () => {
    // No window here: storage is unavailable, so the default is what matters.
    expect(audioEnabled()).toBe(true);
    setAudioEnabled(false);
    expect(audioEnabled()).toBe(false);
  });
});
