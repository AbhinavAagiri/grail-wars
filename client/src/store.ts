import { create } from 'zustand';
import {
  C2S,
  type ChatMessage,
  type ArenaMatch,
  type ArenaPhase,
  type Character,
  type RoomSettings,
  type RoomState,
  type SearchCandidate,
  type SettingsPatch,
  type ServantClass,
  type Toast,
  type WarCursor,
  type WarEvent,
  type WarTimeline,
} from '@hgd/shared';
import { clearSession, loadSession, saveSession, socket, type StoredSession } from './socket';

export { loadNickname, saveNickname } from './socket';

export interface ResearchRow {
  servantId: string;
  name: string;
  imageUrl: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  confidence?: 'high' | 'medium' | 'low';
}

export interface DayEndSummary {
  day: number;
  title: string;
  fallen: string[];
  remaining: string[];
}

export interface ArenaPhaseInfo {
  phase: ArenaPhase;
  endsAt?: number;
  matchId?: string;
  round?: number;
  tie?: boolean;
}

interface AppState {
  connected: boolean;
  room: RoomState | null;
  playerId: string | null;
  session: StoredSession | null;
  toasts: Toast[];
  slotError: { cls: ServantClass; message: string } | null;

  research: ResearchRow[];
  warEvent: WarEvent | null;
  warCursor: WarCursor | null;
  dayEnd: DayEndSummary | null;
  final: { winnerId: string; wish: string; seed?: number } | null;

  arenaMatch: ArenaMatch | null;
  arenaPhaseInfo: ArenaPhaseInfo | null;
  arenaVotes: { votedCount: number; eligibleCount: number; tie?: boolean } | null;
  arenaResult: { match: ArenaMatch; counts: { a: number; b: number } } | null;
  championId: string | null;
  chat: ChatMessage[];

  serverSkewMs: number;

  /* actions */
  pushToast: (toast: Toast) => void;
  dismissToast: (index: number) => void;
  createRoom: (nickname: string) => void;
  joinRoom: (code: string, nickname: string) => void;
  leaveRoom: () => void;
  updateSettings: (patch: SettingsPatch) => void;
  pickLocation: (locationId: string) => void;
  rerollLocation: () => void;
  kick: (playerId: string) => void;
  transferHost: (playerId: string) => void;
  startDraft: () => void;
  pick: (cls: ServantClass, payload: { candidate?: SearchCandidate; customName?: string }) => void;
  setImage: (cls: ServantClass, imageUrl: string) => void;
  clearSlot: (cls: ServantClass) => void;
  lock: () => void;
  unlock: () => void;
  beginSummon: () => void;
  startResearch: () => void;
  overrideProfile: (
    servantId: string,
    patch: { tierPeak?: string; speed?: string; durability?: string; abilities?: string[] },
  ) => void;
  reresearch: (servantId: string) => void;
  startWar: () => void;
  warControl: (action: 'play' | 'pause' | 'next' | 'prev' | 'speed' | 'jump', value?: number) => void;
  startArena: () => void;
  sendChat: (text: string) => void;
  vote: (choice: 'a' | 'b') => void;
  arenaSkip: () => void;
  arenaTiebreak: (servantId: string) => void;
  rematch: () => void;
  toLobby: () => void;
  search: (query: string) => Promise<SearchCandidate[]>;
  uploadImage: (file: File) => Promise<string | null>;
  sendFeedback: (payload: FeedbackInput) => Promise<{ ok: boolean; error?: string }>;
}

export interface FeedbackInput {
  name?: string;
  email?: string;
  topic?: 'bug' | 'idea' | 'balance' | 'other';
  message: string;
  /** honeypot */
  company?: string;
}

export const useStore = create<AppState>((set, get) => ({
  connected: false,
  room: null,
  playerId: null,
  session: null,
  toasts: [],
  slotError: null,
  research: [],
  warEvent: null,
  warCursor: null,
  dayEnd: null,
  final: null,
  arenaMatch: null,
  arenaPhaseInfo: null,
  arenaVotes: null,
  arenaResult: null,
  championId: null,
  chat: [],
  serverSkewMs: 0,

  pushToast: (toast) => {
    const index = get().toasts.length;
    set((s) => ({ toasts: [...s.toasts, toast] }));
    setTimeout(() => get().dismissToast(index), 4500);
  },

  dismissToast: (index) => set((s) => ({ toasts: s.toasts.filter((_, i) => i !== index) })),

  createRoom: (nickname) => {
    lastNickname = nickname;
    socket.emit(C2S.roomCreate, { nickname });
  },

  joinRoom: (code, nickname) => {
    lastNickname = nickname;
    socket.emit(C2S.roomJoin, { code: code.toUpperCase(), nickname });
  },

  leaveRoom: () => {
    socket.emit(C2S.roomLeave, {});
    clearSession();
    set({ room: null, playerId: null, session: null });
  },

  updateSettings: (patch) => socket.emit(C2S.settingsUpdate, { patch }),
  pickLocation: (locationId) => socket.emit(C2S.locationPick, { locationId }),
  rerollLocation: () => socket.emit(C2S.locationReroll, {}),
  kick: (playerId) => socket.emit(C2S.playerKick, { playerId }),
  transferHost: (playerId) => socket.emit(C2S.hostTransfer, { playerId }),
  startDraft: () => socket.emit(C2S.draftStart, {}),

  pick: (cls, payload) => socket.emit(C2S.draftPick, { cls, ...payload }),
  setImage: (cls, imageUrl) => socket.emit(C2S.draftSetImage, { cls, imageUrl }),
  clearSlot: (cls) => socket.emit(C2S.draftClear, { cls }),
  lock: () => socket.emit(C2S.draftLock, {}),
  unlock: () => socket.emit(C2S.draftUnlock, {}),
  beginSummon: () => socket.emit(C2S.summonBegin, {}),
  startResearch: () => socket.emit(C2S.researchStart, {}),
  overrideProfile: (servantId, patch) => socket.emit(C2S.reviewOverride, { servantId, patch }),
  reresearch: (servantId) => socket.emit(C2S.reviewReresearch, { servantId }),
  startWar: () => socket.emit(C2S.warStart, {}),
  warControl: (action, value) => socket.emit(C2S.warControl, { action, value }),
  startArena: () => socket.emit(C2S.arenaStart, {}),
  sendChat: (text) => socket.emit(C2S.arenaChat, { text }),
  vote: (choice) => socket.emit(C2S.arenaVote, { choice }),
  arenaSkip: () => socket.emit(C2S.arenaSkip, {}),
  arenaTiebreak: (servantId) => socket.emit(C2S.arenaTiebreak, { servantId }),
  rematch: () => socket.emit(C2S.gameRematch, {}),
  toLobby: () => socket.emit(C2S.gameToLobby, {}),

  search: async (query) => {
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) return [];
      const data = (await res.json()) as { candidates?: SearchCandidate[] };
      return data.candidates ?? [];
    } catch {
      return [];
    }
  },

  uploadImage: async (file) => {
    const body = new FormData();
    body.append('image', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body });
      if (!res.ok) return null;
      const data = (await res.json()) as { url?: string };
      return data.url ?? null;
    } catch {
      return null;
    }
  },

  sendFeedback: async (payload) => {
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error ?? 'Could not send that. Try again in a moment.' };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not reach the server. Check your connection.' };
    }
  },
}));

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

let wired = false;

export function initSocket(): void {
  if (wired) return;
  wired = true;
  const store = useStore;

  socket.on('connect', () => {
    store.setState({ connected: true });
    // Restore an in-progress session after a reload or a dropped connection.
    const existing = store.getState().session;
    if (existing) {
      socket.emit(C2S.roomReconnect, {
        code: existing.code,
        playerId: existing.playerId,
        sessionToken: existing.sessionToken,
      });
    }
  });

  socket.on('disconnect', () => store.setState({ connected: false }));

  // The server hands back our identity once we are in a room.
  socket.on('room:joined', (payload: { code: string; playerId: string; sessionToken: string }) => {
    adoptIdentity(payload.code, payload.playerId, payload.sessionToken, lastNickname);
  });

  socket.on('room:state', (state: RoomState) => {
    const skew = state.serverNow ? state.serverNow - Date.now() : 0;
    // The server owns the arena: when the snapshot has no live bracket the
    // previous game's match, votes and champion are over and must be dropped
    // (a rematch or a trip back to the lobby starts from a blank screen).
    const arenaLive = Boolean(state.arena && state.arena.phase !== 'IDLE');
    store.setState((s) => ({
      room: state,
      playerId: s.playerId,
      serverSkewMs: skew,
      research: state.research ?? s.research,
      // Chat is server-owned too: rematch / back-to-lobby clear it, and a
      // reload mid-arena restores it.
      chat: state.chat ?? s.chat,
      ...(arenaLive
        ? {}
        : { arenaMatch: null, arenaResult: null, arenaVotes: null, arenaPhaseInfo: null, championId: null }),
      // A new draft clears any stale per-slot error.
      slotError: state.phase === 'DRAFT' ? s.slotError : null,
    }));
  });

  socket.on('toast', (toast: Toast) => store.getState().pushToast(toast));

  socket.on('error', (payload: { message?: string; slot?: ServantClass }) => {
    const message = payload?.message ?? 'Something went wrong.';
    if (payload?.slot) store.setState({ slotError: { cls: payload.slot, message } });
    store.getState().pushToast({ kind: 'error', message });
  });

  socket.on('research:progress', (payload: { rows: ResearchRow[] }) => {
    store.setState({ research: payload.rows });
  });

  socket.on('war:cursor', (cursor: WarCursor & { serverNow: number }) => {
    store.setState({
      warCursor: {
        dayIndex: cursor.dayIndex,
        eventIndex: cursor.eventIndex,
        playing: cursor.playing,
        speedMs: cursor.speedMs,
      },
      serverSkewMs: cursor.serverNow ? cursor.serverNow - Date.now() : store.getState().serverSkewMs,
    });
  });

  socket.on('war:event', (payload: { event: WarEvent }) => {
    store.setState({ warEvent: payload.event });
  });

  socket.on('war:dayEnd', (payload: DayEndSummary) => {
    store.setState({ dayEnd: payload });
  });

  socket.on('war:final', (payload: { winnerId: string; wish: string; seed?: number }) => {
    store.setState({ final: payload, warCursor: store.getState().warCursor && { ...store.getState().warCursor!, playing: false } });
  });

  socket.on('arena:matchStart', (payload: { match: ArenaMatch; round: number; roundName: string }) => {
    store.setState({ arenaMatch: payload.match, arenaResult: null, arenaVotes: null });
  });

  socket.on('arena:phase', (payload: ArenaPhaseInfo) => {
    store.setState({ arenaPhaseInfo: payload });
    if (payload.phase === 'ARGUE') store.setState({ arenaVotes: null });
  });

  socket.on('arena:votes', (payload: { votedCount: number; eligibleCount: number; tie?: boolean }) => {
    store.setState({ arenaVotes: payload });
  });

  socket.on('arena:result', (payload: { match: ArenaMatch; counts?: { a: number; b: number } }) => {
    const match = payload.match;
    store.setState({
      arenaResult: { match, counts: payload.counts ?? { a: match.votesA, b: match.votesB } },
      arenaMatch: match,
    });
  });

  socket.on('arena:champion', (payload: { championId: string }) => {
    store.setState({ championId: payload.championId });
  });

  socket.on('arena:chat', (message: ChatMessage) => {
    store.setState((s) => ({ chat: [...s.chat.slice(-200), message] }));
  });
}

/** The nickname used for the most recent join, kept for session persistence. */
let lastNickname = '';

/** Called with the id/token handed back when a room is created or joined. */
export function adoptIdentity(code: string, playerId: string, sessionToken: string, nickname: string): void {
  const session: StoredSession = { code: code.toUpperCase(), playerId, sessionToken, nickname };
  saveSession(session);
  useStore.setState({ playerId, session });
}

/** Restore identity from localStorage before the first render (page reload). */
export function hydrateSession(): void {
  const existing = loadSession() ?? loadSessionFromUrl();
  if (existing) useStore.setState({ playerId: existing.playerId, session: existing });
}

function loadSessionFromUrl(): StoredSession | null {
  const match = window.location.pathname.match(/\/room\/([A-Za-z0-9]{4,8})/);
  return match ? loadSession(match[1]) : null;
}

export { socket };
