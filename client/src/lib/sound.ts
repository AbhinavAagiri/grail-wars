import { useSyncExternalStore } from 'react';

/**
 * The game's stings.
 *
 * Every sound is a handful of oscillator notes built when it is played, so the
 * bundle carries a few hundred bytes of recipes instead of an audio folder —
 * nothing to preload, nothing to keep in sync between a file name and the
 * moment it is meant to mark. The set is deliberately small: it marks *your*
 * own moves (a pick lands, a check passes or refuses, you lock in), the room's
 * phases (the summoning circle, the war), and the drama the war itself reports
 * (an event, a Servant falling, the end). Nothing loops and nothing plays on
 * the landing page — there is no music, only stings.
 *
 * Browsers refuse to start an audio context until the page has been interacted
 * with, so the first gesture of the session resumes it (and a sting that fires
 * while the context is still asleep is dropped rather than queued — queued
 * notes would all fire in one clump the instant the context woke up).
 */

/* ------------------------------------------------------------------ */
/* Voices                                                              */
/* ------------------------------------------------------------------ */

interface Note {
  /** note to strike, in Hz */
  hz: number;
  /** ms after the sting starts */
  at?: number;
  /** how long the note rings, ms */
  ms?: number;
  /** target frequency to glide to, Hz */
  to?: number;
  type?: OscillatorType;
  /** peak gain of this note */
  gain?: number;
  /** attack time, ms — the swell breathes in instead of clicking on */
  attack?: number;
}

interface Sting {
  notes: Note[];
  /** ignore a repeat of this same sting inside this many ms */
  cooldown?: number;
}

/**
 * The stings, one recipe each. Gains sit around 0.05 because several notes can
 * overlap: a sting is meant to be heard under the room, not over it.
 */
export const STINGS = {
  /** a character is seated on your board */
  pick: { notes: [{ hz: 659, ms: 120, gain: 0.05 }] },
  /** a class check came back clean */
  clean: {
    notes: [
      { hz: 784, ms: 130, gain: 0.06 },
      { hz: 1175, at: 90, ms: 220, gain: 0.05 },
    ],
  },
  /** a class check refused the character */
  flagged: {
    notes: [
      { hz: 311, ms: 180, gain: 0.07 },
      { hz: 233, at: 110, ms: 260, gain: 0.06 },
    ],
  },
  /** you locked in */
  lock: {
    notes: [
      { hz: 523, ms: 130, gain: 0.05 },
      { hz: 659, at: 80, ms: 130, gain: 0.05 },
      { hz: 880, at: 160, ms: 260, gain: 0.06 },
    ],
  },
  /** the summoning phase opens: a chord breathing in */
  summon: {
    notes: [
      { hz: 196, ms: 1400, attack: 420, gain: 0.05, type: 'sine' },
      { hz: 294, at: 120, ms: 1300, attack: 420, gain: 0.045, type: 'sine' },
      { hz: 392, at: 240, ms: 1200, attack: 420, gain: 0.04, type: 'sine' },
    ],
  },
  /** the war begins: a horn rising out of the low end */
  war: {
    notes: [
      { hz: 110, to: 165, ms: 700, attack: 60, gain: 0.08 },
      { hz: 220, at: 320, ms: 500, gain: 0.05 },
    ],
  },
  /** one war event, as the day plays out — the quietest thing here */
  tick: { notes: [{ hz: 880, ms: 60, gain: 0.025 }], cooldown: 110 },
  /** a Servant falls */
  fall: {
    notes: [
      { hz: 160, to: 70, ms: 900, gain: 0.1, type: 'sine' },
      { hz: 80, to: 45, at: 40, ms: 900, gain: 0.07 },
    ],
  },
  /** a new Arena match opens */
  arena: {
    notes: [
      { hz: 523, ms: 320, gain: 0.06 },
      { hz: 415, at: 140, ms: 420, gain: 0.05 },
    ],
  },
  /** an Arena match is decided: the tighter pair of notes after the bell */
  verdict: {
    notes: [
      { hz: 494, ms: 300, gain: 0.055 },
      { hz: 740, at: 110, ms: 420, gain: 0.05 },
    ],
  },
  /** the end of a war, or a champion crowned */
  finale: {
    notes: [
      { hz: 392, ms: 500, gain: 0.06 },
      { hz: 523, at: 120, ms: 600, gain: 0.06 },
      { hz: 659, at: 240, ms: 800, gain: 0.06 },
      { hz: 784, at: 380, ms: 1100, gain: 0.055 },
    ],
  },
} satisfies Record<string, Sting>;

export type StingName = keyof typeof STINGS;

/** How long a sting waits before it may ring again, unless it says otherwise. */
export const STING_COOLDOWN_MS = 150;

/**
 * Ceiling on a burst. Jumping the cursor through a long day, or a replayed
 * state arriving in one clump, can ask for a dozen stings at once; past this
 * many in the window the rest are dropped, so the speakers get a flourish
 * rather than a rattle.
 */
export const BURST_WINDOW_MS = 600;
export const BURST_MAX = 5;

/**
 * The rule that decides whether a sting is due, and the only part of this file
 * that is pure: a clock is passed in rather than read, so the coalescing can be
 * driven at any speed (see `server/tests/soundCues.test.ts`). One gate belongs
 * to the page — the timings it remembers are the page's, not the module's.
 */
export function makeStingGate(): (name: StingName, now: number) => boolean {
  const lastPlayed = new Map<StingName, number>();
  let recent: number[] = [];
  return (name, now) => {
    const recipe: Sting = STINGS[name];
    if (now - (lastPlayed.get(name) ?? Number.NEGATIVE_INFINITY) < (recipe.cooldown ?? STING_COOLDOWN_MS)) {
      return false;
    }
    recent = recent.filter((at) => now - at < BURST_WINDOW_MS);
    if (recent.length >= BURST_MAX) return false;
    recent.push(now);
    lastPlayed.set(name, now);
    return true;
  };
}

const due = makeStingGate();

/* ------------------------------------------------------------------ */
/* Preference                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'hgd:audio';

/** Sound is on unless the player has turned it off. */
function readPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    // Storage can be unavailable (private windows, blocked cookies); the
    // default is what a first-time player hears, so failing open is right.
    return true;
  }
}

let enabled = readPreference();
const listeners = new Set<() => void>();

export function audioEnabled(): boolean {
  return enabled;
}

export function setAudioEnabled(next: boolean): void {
  if (next === enabled) return;
  enabled = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    // Nothing to do — the choice simply does not outlive this page.
  }
  if (next) {
    ensureUnlock();
    resumeContext();
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The mute state, as a React store — used by the header's toggle. */
export function useAudioEnabled(): boolean {
  return useSyncExternalStore(subscribe, audioEnabled, () => true);
}

/* ------------------------------------------------------------------ */
/* The synth                                                           */
/* ------------------------------------------------------------------ */

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let unlockBound = false;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    bus = ctx.createGain();
    // The master bus: one place to keep the whole set polite.
    bus.gain.value = 0.7;
    bus.connect(ctx.destination);
  }
  return ctx;
}

function resumeContext(): void {
  const audio = context();
  if (audio && audio.state === 'suspended') void audio.resume();
}

/**
 * Browsers keep an audio context suspended until the page has been interacted
 * with. One listener for the session is enough: the first click or key press
 * wakes the context and every sting after it is heard.
 */
function ensureUnlock(): void {
  if (unlockBound || typeof document === 'undefined') return;
  unlockBound = true;
  const wake = () => {
    resumeContext();
    document.removeEventListener('pointerdown', wake);
    document.removeEventListener('keydown', wake);
  };
  document.addEventListener('pointerdown', wake);
  document.addEventListener('keydown', wake);
}

function strike(audio: AudioContext, note: Note): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const start = audio.currentTime + (note.at ?? 0) / 1000;
  const ms = note.ms ?? 200;
  const end = start + ms / 1000;
  const attack = (note.attack ?? 8) / 1000;

  osc.type = note.type ?? 'triangle';
  osc.frequency.setValueAtTime(note.hz, start);
  if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, end);

  // An exponential envelope: a real attack and a clean tail, never a click.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, note.gain ?? 0.06), start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain);
  gain.connect(bus ?? audio.destination);
  osc.start(start);
  osc.stop(end + 0.02);
}

/**
 * Play one sting, unless the player muted the game, the same sting is already
 * ringing, or the burst ceiling has been reached. Silent by design when the
 * browser has no audio context at all — sound is a garnish on this game, not a
 * thing a screen depends on.
 */
export function playSting(name: StingName): void {
  if (!enabled) return;
  if (!due(name, performance.now())) return;

  const audio = context();
  // A suspended context cannot place a note at a stable time; the sting is
  // dropped instead, and the next one plays once the page has been touched.
  if (!audio || audio.state !== 'running') return;
  for (const note of STINGS[name].notes) strike(audio, note);
}

// Bound at import rather than at the first sting. The click that walks into a
// room is a gesture too, and waking the context there (rather than one sting
// later) is what makes the first sound of a session — the tick of a character
// landing on the board — audible instead of dropped. Nothing is created until
// that gesture arrives.
ensureUnlock();
