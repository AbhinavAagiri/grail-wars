import { nanoid } from 'nanoid';
import {
  CLASSES,
  CLASS_META,
  DEFAULT_POWER_CAP,
  DEFAULT_SETTINGS,
  enabledClasses,
  LIMITS,
  roundName,
  type Assignment,
  type ArenaMatch,
  type ArenaPhase,
  type ArenaState,
  type Character,
  type ChatMessage,
  type Mode,
  type Phase,
  type Player,
  type Profile,
  type RoomSettings,
  type RoomState,
  type Servant,
  type ServantClass,
  type SettingsPatch,
  type WarEvent,
  type WarLocation,
  type WarTimeline,
} from '@hgd/shared';
import { logger } from '../logger';
import { buildImageCandidates, researchCharacter } from '../research';
import { classRefusal, classVerdictFor, type ClassVerdict } from '../research/classAffinity';
import { politicalRefusal } from '../research/politicalFigures';
import { applyPowerCap, parsePowerCap } from '../research/powerCap';
import { generate as llmGenerate, llmEnabled } from '../llm';
import { generatedAvatar, isPlaceholderImage, proxyUrl } from '../util/imageUrl';
import { sanitizeText } from '../util/text';
import { runSimulation } from '../sim/director';
import { randomWarLocations } from '../sim/locations';
import { baseScore } from '../sim/score';
import { parseDurability, parseSpeed, parseTier } from '../research/tiers';
import fallbackCharacters from '../data/fallback-characters.json';
import seedrandom from 'seedrandom';
import {
  buildBracket,
  countVotes,
  isChampion,
  matchById,
  nextPlayableMatch,
  roundName,
  setMatchWinner,
  totalRoundsFor,
} from '../arena/bracket';
import { newSeed, runDraw, type PickTable } from './draw';
import { POOL_SIZE, buildDraftPools } from './draftPool';

export type EmitAll = (event: string, payload: unknown) => void;
export type EmitOne = (playerId: string, event: string, payload: unknown) => void;

export type { SettingsPatch } from '@hgd/shared';

const RESEARCH_CONCURRENCY = 3;
const RESEARCH_TIMEOUT_MS = 60_000;

interface ResearchRow {
  status: 'pending' | 'running' | 'done' | 'failed';
  confidence?: 'high' | 'medium' | 'low';
}

export interface JoinResult {
  ok: boolean;
  error?: string;
  playerId?: string;
  sessionToken?: string;
  isSpectator?: boolean;
}

export class Room {
  readonly code: string;
  readonly createdAt = Date.now();
  lastActive = Date.now();
  hostId = '';
  phase: Phase = 'LOBBY';
  settings: RoomSettings = {
    ...DEFAULT_SETTINGS,
    classes: [...DEFAULT_SETTINGS.classes],
    war: { ...DEFAULT_SETTINGS.war },
    debate: { ...DEFAULT_SETTINGS.debate },
  };
  round = 1;

  readonly players = new Map<string, Player>();
  private readonly sessions = new Map<string, string>();
  readonly picks = new Map<string, Partial<Record<ServantClass, Character>>>();
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();

  assignments: Assignment[] = [];
  servants: Servant[] = [];
  unsummoned: Character[] = [];
  drawSeed?: number;
  /** the real-world city this war is fought in */
  warLocation?: WarLocation;
  /** set while a Master is choosing the location from three options */
  locationChoice?: { chooserId: string; options: WarLocation[] };

  /** AI-Chooses roster for the current draft, up to POOL_SIZE per enabled class. */
  draftPool = new Map<ServantClass, Character[]>();

  research = new Map<string, ResearchRow>();
  timeline?: WarTimeline;
  cursor = { dayIndex: 0, eventIndex: 0, playing: false, speedMs: 7000 };
  winnerId?: string;
  wish?: string;

  arena: { bracket: ArenaMatch[]; phase: ArenaPhase; currentMatchId?: string; endsAt?: number; championId?: string } = {
    bracket: [],
    phase: 'IDLE',
  };
  chat: ChatMessage[] = [];

  private warTimer: NodeJS.Timeout | null = null;
  private arenaTimer: NodeJS.Timeout | null = null;
  private draftTimer: NodeJS.Timeout | null = null;
  private draftEndsAt?: number;
  private researchStarted = false;

  constructor(
    code: string,
    private readonly emitAll: EmitAll,
    private readonly emitOne: EmitOne,
  ) {
    this.code = code;
  }

  /* ---------------------------------------------------------------- */
  /* Players                                                          */
  /* ---------------------------------------------------------------- */

  uniqueNickname(nickname: string): string {
    const base = sanitizeText(nickname, LIMITS.NAME_MAX) || 'Master';
    const taken = new Set([...this.players.values()].map((p) => p.nickname.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; i < 50; i++) {
      const candidate = `${base} (${i})`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${base} (${nanoid(3)})`;
  }

  /** The classes this room is drafting, in canonical order. */
  classes(): ServantClass[] {
    return enabledClasses(this.settings.classes);
  }

  humanCount(): number {
    return [...this.players.values()].filter((p) => !p.isSpectator).length;
  }

  spectatorCount(): number {
    return [...this.players.values()].filter((p) => p.isSpectator).length;
  }

  private nextColorIndex(): number {
    const used = new Set([...this.players.values()].map((p) => p.colorIndex));
    for (let i = 0; i < 64; i++) if (!used.has(i)) return i;
    return this.players.size;
  }

  join(nickname: string, socketId: string, asSpectator = false): JoinResult {
    const started = this.phase !== 'LOBBY';
    const roomFull = this.humanCount() >= this.settings.maxPlayers;
    if (started && !asSpectator) {
      if (!this.settings.allowSpectators) return { ok: false, error: 'This war is already in progress.' };
      return this.join(nickname, socketId, true);
    }
    if (!started && roomFull) return { ok: false, error: 'This room is full.' };
    if (started && asSpectator && !this.settings.allowSpectators) {
      return { ok: false, error: 'Spectators are not allowed in this room.' };
    }

    const id = nanoid(12);
    const token = nanoid(24);
    const player: Player = {
      id,
      nickname: this.uniqueNickname(nickname),
      isHost: this.players.size === 0,
      connected: true,
      colorIndex: this.nextColorIndex(),
      locked: false,
      isSpectator: asSpectator || started,
      joinedAt: Date.now(),
    };
    if (player.isHost) this.hostId = id;
    this.players.set(id, player);
    this.sessions.set(token, id);
    this.syncLocation();
    this.touch();
    return { ok: true, playerId: id, sessionToken: token, isSpectator: player.isSpectator };
  }

  reconnect(playerId: string, token: string): boolean {
    const owner = this.sessions.get(token);
    if (owner !== playerId) return false;
    const player = this.players.get(playerId);
    if (!player) return false;
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }
    player.connected = true;
    this.touch();
    return true;
  }

  markDisconnected(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.connected = false;
    const timer = setTimeout(() => this.removePlayer(playerId, 'disconnected'), LIMITS.RECONNECT_GRACE_MS);
    timer.unref?.();
    this.disconnectTimers.set(playerId, timer);
    this.touch();
  }

  removePlayer(playerId: string, reason: 'left' | 'disconnected' | 'kicked' = 'left'): void {
    const player = this.players.get(playerId);
    if (!player) return;
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }
    this.players.delete(playerId);
    for (const [token, id] of this.sessions) if (id === playerId) this.sessions.delete(token);
    // The room keeps their picks during an active game so the war can continue.
    if (reason !== 'left') this.picks.delete(playerId);

    if (this.hostId === playerId && this.players.size) {
      const nextHost = [...this.players.values()]
        .filter((p) => !p.isSpectator)
        .sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (nextHost) {
        this.hostId = nextHost.id;
        nextHost.isHost = true;
        for (const p of this.players.values()) p.isHost = p.id === nextHost.id;
        this.emitAll('toast', { kind: 'info', message: `${nextHost.nickname} is now the host.` });
      }
    }
    this.syncLocation();
    this.touch();
  }

  transferHost(actorId: string, targetId: string): boolean {
    if (actorId !== this.hostId) return false;
    const target = this.players.get(targetId);
    if (!target) return false;
    this.hostId = targetId;
    for (const p of this.players.values()) p.isHost = p.id === targetId;
    this.touch();
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Settings                                                         */
  /* ---------------------------------------------------------------- */

  updateSettings(actorId: string, patch: SettingsPatch): boolean {
    if (actorId !== this.hostId) return false;
    const next: RoomSettings = {
      ...this.settings,
      ...patch,
      classes: patch.classes ? [...patch.classes] : [...this.settings.classes],
      war: { ...this.settings.war, ...(patch.war ?? {}) },
      debate: { ...this.settings.debate, ...(patch.debate ?? {}) },
    };
    const maxAllowed = next.extendedWar ? LIMITS.MAX_PLAYERS_EXTENDED : LIMITS.MAX_PLAYERS_DEFAULT;
    next.maxPlayers = Math.max(LIMITS.MIN_PLAYERS, Math.min(maxAllowed, next.maxPlayers || LIMITS.MAX_PLAYERS_DEFAULT));
    if (!next.extendedWar) next.maxPlayers = Math.min(next.maxPlayers, LIMITS.MAX_PLAYERS_DEFAULT);
    // Unknown or empty class selections fall back to the canonical seven.
    next.classes = enabledClasses(next.classes);
    // An "ai" narration setting is meaningless without a key.
    if (next.war.narration === 'ai' && !llmEnabled()) next.war.narration = 'templated';
    // An unknown Max Power level (a stale client, a hand-edited room) falls back
    // to the default rather than silently disabling the cap.
    if (!parsePowerCap(next.war.maxPowerLevel)) next.war.maxPowerLevel = DEFAULT_POWER_CAP;
    const locationModeChanged = patch.war?.locationMode !== undefined && patch.war.locationMode !== this.settings.war.locationMode;
    const aiChoosesChanged =
      (patch.aiChooses !== undefined && patch.aiChooses !== this.settings.aiChooses) ||
      (patch.aiPool !== undefined && patch.aiPool !== this.settings.aiPool);
    const powerCapChanged = next.war.maxPowerLevel !== this.settings.war.maxPowerLevel;
    this.settings = next;
    // Lowering the cap mid-review scales the Servants already researched; the
    // uncapped profiles are kept, so raising it again restores them.
    if (powerCapChanged) this.reapplyPowerCap();
    // Switching the AI-Chooses mode mid-draft must re-deal immediately; the
    // pool is what the room is drafting from.
    if (aiChoosesChanged && this.phase === 'DRAFT') this.refreshDraftPool();
    this.syncLocation(locationModeChanged);
    this.touch();
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* War location                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Keep the lobby's war location consistent with the chosen mode: pick one at
   * random for "let the AI decide", or put three on the table for a random
   * Master to choose from. Never runs once the war has started.
   */
  syncLocation(force = false): void {
    if (this.phase !== 'LOBBY') return;
    if (force) {
      this.warLocation = undefined;
      this.locationChoice = undefined;
    }
    if (this.warLocation) return;

    if (this.settings.war.locationMode === 'ai') {
      this.warLocation = randomWarLocations(Math.random, 1)[0];
      this.locationChoice = undefined;
      return;
    }

    const chooser = this.locationChoice?.chooserId;
    const chooserPlayer = chooser ? this.players.get(chooser) : undefined;
    if (chooserPlayer && !chooserPlayer.isSpectator && this.locationChoice?.options.length) return;

    const masters = [...this.players.values()].filter((p) => !p.isSpectator);
    if (!masters.length) {
      this.locationChoice = undefined;
      return;
    }
    const elected = masters[Math.floor(Math.random() * masters.length)];
    this.locationChoice = { chooserId: elected.id, options: randomWarLocations(Math.random, 3) };
  }

  /** A Master picking one of the three offered locations. */
  pickLocation(playerId: string, locationId: string): { ok: boolean; error?: string } {
    if (this.phase !== 'LOBBY') return { ok: false, error: 'The war has already begun.' };
    if (this.settings.war.locationMode !== 'players') {
      return { ok: false, error: 'The Grail chooses the location this time.' };
    }
    const choice = this.locationChoice;
    if (!choice) return { ok: false, error: 'No location is being chosen.' };
    if (choice.chooserId !== playerId) return { ok: false, error: 'Another Master is choosing the location.' };
    const chosen = choice.options.find((o) => o.id === locationId);
    if (!chosen) return { ok: false, error: 'That location is not on the table.' };
    this.warLocation = chosen;
    this.locationChoice = undefined;
    this.touch();
    return { ok: true };
  }

  /** Host re-rolls the war location (or the three options on offer). */
  rerollLocation(actorId: string): boolean {
    if (actorId !== this.hostId) return false;
    if (this.phase !== 'LOBBY') return false;
    this.syncLocation(true);
    this.touch();
    return true;
  }

  /** Guarantee a location exists before the simulation runs. */
  private resolveLocation(): WarLocation {
    if (!this.warLocation) {
      const options = this.locationChoice?.options;
      this.warLocation =
        options && options.length
          ? options[Math.floor(Math.random() * options.length)]
          : randomWarLocations(Math.random, 1)[0];
    }
    this.locationChoice = undefined;
    return this.warLocation;
  }

  /* ---------------------------------------------------------------- */
  /* Draft                                                            */
  /* ---------------------------------------------------------------- */

  startDraft(actorId: string): { ok: boolean; error?: string } {
    if (actorId !== this.hostId) return { ok: false, error: 'Only the host can start the draft.' };
    if (this.phase !== 'LOBBY') return { ok: false, error: 'The draft already started.' };
    if (this.humanCount() < LIMITS.MIN_PLAYERS) {
      return { ok: false, error: `You need at least ${LIMITS.MIN_PLAYERS} Masters.` };
    }
    this.phase = 'DRAFT';
    this.winnerId = undefined;
    this.wish = undefined;
    this.assignments = [];
    this.servants = [];
    this.unsummoned = [];
    this.research.clear();
    this.timeline = undefined;
    this.researchStarted = false;
    this.refreshDraftPool();
    for (const p of this.players.values()) {
      p.locked = false;
      if (!p.isSpectator && !this.picks.has(p.id)) this.picks.set(p.id, {});
    }
    if (this.settings.draftTimerSec > 0) {
      this.draftEndsAt = Date.now() + this.settings.draftTimerSec * 1000;
      this.draftTimer = setTimeout(() => this.onDraftTimerEnd(), this.settings.draftTimerSec * 1000);
      this.draftTimer.unref?.();
    }
    this.touch();
    return { ok: true };
  }

  /**
   * Deal (or clear) the AI-Chooses roster for this draft. Only ever runs while
   * the draft is open — a lobby always has an empty pool.
   */
  private refreshDraftPool(): void {
    this.draftPool.clear();
    if (this.phase !== 'DRAFT' || !this.settings.aiChooses) return;
    const pools = buildDraftPools(this.classes(), this.settings.aiPool);
    for (const cls of this.classes()) {
      const characters = pools[cls];
      if (characters?.length) this.draftPool.set(cls, characters.slice(0, POOL_SIZE));
    }
  }

  private onDraftTimerEnd(): void {
    if (this.phase !== 'DRAFT') return;
    this.autofillEmptySlots();
    this.beginSummonInternal();
  }

  /** Fill any empty slots with a random famous character for that class. */
  private autofillEmptySlots(): void {
    // Imported lazily to keep the module graph simple.
    const fallbacks = FALLBACKS();
    const classes = this.classes();
    for (const player of this.players.values()) {
      if (player.isSpectator) continue;
      const table = this.picks.get(player.id) ?? {};
      for (const cls of classes) {
        if (table[cls]) continue;
        const used = this.allKeys();
        // An AI-Chooses room fills from its own roster first, so auto-filled
        // Servants still respect the mode and are always class-legal.
        const pool = this.draftPool.get(cls) ?? [];
        const source = pool.length ? pool : (fallbacks[cls] ?? []);
        const options = source.filter((c) => !used.has(c.key));
        const choice = options[Math.floor(Math.random() * Math.max(1, options.length))] ?? source[0];
        if (!choice) continue;
        table[cls] = { ...choice, submittedBy: player.id };
        // Auto-filled Servants deserve real artwork too, not just initials.
        void this.fillCandidates(player.id, cls, choice);
      }
      this.picks.set(player.id, table);
    }
  }

  private allKeys(): Set<string> {
    const keys = new Set<string>();
    for (const table of this.picks.values()) {
      for (const cls of this.classes()) {
        const c = table[cls];
        if (c) keys.add(c.key);
      }
    }
    return keys;
  }

  async setPick(playerId: string, cls: ServantClass, character: Character): Promise<{ ok: boolean; error?: string }> {
    if (this.phase !== 'DRAFT') return { ok: false, error: 'The draft is not open.' };
    const player = this.players.get(playerId);
    if (!player || player.isSpectator) return { ok: false, error: 'Spectators cannot draft.' };
    if (player.locked) return { ok: false, error: 'Unlock your picks to edit them.' };
    if (!this.classes().includes(cls)) return { ok: false, error: 'That class is not part of this war.' };

    // An AI-Chooses room drafts strictly from the roster the game dealt it.
    const pool = this.draftPool.get(cls);
    if (pool && !pool.some((entry) => entry.key === character.key)) {
      return { ok: false, error: `That character is not on this room's ${CLASS_META[cls].label} roster.` };
    }

    // A free draft must fit the class: Saber is a swordsman, Archer fights at
    // range, and a character the game cannot place at all is refused rather
    // than seated in a class that makes no sense. The requested class is passed
    // in so the canon and the curated rosters can answer without a wiki lookup.
    if (!pool) {
      const refused = await politicalRefusal(character);
      if (refused) return { ok: false, error: refused };
      const verdict = await classVerdictFor(character, cls).catch(
        (): ClassVerdict => ({ classes: [], verified: false, evidence: 'none' }),
      );
      if (!verdict.verified || !verdict.classes.includes(cls)) {
        return { ok: false, error: classRefusal(character, verdict) };
      }
    }

    const duplicate = [...this.picks.entries()].find(([otherId, table]) => {
      if (otherId === playerId) return false;
      return this.classes().some((c) => table[c]?.key === character.key);
    });
    if (duplicate) {
      const other = this.players.get(duplicate[0]);
      return { ok: false, error: `Someone already picked ${character.name}. Pick another.` };
    }

    const table = this.picks.get(playerId) ?? {};
    table[cls] = { ...character, submittedBy: playerId, imageUrl: proxyUrl(character.imageUrl) || character.imageUrl };
    this.picks.set(playerId, table);
    this.touch();

    // Fill the alternate image candidates in the background.
    void this.fillCandidates(playerId, cls, character);
    return { ok: true };
  }

  private async fillCandidates(playerId: string, cls: ServantClass, character: Character): Promise<void> {
    try {
      const images = await buildImageCandidates(character);
      const table = this.picks.get(playerId);
      const current = table?.[cls];
      if (!current || current.key !== character.key) return;
      // A generated initials avatar is not a portrait: replace it with the first
      // real piece of artwork we found. A picture the player picked stays put.
      const real = images.find((image) => !isPlaceholderImage(image));
      const primary = isPlaceholderImage(current.imageUrl) && real ? real : current.imageUrl;
      const candidates = [primary, ...images.filter((i) => i !== primary)].slice(0, 6);
      const updated: Character = { ...current, imageUrl: primary, imageCandidates: candidates };
      table![cls] = updated;
      // Servants are built from these picks, so keep any copy already in play in
      // step — otherwise a slow lookup leaves the war showing an initials avatar.
      for (const servant of this.servants) {
        if (servant.playerId === playerId && servant.cls === cls && servant.character.key === character.key) {
          servant.character = { ...servant.character, imageUrl: primary, imageCandidates: candidates };
        }
      }
      this.assignments = this.assignments.map((a) =>
        a.playerId === playerId && a.cls === cls && a.character.key === character.key
          ? { ...a, character: updated }
          : a,
      );
      this.touch();
      this.broadcast();
    } catch (err) {
      logger.debug({ err }, 'image candidates failed');
    }
  }

  setImage(playerId: string, cls: ServantClass, imageUrl: string): { ok: boolean; error?: string } {
    const table = this.picks.get(playerId);
    const character = table?.[cls];
    if (!character) return { ok: false, error: 'No character in that slot.' };
    const proxied = proxyUrl(imageUrl) || imageUrl;
    table![cls] = { ...character, imageUrl: proxied };
    this.touch();
    return { ok: true };
  }

  clearPick(playerId: string, cls: ServantClass): void {
    const player = this.players.get(playerId);
    if (!player || player.locked) return;
    const table = this.picks.get(playerId);
    if (table) delete table[cls];
    this.touch();
  }

  lock(playerId: string): { ok: boolean; error?: string } {
    const player = this.players.get(playerId);
    if (!player) return { ok: false, error: 'Unknown player.' };
    const table = this.picks.get(playerId) ?? {};
    const classes = this.classes();
    const filled = classes.filter((c) => table[c]).length;
    if (filled < classes.length) {
      return { ok: false, error: `Fill all ${classes.length} slots first (${filled} done).` };
    }
    player.locked = true;
    this.touch();
    if ([...this.players.values()].filter((p) => !p.isSpectator).every((p) => p.locked)) {
      this.emitAll('toast', { kind: 'success', message: 'Every Master is ready.' });
    }
    return { ok: true };
  }

  unlock(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    if (this.phase !== 'DRAFT') return;
    player.locked = false;
    this.touch();
  }

  /* ---------------------------------------------------------------- */
  /* Summon                                                           */
  /* ---------------------------------------------------------------- */

  beginSummon(actorId: string): { ok: boolean; error?: string } {
    if (actorId !== this.hostId) return { ok: false, error: 'Only the host can begin the summoning.' };
    if (this.phase !== 'DRAFT') return { ok: false, error: 'The draft is not finished.' };
    this.autofillEmptySlots();
    return this.beginSummonInternal();
  }

  private beginSummonInternal(): { ok: boolean; error?: string } {
    if (this.draftTimer) {
      clearTimeout(this.draftTimer);
      this.draftTimer = null;
    }
    const drafters = [...this.players.values()].filter((p) => !p.isSpectator);
    if (drafters.length < 2) return { ok: false, error: 'Not enough Masters.' };

    const pickTable: PickTable = {};
    for (const p of drafters) pickTable[p.id] = this.picks.get(p.id) ?? {};

    const draw = runDraw(
      drafters.map((p) => ({ id: p.id })),
      pickTable,
      { avoidOwnPick: this.settings.avoidOwnPick, classes: this.classes() },
    );
    this.drawSeed = draw.seed;
    this.assignments = draw.assignments;
    this.unsummoned = draw.unsummoned;
    this.servants = draw.assignments.map((a) => ({
      id: nanoid(10),
      playerId: a.playerId,
      masterName: this.players.get(a.playerId)?.nickname ?? 'Master',
      cls: a.cls,
      character: a.character,
    }));
    // Re-key assignments to servant ids for the client.
    this.assignments = this.servants.map((s) => ({ playerId: s.playerId, cls: s.cls, character: s.character }));

    this.phase = 'SUMMON';
    this.touch();
    this.emitAll('summon:reveal', { assignments: this.assignments, servants: this.servants });
    this.broadcast();
    return { ok: true };
  }

  /* ---------------------------------------------------------------- */
  /* Research + Review                                                */
  /* ---------------------------------------------------------------- */

  async startResearch(actorId: string): Promise<{ ok: boolean; error?: string }> {
    if (actorId !== this.hostId) return { ok: false, error: 'Only the host can start research.' };
    if (this.phase !== 'SUMMON' && this.phase !== 'REVIEW') return { ok: false, error: 'Not ready.' };
    this.phase = 'RESEARCH';
    this.researchStarted = true;
    this.research.clear();
    for (const s of this.servants) this.research.set(s.id, { status: 'pending' });
    this.broadcast();

    const started = Date.now();
    const queue = [...this.servants];
    const worker = async () => {
      for (;;) {
        if (Date.now() - started > RESEARCH_TIMEOUT_MS) return;
        const servant = queue.shift();
        if (!servant) return;
        this.research.set(servant.id, { status: 'running' });
        this.broadcastResearch();
        try {
          const profile: Profile = await researchCharacter(servant.character);
          const capped = this.applyCap(profile);
          this.researchProfiles.set(servant.id, profile);
          servant.profile = capped;
          this.research.set(servant.id, { status: 'done', confidence: capped.confidence });
        } catch (err) {
          logger.warn({ err, key: servant.character.key }, 'research failed');
          this.research.set(servant.id, { status: 'failed', confidence: 'low' });
        }
        this.broadcastResearch();
      }
    };
    await Promise.all(Array.from({ length: RESEARCH_CONCURRENCY }, () => worker()));

    // Anything that timed out falls back to heuristics with low confidence.
    for (const s of this.servants) {
      const row = this.research.get(s.id);
      if (!row || row.status === 'running' || row.status === 'pending') {
        this.research.set(s.id, { status: 'failed', confidence: 'low' });
      }
    }
    this.phase = 'REVIEW';
    this.touch();
    this.broadcastResearch();
    this.broadcast();
    return { ok: true };
  }

  private broadcastResearch(): void {
    this.emitAll('research:progress', {
      rows: this.servants.map((s) => ({
        servantId: s.id,
        name: s.character.name,
        imageUrl: s.character.imageUrl,
        status: this.research.get(s.id)?.status ?? 'pending',
        confidence: this.research.get(s.id)?.confidence,
      })),
    });
  }

  overrideProfile(
    actorId: string,
    servantId: string,
    patch: { tierPeak?: string; speed?: string; durability?: string; abilities?: string[] },
  ): boolean {
    if (actorId !== this.hostId) return false;
    const servant = this.servants.find((s) => s.id === servantId);
    if (!servant?.profile) return false;
    const profile: Profile = { ...servant.profile };
    if (patch.tierPeak) {
      const parsed = parseTier(patch.tierPeak);
      profile.tierPeak = parsed.tierPeak;
      profile.tierBase = parsed.tierBase;
      profile.tierIndex = parsed.tierIndex;
    }
    if (patch.speed) {
      const parsed = parseSpeed(patch.speed);
      if (parsed) {
        profile.speed = parsed.label;
        profile.speedIndex = parsed.index;
      }
    }
    if (patch.durability) {
      const parsed = parseDurability(patch.durability);
      if (parsed) {
        profile.durability = parsed.label;
        profile.durabilityIndex = parsed.index;
      }
    }
    if (patch.abilities?.length) profile.abilities = patch.abilities.slice(0, 8);
    profile.baseScore = baseScore(profile);
    // A manual edit is still bound by the war's Max Power level.
    this.researchProfiles.set(servant.id, profile);
    servant.profile = this.applyCap(profile);
    this.touch();
    this.broadcast();
    return true;
  }

  /** The room's Max Power level applied to a freshly researched profile. */
  private applyCap(profile: Profile): Profile {
    return applyPowerCap(profile, this.settings.war.maxPowerLevel);
  }

  /** Re-apply the cap after the host changes it, without re-researching. */
  private reapplyPowerCap(): void {
    for (const servant of this.servants) {
      const raw = this.researchProfiles.get(servant.id);
      if (!raw || !servant.profile) continue;
      servant.profile = applyPowerCap(raw, this.settings.war.maxPowerLevel);
    }
  }

  async reresearch(actorId: string, servantId: string): Promise<boolean> {
    if (actorId !== this.hostId) return false;
    const servant = this.servants.find((s) => s.id === servantId);
    if (!servant) return false;
    this.research.set(servant.id, { status: 'running' });
    this.broadcastResearch();
    try {
      const profile = await researchCharacter(servant.character);
      const capped = this.applyCap(profile);
      this.researchProfiles.set(servant.id, profile);
      servant.profile = capped;
      this.research.set(servant.id, { status: 'done', confidence: capped.confidence });
    } catch {
      this.research.set(servant.id, { status: 'failed', confidence: 'low' });
    }
    this.touch();
    this.broadcastResearch();
    this.broadcast();
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* War                                                              */
  /* ---------------------------------------------------------------- */

  async startWar(actorId: string): Promise<{ ok: boolean; error?: string }> {
    if (actorId !== this.hostId) return { ok: false, error: 'Only the host can start the war.' };
    if (this.phase !== 'REVIEW' && this.phase !== 'SUMMON') return { ok: false, error: 'Not ready.' };
    if (this.servants.length < 2) return { ok: false, error: 'Not enough Servants.' };

    const seed = newSeed();
    const warLocation = this.resolveLocation();
    this.timeline = runSimulation({
      servants: this.servants,
      settings: this.settings,
      seed,
      unsummoned: this.unsummoned,
      warLocation,
    });
    this.cursor = {
      dayIndex: 0,
      eventIndex: 0,
      playing: this.settings.war.autoplayMs > 0,
      speedMs: this.settings.war.autoplayMs || 7000,
    };
    this.phase = 'WAR';
    this.touch();
    this.broadcast();
    this.emitCurrentEvent();
    this.scheduleWarTick();

    if (this.settings.war.narration === 'ai' && llmEnabled()) {
      void this.enhanceNarration();
    }
    return { ok: true };
  }

  /** Pre-generate AI narration for the whole war so playback never waits. */
  private async enhanceNarration(): Promise<void> {
    if (!this.timeline) return;
    const names = new Set(this.servants.map((s) => s.character.name));
    for (const day of this.timeline.days) {
      for (const event of day.events) {
        const text = event.tokens.map((t) => t.v).join('');
        const participants = event.participants
          .map((p) => this.servants.find((s) => s.id === p.servantId)?.character.name)
          .filter((n): n is string => Boolean(n));
        const out = await llmGenerate({
          system:
            'Rewrite this Fate-style Holy Grail War event in 1-2 vivid sentences, present tense. Do not change who wins, who dies, who is hurt, or who is present. Do not add characters. Keep every listed character name exactly as given. PG-13, no graphic gore. Maximum 280 characters.',
          prompt: `Characters: ${participants.join(', ')}\nLocation: ${event.location}\nEvent: ${text}`,
          maxTokens: 200,
        });
        if (!out) continue;
        const trimmed = out.trim().slice(0, 280);
        const lower = trimmed.toLowerCase();
        const keepsAll = participants.every((p) => lower.includes(p.toLowerCase()));
        const addsStranger = [...names].some(
          (n) => !participants.includes(n) && lower.includes(n.toLowerCase()),
        );
        if (!keepsAll || addsStranger) continue;
        event.narration = [{ t: 'text', v: trimmed }];
        this.broadcast();
      }
    }
  }

  private flatEvents(): { dayIndex: number; eventIndex: number }[] {
    if (!this.timeline) return [];
    const out: { dayIndex: number; eventIndex: number }[] = [];
    this.timeline.days.forEach((day, dayIndex) => {
      day.events.forEach((_, eventIndex) => out.push({ dayIndex, eventIndex }));
    });
    return out;
  }

  private cursorFlatIndex(): number {
    const flat = this.flatEvents();
    return flat.findIndex((f) => f.dayIndex === this.cursor.dayIndex && f.eventIndex === this.cursor.eventIndex);
  }

  currentEvent(): WarEvent | undefined {
    const day = this.timeline?.days[this.cursor.dayIndex];
    return day?.events[this.cursor.eventIndex];
  }

  private scheduleWarTick(): void {
    if (this.warTimer) {
      clearTimeout(this.warTimer);
      this.warTimer = null;
    }
    if (!this.cursor.playing || this.cursor.speedMs <= 0) return;
    this.warTimer = setTimeout(() => {
      const moved = this.moveCursor(1);
      if (!moved) {
        this.cursor.playing = false;
        this.broadcast();
        this.emitFinal();
        return;
      }
      this.scheduleWarTick();
    }, this.cursor.speedMs);
    this.warTimer.unref?.();
  }

  private moveCursor(delta: number): boolean {
    const flat = this.flatEvents();
    const index = this.cursorFlatIndex();
    const next = index + delta;
    if (next < 0 || next >= flat.length) return false;
    const previous = flat[index];
    this.cursor.dayIndex = flat[next].dayIndex;
    this.cursor.eventIndex = flat[next].eventIndex;
    if (previous && previous.dayIndex !== this.cursor.dayIndex) {
      const finished = this.timeline?.days[previous.dayIndex];
      if (finished) {
        this.emitAll('war:dayEnd', {
          day: finished.day,
          fallen: finished.fallen,
          remaining: finished.remaining,
          title: finished.title,
        });
      }
    }
    this.touch();
    this.emitCurrentEvent();
    return true;
  }

  private emitCurrentEvent(): void {
    const event = this.currentEvent();
    this.emitAll('war:cursor', { ...this.cursor, serverNow: Date.now() });
    if (event) this.emitAll('war:event', { event });
    const day = this.timeline?.days[this.cursor.dayIndex];
    if (day && this.cursor.eventIndex >= day.events.length - 1) {
      // Day finished; the nightfall event is the last one.
    }
    if (this.timeline && this.cursorFlatIndex() === this.flatEvents().length - 1) {
      this.emitFinal();
    }
  }

  private emitFinal(): void {
    if (!this.timeline) return;
    this.phase = 'RESULTS';
    this.winnerId = this.timeline.winnerId;
    this.wish = this.timeline.wish;
    this.touch();
    this.emitAll('war:final', {
      winnerId: this.timeline.winnerId,
      wish: this.timeline.wish,
      seed: this.timeline.seed,
      unsummoned: this.timeline.unsummoned,
    });
    this.broadcast();
  }

  warControl(actorId: string, action: 'play' | 'pause' | 'next' | 'prev' | 'speed' | 'jump', value?: number): boolean {
    if (actorId !== this.hostId) return false;
    switch (action) {
      case 'play':
        this.cursor.playing = true;
        this.scheduleWarTick();
        break;
      case 'pause':
        this.cursor.playing = false;
        if (this.warTimer) clearTimeout(this.warTimer);
        this.warTimer = null;
        break;
      case 'next': {
        const moved = this.moveCursor(1);
        if (!moved) {
          // The war is over; nothing left to play.
          this.cursor.playing = false;
          this.emitFinal();
        } else if (this.cursor.playing) {
          // A manual step restarts the interval. Without this, the pending tick
          // would still fire at its old deadline and cut the event the host had
          // just revealed short.
          this.scheduleWarTick();
        }
        break;
      }
      case 'prev':
        this.moveCursor(-1);
        if (this.cursor.playing) this.scheduleWarTick();
        break;
      case 'speed':
        this.cursor.speedMs = Math.max(0, value ?? 7000);
        if (this.cursor.playing) this.scheduleWarTick();
        break;
      case 'jump': {
        const flat = this.flatEvents();
        const index = Math.max(0, Math.min(flat.length - 1, Math.floor(value ?? 0)));
        if (flat[index]) {
          this.cursor.dayIndex = flat[index].dayIndex;
          this.cursor.eventIndex = flat[index].eventIndex;
          this.emitCurrentEvent();
          if (this.cursor.playing) this.scheduleWarTick();
        }
        break;
      }
    }
    this.touch();
    this.emitAll('war:cursor', { ...this.cursor, serverNow: Date.now() });
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Arena                                                            */
  /* ---------------------------------------------------------------- */

  startArena(actorId: string): { ok: boolean; error?: string } {
    if (actorId !== this.hostId) return { ok: false, error: 'Only the host can start the arena.' };
    if (this.servants.length < 2) return { ok: false, error: 'Not enough Servants.' };
    const seed = newSeed();
    this.arena.bracket = buildBracket(this.servants.map((s) => s.id), seed);
    this.arena.phase = 'INTRO';
    this.arena.championId = undefined;
    this.phase = 'ARENA';
    this.touch();
    this.beginNextArenaMatch();
    return { ok: true };
  }

  private arenaTotalRounds(): number {
    return totalRoundsFor(this.arena.bracket);
  }

  private beginNextArenaMatch(): void {
    const total = this.arenaTotalRounds();
    const champion = isChampion(this.arena.bracket, total);
    if (champion && this.arena.bracket.every((m) => m.winner || m.bye)) {
      this.arena.phase = 'CHAMPION';
      this.arena.championId = champion;
      this.phase = 'RESULTS';
      this.touch();
      this.emitAll('arena:champion', { championId: champion });
      this.broadcast();
      return;
    }
    const match = nextPlayableMatch(this.arena.bracket, total);
    if (!match) {
      // Everything decided: resolve the champion from the final.
      const final = this.arena.bracket.find((m) => m.round === total);
      if (final?.winner) {
        this.arena.phase = 'CHAMPION';
        this.arena.championId = final.winner;
        this.phase = 'RESULTS';
        this.touch();
        this.emitAll('arena:champion', { championId: final.winner });
        this.broadcast();
      }
      return;
    }
    this.arena.currentMatchId = match.id;
    this.arena.phase = 'INTRO';
    match.voters = [];
    match.votesA = 0;
    match.votesB = 0;
    match.tieBroken = undefined;
    this.touch();
    this.emitAll('arena:matchStart', {
      match,
      round: match.round,
      roundName: roundName(match.round, total),
    });
    this.arenaSetPhase('INTRO', 4000);
  }

  private arenaSetPhase(phase: ArenaPhase, durationMs: number): void {
    if (this.arenaTimer) {
      clearTimeout(this.arenaTimer);
      this.arenaTimer = null;
    }
    this.arena.phase = phase;
    this.arena.endsAt = durationMs > 0 ? Date.now() + durationMs : undefined;
    this.emitAll('arena:phase', {
      phase,
      endsAt: this.arena.endsAt,
      serverNow: Date.now(),
      matchId: this.arena.currentMatchId,
      round: this.arena.bracket.find((m) => m.id === this.arena.currentMatchId)?.round ?? 1,
    });
    if (durationMs > 0) {
      this.arenaTimer = setTimeout(() => this.arenaAdvancePhase(), durationMs);
      this.arenaTimer.unref?.();
    }
  }

  private arenaAdvancePhase(): void {
    switch (this.arena.phase) {
      case 'INTRO':
        this.arenaSetPhase('ARGUE', this.settings.debate.argueSec * 1000);
        break;
      case 'ARGUE':
        this.arenaSetPhase('VOTE', this.settings.debate.voteSec * 1000);
        break;
      case 'VOTE':
        this.resolveArenaVote();
        break;
      case 'REVEAL':
        this.beginNextArenaMatch();
        break;
      default:
        break;
    }
  }

  arenaSkip(actorId: string): boolean {
    if (actorId !== this.hostId) return false;
    this.arenaAdvancePhase();
    return true;
  }

  private eligibleVoters(): Player[] {
    return [...this.players.values()].filter((p) => {
      if (p.isSpectator) return false;
      return true;
    });
  }

  arenaVote(playerId: string, choice: 'a' | 'b'): { ok: boolean; error?: string } {
    if (this.arena.phase !== 'VOTE') return { ok: false, error: 'Voting is closed.' };
    const match = matchById(this.arena.bracket, this.arena.currentMatchId);
    if (!match?.a || !match?.b) return { ok: false, error: 'No active match.' };
    const player = this.players.get(playerId);
    if (!player) return { ok: false, error: 'Unknown player.' };
    if (player.isSpectator) return { ok: false, error: 'Spectators cannot vote here.' };

    const owners = [match.a, match.b].map((id) => this.servants.find((s) => s.id === id)?.playerId);
    if (!this.settings.debate.ownersVote && owners.includes(playerId)) {
      return { ok: false, error: 'You are in this match and cannot vote in it.' };
    }

    match.voters = match.voters.filter((v) => v.voterId !== playerId);
    match.voters.push({ voterId: playerId, nickname: player.nickname, choice });
    const counts = countVotes(this.arena.bracket, match.id);
    match.votesA = counts.a;
    match.votesB = counts.b;
    this.touch();
    this.emitAll('arena:votes', {
      matchId: match.id,
      votedCount: match.voters.length,
      eligibleCount: this.eligibleVoters().length,
    });

    if (match.voters.length >= this.eligibleVoters().length) {
      this.resolveArenaVote();
    }
    return { ok: true };
  }

  private resolveArenaVote(): void {
    const match = matchById(this.arena.bracket, this.arena.currentMatchId);
    if (!match?.a || !match?.b) {
      this.beginNextArenaMatch();
      return;
    }
    const counts = countVotes(this.arena.bracket, match.id);
    match.votesA = counts.a;
    match.votesB = counts.b;

    if (counts.a === counts.b) {
      switch (this.settings.debate.tieBreak) {
        case 'random': {
          const rng = seedrandom(`${this.code}:${match.id}`);
          const winner = rng() < 0.5 ? match.a : match.b;
          match.winner = winner;
          match.tieBroken = 'random';
          break;
        }
        case 'oracle': {
          const a = this.servants.find((s) => s.id === match.a)?.profile?.baseScore ?? 0;
          const b = this.servants.find((s) => s.id === match.b)?.profile?.baseScore ?? 0;
          match.winner = a === b ? match.a : a > b ? match.a : match.b;
          match.tieBroken = 'oracle';
          break;
        }
        default: {
          // Host decides — fall through to a wait state if we do not have one.
          match.tieBroken = 'host';
          match.winner = undefined;
          this.emitAll('arena:votes', {
            matchId: match.id,
            votedCount: match.voters.length,
            eligibleCount: this.eligibleVoters().length,
            tie: true,
          });
          this.arena.phase = 'REVEAL';
          this.arena.endsAt = undefined;
          this.emitAll('arena:phase', {
            phase: 'REVEAL',
            endsAt: undefined,
            serverNow: Date.now(),
            matchId: match.id,
            tie: true,
          });
          return;
        }
      }
    } else {
      match.winner = counts.a > counts.b ? match.a : match.b;
    }

    setMatchWinner(this.arena.bracket, match.id, match.winner, this.arenaTotalRounds());
    this.touch();
    this.emitAll('arena:result', { match, counts });
    this.arenaSetPhase('REVEAL', 6000);
  }

  arenaTiebreak(actorId: string, winnerServantId: string): boolean {
    if (actorId !== this.hostId) return false;
    const match = matchById(this.arena.bracket, this.arena.currentMatchId);
    if (!match || match.winner) return false;
    if (winnerServantId !== match.a && winnerServantId !== match.b) return false;
    match.winner = winnerServantId;
    match.tieBroken = 'host';
    setMatchWinner(this.arena.bracket, match.id, winnerServantId, this.arenaTotalRounds());
    this.touch();
    this.emitAll('arena:result', { match, counts: countVotes(this.arena.bracket, match.id) });
    this.arenaSetPhase('REVEAL', 6000);
    return true;
  }

  /** Broadcast a chat message to everyone in the room. */
  emitChat(message: ChatMessage): void {
    this.emitAll('arena:chat', message);
  }

  addChat(playerId: string, text: string): ChatMessage | null {
    const player = this.players.get(playerId);
    if (!player) return null;
    const clean = sanitizeText(text, LIMITS.CHAT_MAX);
    if (!clean) return null;
    const servant = this.servants.find((s) => s.playerId === playerId);
    const message: ChatMessage = {
      id: nanoid(8),
      playerId,
      nickname: player.nickname,
      text: clean,
      at: Date.now(),
      badge: servant ? { label: `Master of ${servant.character.name}`, cls: servant.cls } : undefined,
    };
    this.chat.push(message);
    if (this.chat.length > 300) this.chat.shift();
    return message;
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                        */
  /* ---------------------------------------------------------------- */

  rematch(actorId: string): boolean {
    if (actorId !== this.hostId) return false;
    this.round += 1;
    this.phase = 'DRAFT';
    this.assignments = [];
    this.servants = [];
    this.unsummoned = [];
    this.research.clear();
    this.timeline = undefined;
    this.winnerId = undefined;
    this.wish = undefined;
    this.researchStarted = false;
    this.arena = { bracket: [], phase: 'IDLE' };
    this.chat = [];
    for (const p of this.players.values()) p.locked = false;
    this.touch();
    return true;
  }

  toLobby(actorId: string): boolean {
    if (actorId !== this.hostId) return false;
    this.phase = 'LOBBY';
    this.round = 1;
    this.assignments = [];
    this.servants = [];
    this.unsummoned = [];
    this.research.clear();
    this.timeline = undefined;
    this.winnerId = undefined;
    this.wish = undefined;
    this.arena = { bracket: [], phase: 'IDLE' };
    this.chat = [];
    this.researchStarted = false;
    this.draftPool.clear();
    for (const p of this.players.values()) {
      p.locked = false;
      this.picks.set(p.id, {});
    }
    if (this.warTimer) clearTimeout(this.warTimer);
    if (this.arenaTimer) clearTimeout(this.arenaTimer);
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.warLocation = undefined;
    this.locationChoice = undefined;
    this.syncLocation();
    this.touch();
    return true;
  }

  private touch(): void {
    this.lastActive = Date.now();
  }

  /** Send a fresh snapshot to a single player (join / reconnect / phase change). */
  sendState(playerId: string): void {
    this.emitOne(playerId, 'room:state', this.sanitize(playerId));
  }

  broadcast(): void {
    for (const id of this.players.keys()) this.sendState(id);
  }

  /** Public snapshot. Never leaks other players' picks during the draft. */
  sanitize(viewerId: string): RoomState {
    const mine = this.picks.get(viewerId) ?? {};
    const state: RoomState = {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      settings: this.settings,
      players: [...this.players.values()],
      spectators: this.spectatorCount(),
      createdAt: this.createdAt,
      serverNow: Date.now(),
      lockedPlayerIds: [...this.players.values()].filter((p) => p.locked).map((p) => p.id),
      round: this.round,
      // Chat lives on the server so a rematch (or a page reload) can never
      // resurrect the last game's conversation.
      chat: this.chat,
    };
    state.myPicks = mine;
    state.draftEndsAt = this.draftEndsAt;
    if (this.phase === 'DRAFT' && this.draftPool.size) {
      const pool: Partial<Record<ServantClass, Character[]>> = {};
      for (const [cls, characters] of this.draftPool) pool[cls] = characters;
      state.draftPool = pool;
    }
    state.warLocation = this.warLocation;
    if (this.phase === 'LOBBY') state.locationChoice = this.locationChoice;

    if (this.phase !== 'LOBBY' && this.phase !== 'DRAFT') {
      state.assignments = this.assignments;
      state.servants = this.servants;
    }
    if (this.phase === 'RESEARCH' || this.phase === 'REVIEW') {
      state.research = this.servants.map((s) => ({
        servantId: s.id,
        name: s.character.name,
        imageUrl: s.character.imageUrl,
        status: this.research.get(s.id)?.status ?? 'pending',
        confidence: this.research.get(s.id)?.confidence,
      }));
    }
    if (this.phase === 'WAR' || this.phase === 'RESULTS') {
      state.cursor = { ...this.cursor };
      state.winnerId = this.winnerId;
      state.wish = this.wish;
      state.unsummoned = this.unsummoned;
      state.drawSeed = this.drawSeed;
      if (this.timeline) {
        // Only ever expose events up to the cursor.
        const upto = this.flatEvents().slice(0, this.cursorFlatIndex() + 1);
        const last = upto[upto.length - 1];
        const days = this.timeline.days
          .map((day, dayIndex) => ({
            ...day,
            events: day.events.filter((_, eventIndex) => {
              if (!last) return false;
              return dayIndex < last.dayIndex || (dayIndex === last.dayIndex && eventIndex <= last.eventIndex);
            }),
          }))
          .filter((d) => d.events.length > 0);
        state.timeline = {
          ...this.timeline,
          days,
          daySummaries: days.map((d) => ({
            day: d.day,
            title: d.title,
            fallen: d.fallen,
            remaining: d.remaining,
          })),
        };
      }
    }
    if (this.phase === 'ARENA' || this.phase === 'RESULTS') {
      state.arena = {
        phase: this.arena.phase,
        currentMatchId: this.arena.currentMatchId,
        round: this.arena.bracket.find((m) => m.id === this.arena.currentMatchId)?.round ?? 1,
        endsAt: this.arena.endsAt,
        serverNow: Date.now(),
        bracket: this.arena.bracket,
        championId: this.arena.championId,
      };
    }
    return state;
  }

  isIdle(): boolean {
    return Date.now() - this.lastActive > LIMITS.ROOM_IDLE_TTL_MS;
  }
}

/* Fallback characters, loaded once and mapped to full Character objects. */
let fallbackCache: Record<ServantClass, Character[]> | null = null;
function FALLBACKS(): Record<ServantClass, Character[]> {
  if (fallbackCache) return fallbackCache;
  const raw = fallbackCharacters as Record<ServantClass, { name: string; source: string }[]>;
  const out = {} as Record<ServantClass, Character[]>;
  for (const cls of CLASSES) {
    out[cls] = (raw[cls] ?? []).map((entry) => ({
      key: `fallback:${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '-')}`,
      name: entry.name,
      source: entry.source,
      provider: 'fallback' as const,
      imageUrl: generatedAvatar(entry.name),
      submittedBy: 'system',
    }));
  }
  fallbackCache = out;
  return out;
}
