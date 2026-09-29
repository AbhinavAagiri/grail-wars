/**
 * All shared interfaces and socket event names. Single source of truth for the
 * wire protocol between server and client.
 */
import type { ServantClass } from './constants';

export type { ServantClass };

export type Phase =
  | 'LOBBY'
  | 'DRAFT'
  | 'SUMMON'
  | 'RESEARCH'
  | 'REVIEW'
  | 'WAR'
  | 'ARENA'
  | 'RESULTS';

export type Mode = 'WAR' | 'DEBATE';

export type Provider = 'anilist' | 'vsb' | 'wikipedia' | 'fandom' | 'tmdb' | 'custom' | 'fallback';

/** How the war's narration is written. */
export type NarrationStyle = 'templated' | 'ai' | 'hunger_games' | 'fate';

/** Who picks the real-world setting of the war. */
export type LocationMode = 'players' | 'ai';

/** A real-world city the Holy Grail War can take place in. */
export interface WarLocation {
  id: string;
  name: string;
  country: string;
  /** coarse terrain class used to flavour the narration */
  kind: string;
}

export interface Character {
  /** canonical unique key: normalize(provider:providerId) or normalize(name|source) */
  key: string;
  name: string;
  /** franchise / work / "History" */
  source: string;
  provider: Provider;
  providerId?: string;
  /** ALWAYS served by our own server (/api/image-proxy or /media/:id) or a data URI */
  imageUrl: string;
  imageCandidates?: string[];
  /** owning player id, or 'system' for custom/fallback characters */
  submittedBy: string;
  /** true when the player typed a character the search could not find */
  custom?: boolean;
  blurb?: string;
}

export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
  connected: boolean;
  colorIndex: number;
  locked: boolean;
  isSpectator: boolean;
  joinedAt: number;
}

export interface RoomSettings {
  mode: Mode;
  maxPlayers: number;
  extendedWar: boolean;
  /** 0 = off */
  draftTimerSec: number;
  avoidOwnPick: boolean;
  allowSpectators: boolean;
  /** servant classes taking part in the draft and war (defaults to the seven standard classes) */
  classes: ServantClass[];
  war: {
    days: number;
    minEventsPerDay: number;
    maxEventsPerDay: number;
    narration: NarrationStyle;
    locationMode: LocationMode;
    /** 0 = manual */
    autoplayMs: number;
    classAdvantage: boolean;
    commandSpellRescues: boolean;
    goreLevel: 'standard' | 'mild';
  };
  debate: {
    argueSec: number;
    voteSec: number;
    tieBreak: 'host' | 'random' | 'oracle';
    ownersVote: boolean;
    showOracleCards: boolean;
  };
}

/** Deep-partial settings patch, as sent by the host's settings panel. */
export interface SettingsPatch extends Omit<Partial<RoomSettings>, 'war' | 'debate'> {
  war?: Partial<RoomSettings['war']>;
  debate?: Partial<RoomSettings['debate']>;
}

export type PersonalityTag =
  | 'honorable'
  | 'ruthless'
  | 'treacherous'
  | 'prideful'
  | 'cowardly'
  | 'merciful'
  | 'cunning'
  | 'reckless'
  | 'loyal'
  | 'sadistic'
  | 'stoic'
  | 'comedic';

export const PERSONALITY_TAGS: PersonalityTag[] = [
  'honorable',
  'ruthless',
  'treacherous',
  'prideful',
  'cowardly',
  'merciful',
  'cunning',
  'reckless',
  'loyal',
  'sadistic',
  'stoic',
  'comedic',
];

export interface Profile {
  key: string;
  name: string;
  source: string;
  tierPeak: string;
  tierBase: string;
  /** index into TIERS (may be fractional for Low/High) */
  tierIndex: number;
  speed: string;
  speedIndex: number;
  durability: string;
  durabilityIndex: number;
  range: string;
  rangeIndex: number;
  intelligence: string;
  /** 0..100 */
  intelligenceIndex: number;
  abilities: string[];
  keyAbilityName: string;
  weaknesses: string[];
  archetype: string;
  tags: PersonalityTag[];
  alignment: 'good' | 'neutral' | 'evil';
  /** 0..100 */
  haxScore: number;
  confidence: 'high' | 'medium' | 'low';
  sources: { label: string; url: string }[];
  /** 0..100 */
  baseScore: number;
}

export interface Servant {
  id: string;
  playerId: string;
  masterName: string;
  cls: ServantClass;
  character: Character;
  profile?: Profile;
}

export interface WorldServantState {
  alive: boolean;
  /** 0..3 */
  injuries: 0 | 1 | 2 | 3;
  /** 0..100 */
  mana: number;
  /** -2..+2 */
  morale: number;
  kills: number;
  commandSpellsLeft: number;
  masterAlive: boolean;
  diedOnDay?: number;
  killedBy?: string;
  buffNextFight: number;
  scoutedTargets: string[];
  allies: string[];
  grudges: string[];
  /** used once per Servant per war */
  rescueUsed?: boolean;
  masterless?: boolean;
  fadeIn?: number;
}

export type Token =
  | { t: 'text'; v: string }
  | { t: 'name'; servantId: string; v: string }
  | { t: 'np'; v: string };

export type EventPhaseName = 'morning' | 'afternoon' | 'evening' | 'night';
export type ParticipantRole = 'actor' | 'target' | 'ally' | 'witness';
export type EventBanner = 'death' | 'alliance' | 'betrayal' | 'global' | 'finale';
export type Margin = 'stomp' | 'clear' | 'narrow' | 'razor';

export interface Explain {
  a: string;
  b: string;
  ea: number;
  eb: number;
  modifiers: { label: string; value: number }[];
  result: string;
}

export interface WarEvent {
  id: string;
  day: number;
  index: number;
  phase: EventPhaseName;
  category: string;
  templateId: string;
  location: string;
  participants: { servantId: string; role: ParticipantRole }[];
  tokens: Token[];
  narration?: Token[];
  deaths: string[];
  injured: string[];
  banner?: EventBanner;
  explain?: Explain;
}

export interface WarDay {
  day: number;
  title: string;
  events: WarEvent[];
  fallen: string[];
  remaining: string[];
}

export interface WarTimeline {
  seed: number;
  days: WarDay[];
  /** per-day summary used for the nightfall recap */
  daySummaries: { day: number; title: string; fallen: string[]; remaining: string[] }[];
  winnerId: string;
  wish: string;
  servants: Servant[];
  /** picks that never got summoned */
  unsummoned: Character[];
}

export interface Assignment {
  playerId: string;
  cls: ServantClass;
  character: Character;
}

/* ------------------------------------------------------------------ */
/* Arena (Debate mode)                                                 */
/* ------------------------------------------------------------------ */

export interface ArenaMatch {
  id: string;
  round: number;
  slot: number;
  a?: string;
  b?: string;
  /** servant id, or 'bye' */
  winner?: string;
  bye?: string;
  votesA: number;
  votesB: number;
  voters: { voterId: string; nickname: string; choice: 'a' | 'b' }[];
  oracleAgrees?: string;
  tieBroken?: 'host' | 'random' | 'oracle';
}

export type ArenaPhase = 'INTRO' | 'ARGUE' | 'VOTE' | 'REVEAL' | 'CHAMPION' | 'IDLE';

export interface ArenaState {
  phase: ArenaPhase;
  currentMatchId?: string;
  round: number;
  endsAt?: number;
  serverNow: number;
  bracket: ArenaMatch[];
  championId?: string;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  text: string;
  at: number;
  badge?: { label: string; cls: ServantClass };
}

/* ------------------------------------------------------------------ */
/* Room snapshot sent to clients                                       */
/* ------------------------------------------------------------------ */

export interface ResearchProgressRow {
  servantId: string;
  name: string;
  imageUrl: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  confidence?: 'high' | 'medium' | 'low';
}

export interface WarCursor {
  dayIndex: number;
  eventIndex: number;
  playing: boolean;
  speedMs: number;
}

/** Sanitized room snapshot. Never contains other players' draft picks during DRAFT. */
export interface RoomState {
  code: string;
  phase: Phase;
  hostId: string;
  settings: RoomSettings;
  players: Player[];
  spectators: number;
  createdAt: number;
  serverNow: number;
  /** your own picks by class (only for you) */
  myPicks?: Partial<Record<ServantClass, Character>>;
  /** who has locked, without revealing their picks */
  lockedPlayerIds: string[];
  draftEndsAt?: number;
  assignments?: Assignment[];
  servants?: Servant[];
  research?: ResearchProgressRow[];
  cursor?: WarCursor;
  /** events up to and including the cursor — never the future */
  timeline?: WarTimeline;
  arena?: ArenaState;
  winnerId?: string;
  wish?: string;
  unsummoned?: Character[];
  drawSeed?: number;
  /** the city the war is fought in, once resolved */
  warLocation?: WarLocation;
  /** pending "let a player choose" state, shown in the lobby */
  locationChoice?: { chooserId: string; options: WarLocation[] };
  /** set when the game is a rematch of an earlier one */
  round?: number;
}

export interface SearchCandidate {
  key: string;
  name: string;
  source: string;
  provider: Provider;
  providerId?: string;
  thumb: string;
  blurb?: string;
  /**
   * Other names the character is known by at the provider (AniList files
   * "Kirito" under "Kazuto Kirigaya"). Used to rank a search for the alias.
   */
  aliases?: string[];
}

/* ------------------------------------------------------------------ */
/* Socket events                                                       */
/* ------------------------------------------------------------------ */

export const C2S = {
  roomCreate: 'room:create',
  roomJoin: 'room:join',
  roomLeave: 'room:leave',
  roomReconnect: 'room:reconnect',
  settingsUpdate: 'settings:update',
  locationPick: 'location:pick',
  locationReroll: 'location:reroll',
  playerKick: 'player:kick',
  hostTransfer: 'host:transfer',
  draftStart: 'draft:start',
  draftPick: 'draft:pick',
  draftSetImage: 'draft:setImage',
  draftClear: 'draft:clear',
  draftLock: 'draft:lock',
  draftUnlock: 'draft:unlock',
  summonBegin: 'summon:begin',
  researchStart: 'research:start',
  reviewOverride: 'review:override',
  reviewReresearch: 'review:reresearch',
  warStart: 'war:start',
  warControl: 'war:control',
  arenaStart: 'arena:start',
  arenaChat: 'arena:chat',
  arenaVote: 'arena:vote',
  arenaSkip: 'arena:skip',
  arenaTiebreak: 'arena:tiebreak',
  gameRematch: 'game:rematch',
  gameToLobby: 'game:toLobby',
} as const;

export const S2C = {
  roomState: 'room:state',
  roomPatch: 'room:patch',
  draftProgress: 'draft:progress',
  summonReveal: 'summon:reveal',
  researchProgress: 'research:progress',
  reviewData: 'review:data',
  warCursor: 'war:cursor',
  warEvent: 'war:event',
  warDayEnd: 'war:dayEnd',
  warFinal: 'war:final',
  arenaMatchStart: 'arena:matchStart',
  arenaChat: 'arena:chat',
  arenaPhase: 'arena:phase',
  arenaVotes: 'arena:votes',
  arenaResult: 'arena:result',
  arenaChampion: 'arena:champion',
  toast: 'toast',
  error: 'error',
} as const;

export interface Toast {
  kind: 'info' | 'success' | 'warn' | 'error';
  message: string;
}
