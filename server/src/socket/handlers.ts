import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { CLASSES, C2S, LIMITS, type SearchCandidate, type ServantClass } from '@hgd/shared';
import { logger } from '../logger';
import { candidateToCharacter, customCharacter } from '../api/search';
import type { RoomManager } from '../rooms/RoomManager';
import type { Room, SettingsPatch } from '../rooms/Room';
import { sanitizeText } from '../util/text';

const MAX_EVENTS_PER_SECOND = 20;
const CHAT_MIN_INTERVAL_MS = 800;

const nicknameSchema = z.string().min(1).max(LIMITS.NAME_MAX);
const codeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,8}$/, 'Invalid room code');

const candidateSchema = z.object({
  key: z.string().max(200),
  name: z.string().max(LIMITS.CHARACTER_NAME_MAX),
  source: z.string().max(120),
  provider: z.enum(['anilist', 'vsb', 'wikipedia', 'fandom', 'tmdb', 'custom', 'fallback', 'roster']),
  providerId: z.string().max(120).optional(),
  thumb: z.string().max(2000).optional().default(''),
  blurb: z.string().max(400).optional(),
});

const pickSchema = z
  .object({
    cls: z.enum(CLASSES),
    candidate: candidateSchema.optional(),
    customName: z.string().max(LIMITS.CHARACTER_NAME_MAX).optional(),
    imageUrl: z.string().max(2000).optional(),
  })
  .refine((v) => Boolean(v.candidate || v.customName), {
    message: 'Provide a candidate or a custom name',
  });

const settingsSchema = z.object({
  mode: z.enum(['WAR', 'DEBATE']).optional(),
  maxPlayers: z.number().int().min(2).max(LIMITS.MAX_PLAYERS_EXTENDED).optional(),
  extendedWar: z.boolean().optional(),
  draftTimerSec: z.number().int().min(0).max(3600).optional(),
  avoidOwnPick: z.boolean().optional(),
  allowSpectators: z.boolean().optional(),
  classes: z.array(z.enum(CLASSES)).max(CLASSES.length).optional(),
  aiChooses: z.boolean().optional(),
  aiPool: z.enum(['anime', 'history', 'mixed']).optional(),
  war: z
    .object({
      days: z.number().int().min(3).max(7).optional(),
      minEventsPerDay: z.number().int().min(1).max(12).optional(),
      maxEventsPerDay: z.number().int().min(1).max(14).optional(),
      narration: z.enum(['templated', 'ai', 'hunger_games', 'fate']).optional(),
      locationMode: z.enum(['players', 'ai']).optional(),
      autoplayMs: z.number().int().min(0).max(60000).optional(),
      classAdvantage: z.boolean().optional(),
      commandSpellRescues: z.boolean().optional(),
      goreLevel: z.enum(['standard', 'mild']).optional(),
      maxPowerLevel: z.string().max(20).optional(),
    })
    .optional(),
  debate: z
    .object({
      argueSec: z.number().int().min(10).max(600).optional(),
      voteSec: z.number().int().min(5).max(300).optional(),
      tieBreak: z.enum(['host', 'random', 'oracle']).optional(),
      showOracleCards: z.boolean().optional(),
      teamUps: z.boolean().optional(),
      teamMode: z.enum(['weaker', 'canonical', 'random']).optional(),
    })
    .optional(),
});

const overrideSchema = z.object({
  servantId: z.string().max(40),
  patch: z.object({
    tierPeak: z.string().max(40).optional(),
    speed: z.string().max(60).optional(),
    durability: z.string().max(60).optional(),
    abilities: z.array(z.string().max(60)).max(8).optional(),
  }),
});

interface SocketData {
  code?: string;
  playerId?: string;
  sessionToken?: string;
  eventTimes: number[];
  lastChatAt?: number;
}

export function registerHandlers(io: Server, manager: RoomManager): void {
  io.on('connection', (socket: Socket) => {
    const data = socket.data as SocketData;
    data.eventTimes = [];

    const roomFor = (): Room | undefined => (data.code ? manager.get(data.code) : undefined);
    const fail = (message: string) => socket.emit('error', { kind: 'error', message });

    const throttled = (): boolean => {
      const now = Date.now();
      data.eventTimes = data.eventTimes.filter((t) => now - t < 1000);
      data.eventTimes.push(now);
      return data.eventTimes.length > MAX_EVENTS_PER_SECOND;
    };

    /** Wrap a handler so payloads are validated and errors never leak internals. */
    const on = <T extends z.ZodTypeAny>(
      event: string,
      schema: T,
      handler: (payload: z.infer<T>, room: Room) => void | Promise<void>,
      options: { needsRoom?: boolean } = {},
    ) => {
      socket.on(event, (raw: unknown) => {
        if (throttled()) {
          socket.emit('error', { kind: 'error', message: 'Slow down a moment.' });
          return;
        }
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          socket.emit('error', { kind: 'error', message: 'Invalid request.' });
          return;
        }
        const room = roomFor();
        if (options.needsRoom !== false && !room) {
          fail('You are not in a room.');
          return;
        }
        try {
          const result = handler(parsed.data, room as Room);
          if (result instanceof Promise) {
            result.catch((err) => {
              logger.warn({ err, event }, 'handler failed');
              fail('Something went wrong.');
            });
          }
        } catch (err) {
          logger.warn({ err, event }, 'handler failed');
          fail('Something went wrong.');
        }
      });
    };

    /** Attach the socket to a room and send them their snapshot. */
    const attach = (room: Room, playerId: string, token: string) => {
      data.code = room.code;
      data.playerId = playerId;
      data.sessionToken = token;
      void socket.join(room.code);
      room.sendState(playerId);
    };

    /* -------------------------------------------------------------- */
    /* Room lifecycle                                                  */
    /* -------------------------------------------------------------- */

    on(
      C2S.roomCreate,
      z.object({ nickname: nicknameSchema }),
      (payload) => {
        const room = manager.create();
        const joined = room.join(payload.nickname, socket.id, false);
        if (!joined.ok || !joined.playerId || !joined.sessionToken) {
          fail(joined.error ?? 'Could not create the room.');
          return;
        }
        attach(room, joined.playerId, joined.sessionToken);
        // Hand the client its identity so it can reconnect after a reload.
        socket.emit('room:joined', {
          code: room.code,
          playerId: joined.playerId,
          sessionToken: joined.sessionToken,
        });
        room.broadcast();
      },
      // Creating a room is exactly how you stop being room-less.
      { needsRoom: false },
    );

    on(
      C2S.roomJoin,
      z.object({ code: codeSchema, nickname: nicknameSchema }),
      (payload) => {
        const room = manager.get(payload.code);
        if (!room) {
          fail('No room with that code.');
          return;
        }
        const joined = room.join(payload.nickname, socket.id, false);
        if (!joined.ok || !joined.playerId || !joined.sessionToken) {
          fail(joined.error ?? 'Could not join.');
          return;
        }
        attach(room, joined.playerId, joined.sessionToken);
        socket.emit('room:joined', {
          code: room.code,
          playerId: joined.playerId,
          sessionToken: joined.sessionToken,
        });
        socket.emit('toast', { kind: 'success', message: `Joined room ${room.code}.` });
        room.broadcast();
      },
      { needsRoom: false },
    );

    on(
      C2S.roomReconnect,
      z.object({ code: codeSchema, playerId: z.string().max(40), sessionToken: z.string().max(60) }),
      (payload) => {
        const room = manager.get(payload.code);
        if (!room) {
          fail('That room is gone.');
          return;
        }
        if (!room.reconnect(payload.playerId, payload.sessionToken)) {
          fail('Could not restore your session.');
          return;
        }
        attach(room, payload.playerId, payload.sessionToken);
        room.broadcast();
      },
      { needsRoom: false },
    );

    on(
      C2S.roomLeave,
      z.object({}),
      () => {
        const room = roomFor();
        if (!room || !data.playerId) return;
        room.removePlayer(data.playerId, 'left');
        void socket.leave(room.code);
        room.broadcast();
        data.code = undefined;
        data.playerId = undefined;
      },
      { needsRoom: false },
    );

    on(C2S.settingsUpdate, z.object({ patch: settingsSchema }), (payload, room) => {
      if (!data.playerId) return;
      if (room.updateSettings(data.playerId, payload.patch as SettingsPatch)) {
        room.broadcast();
      } else {
        fail('Only the host can change the settings.');
      }
    });

    on(C2S.locationPick, z.object({ locationId: z.string().max(80) }), (payload, room) => {
      if (!data.playerId) return;
      const result = room.pickLocation(data.playerId, payload.locationId);
      if (!result.ok) {
        fail(result.error ?? 'Could not choose that location.');
        return;
      }
      room.broadcast();
    });

    on(C2S.locationReroll, z.object({}), (_payload, room) => {
      if (!data.playerId) return;
      if (!room.rerollLocation(data.playerId)) fail('Only the host can re-roll the location.');
      else room.broadcast();
    });

    on(C2S.playerKick, z.object({ playerId: z.string().max(40) }), (payload, room) => {
      if (data.playerId !== room.hostId) {
        fail('Only the host can remove players.');
        return;
      }
      if (payload.playerId === room.hostId) return;
      room.removePlayer(payload.playerId, 'kicked');
      room.broadcast();
    });

    on(C2S.hostTransfer, z.object({ playerId: z.string().max(40) }), (payload, room) => {
      if (!data.playerId) return;
      if (room.transferHost(data.playerId, payload.playerId)) room.broadcast();
    });

    /* -------------------------------------------------------------- */
    /* Draft                                                           */
    /* -------------------------------------------------------------- */

    on(C2S.draftStart, z.object({}), (_payload, room) => {
      if (!data.playerId) return;
      const result = room.startDraft(data.playerId);
      if (!result.ok) fail(result.error ?? 'Could not start the draft.');
      else room.broadcast();
    });

    on(C2S.draftPick, pickSchema, (payload, room) => {
      if (!data.playerId) return;
      const playerId = data.playerId;
      const character = payload.candidate
        ? candidateToCharacter(payload.candidate as SearchCandidate, playerId, payload.imageUrl)
        : customCharacter(payload.customName ?? '', playerId);
      if (!character.name) {
        fail('That name is empty.');
        return;
      }
      // The pick lands now; its class check reports on the card afterwards.
      const result = room.setPick(playerId, payload.cls as ServantClass, character);
      if (!result.ok) {
        socket.emit('error', { kind: 'error', message: result.error ?? 'Pick rejected.', slot: payload.cls });
        return;
      }
      room.broadcast();
    });

    on(
      C2S.draftSetImage,
      z.object({ cls: z.enum(CLASSES), imageUrl: z.string().min(1).max(2000) }),
      (payload, room) => {
        if (!data.playerId) return;
        const result = room.setImage(data.playerId, payload.cls as ServantClass, payload.imageUrl);
        if (!result.ok) fail(result.error ?? 'Could not set that image.');
        room.broadcast();
      },
    );

    on(C2S.draftClear, z.object({ cls: z.enum(CLASSES) }), (payload, room) => {
      if (!data.playerId) return;
      room.clearPick(data.playerId, payload.cls as ServantClass);
      room.broadcast();
    });

    on(C2S.draftLock, z.object({}), (_payload, room) => {
      if (!data.playerId) return;
      const result = room.lock(data.playerId);
      if (!result.ok) fail(result.error ?? 'Could not lock in.');
      room.broadcast();
    });

    on(C2S.draftUnlock, z.object({}), (_payload, room) => {
      if (!data.playerId) return;
      room.unlock(data.playerId);
      room.broadcast();
    });

    on(C2S.summonBegin, z.object({}), (_payload, room) => {
      if (!data.playerId) return;
      const result = room.beginSummon(data.playerId);
      if (!result.ok) fail(result.error ?? 'Could not begin the summoning.');
      room.broadcast();
    });

    /* -------------------------------------------------------------- */
    /* Research + review                                               */
    /* -------------------------------------------------------------- */

    on(C2S.researchStart, z.object({}), async (_payload, room) => {
      if (!data.playerId) return;
      const result = await room.startResearch(data.playerId);
      if (!result.ok) fail(result.error ?? 'Could not start research.');
    });

    on(C2S.reviewOverride, overrideSchema, (payload, room) => {
      if (!data.playerId) return;
      if (!room.overrideProfile(data.playerId, payload.servantId, payload.patch)) {
        fail('Only the host can edit profiles.');
      }
    });

    on(C2S.reviewReresearch, z.object({ servantId: z.string().max(40) }), async (payload, room) => {
      if (!data.playerId) return;
      await room.reresearch(data.playerId, payload.servantId);
    });

    /* -------------------------------------------------------------- */
    /* War                                                             */
    /* -------------------------------------------------------------- */

    on(C2S.warStart, z.object({}), async (_payload, room) => {
      if (!data.playerId) return;
      const result = await room.startWar(data.playerId);
      if (!result.ok) fail(result.error ?? 'Could not start the war.');
    });

    on(
      C2S.warControl,
      z.object({
        action: z.enum(['play', 'pause', 'next', 'prev', 'speed', 'jump']),
        value: z.number().optional(),
      }),
      (payload, room) => {
        if (!data.playerId) return;
        if (!room.warControl(data.playerId, payload.action, payload.value)) {
          fail('Only the host controls the pace.');
        }
      },
    );

    /* -------------------------------------------------------------- */
    /* Arena                                                           */
    /* -------------------------------------------------------------- */

    on(C2S.arenaStart, z.object({}), (_payload, room) => {
      if (!data.playerId) return;
      const result = room.startArena(data.playerId);
      if (!result.ok) fail(result.error ?? 'Could not start the arena.');
    });

    on(C2S.arenaChat, z.object({ text: z.string().min(1).max(LIMITS.CHAT_MAX) }), (payload, room) => {
      if (!data.playerId) return;
      const now = Date.now();
      if (data.lastChatAt && now - data.lastChatAt < CHAT_MIN_INTERVAL_MS) return;
      data.lastChatAt = now;
      const message = room.addChat(data.playerId, sanitizeText(payload.text, LIMITS.CHAT_MAX));
      if (message) room.emitChat(message);
    });

    on(C2S.arenaVote, z.object({ choice: z.enum(['a', 'b']) }), (payload, room) => {
      if (!data.playerId) return;
      const result = room.arenaVote(data.playerId, payload.choice);
      if (!result.ok) fail(result.error ?? 'Vote rejected.');
    });

    on(C2S.arenaSkip, z.object({}), (_payload, room) => {
      if (!data.playerId) return;
      if (!room.arenaSkip(data.playerId)) fail('Only the host can skip.');
    });

    on(C2S.arenaTiebreak, z.object({ servantId: z.string().max(40) }), (payload, room) => {
      if (!data.playerId) return;
      if (!room.arenaTiebreak(data.playerId, payload.servantId)) fail('Could not set the winner.');
    });

    /* -------------------------------------------------------------- */
    /* Game lifecycle                                                  */
    /* -------------------------------------------------------------- */

    on(C2S.gameRematch, z.object({}), (_payload, room) => {
      if (!data.playerId) return;
      if (!room.rematch(data.playerId)) fail('Only the host can start a rematch.');
      else room.broadcast();
    });

    on(C2S.gameToLobby, z.object({}), (_payload, room) => {
      if (!data.playerId) return;
      if (!room.toLobby(data.playerId)) fail('Only the host can return to the lobby.');
      else room.broadcast();
    });

    /* -------------------------------------------------------------- */
    /* Connection housekeeping                                         */
    /* -------------------------------------------------------------- */

    // Sent by clients every few minutes while a room is open (see App.tsx).
    // Nothing reads its payload and nothing changes because of it — it exists
    // so that a host which spins idle services down keeps seeing inbound
    // WebSocket traffic. Render's free plan sleeps a service after 15 minutes
    // without any, and a sleep would wipe the in-memory rooms mid-game.
    on(
      C2S.keepalive,
      z.object({}),
      () => {
        logger.debug({ playerId: data.playerId }, 'keepalive');
      },
      // A room may vanish between heartbeats; a keepalive must never toast.
      { needsRoom: false },
    );

    socket.on('disconnect', () => {
      const room = roomFor();
      if (room && data.playerId) {
        room.markDisconnected(data.playerId);
        room.broadcast();
      }
    });
  });
}
