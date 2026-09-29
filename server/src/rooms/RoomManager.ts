import { LIMITS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@hgd/shared';
import blocklistRaw from '../data/blocklist.json';
import { logger } from '../logger';
import { Room, type EmitAll, type EmitOne } from './Room';

const BLOCKLIST = new Set((blocklistRaw as string[]).map((w) => w.toUpperCase()));

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    private readonly emitAllFor: (code: string) => EmitAll,
    private readonly emitOneFor: (code: string) => EmitOne,
  ) {}

  startSweeper(): void {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => this.sweep(), 5 * 60 * 1000);
    this.sweeper.unref?.();
  }

  stop(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
  }

  generateCode(): string {
    for (let attempt = 0; attempt < 200; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
      }
      if (this.rooms.has(code)) continue;
      if (BLOCKLIST.has(code)) continue;
      if ([...BLOCKLIST].some((bad) => code.startsWith(bad) || code.endsWith(bad))) continue;
      return code;
    }
    // Astronomically unlikely; fall back to a longer code.
    return `${Date.now().toString(36).toUpperCase().slice(-6)}`;
  }

  create(): Room {
    const code = this.generateCode();
    const room = new Room(code, this.emitAllFor(code), this.emitOneFor(code));
    this.rooms.set(code, room);
    logger.info({ code }, 'room created');
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase().trim());
  }

  delete(code: string): void {
    this.rooms.delete(code.toUpperCase());
  }

  sweep(): number {
    let removed = 0;
    for (const [code, room] of this.rooms) {
      const empty = room.players.size === 0;
      if (room.isIdle() || empty) {
        this.rooms.delete(code);
        removed++;
      }
    }
    if (removed) logger.info({ removed, remaining: this.rooms.size }, 'rooms swept');
    return removed;
  }

  get size(): number {
    return this.rooms.size;
  }

  stats(): { rooms: number; players: number; maxPlayers: number } {
    let players = 0;
    let maxPlayers = 0;
    for (const room of this.rooms.values()) {
      players += room.humanCount();
      maxPlayers = Math.max(maxPlayers, room.humanCount());
    }
    return { rooms: this.rooms.size, players, maxPlayers };
  }

  /** Exposed for tests: total capacity the manager will accept. */
  static get limits() {
    return LIMITS;
  }
}
