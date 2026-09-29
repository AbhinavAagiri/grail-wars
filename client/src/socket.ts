import { io, type Socket } from 'socket.io-client';

/**
 * One shared socket for the whole app. In dev, Vite proxies /socket.io to the
 * server, so a same-origin connection is correct in every deployment.
 */
export const socket: Socket = io({
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
});

export interface StoredSession {
  code: string;
  playerId: string;
  sessionToken: string;
  nickname: string;
}

const SESSION_KEY = 'hgd.session';
const NICKNAME_KEY = 'hgd.nickname';

export function loadSession(code?: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.playerId || !parsed?.sessionToken) return null;
    if (code && parsed.code !== code.toUpperCase()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage may be unavailable; the game still works for this tab */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function loadNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveNickname(nickname: string): void {
  try {
    localStorage.setItem(NICKNAME_KEY, nickname);
  } catch {
    /* ignore */
  }
}
