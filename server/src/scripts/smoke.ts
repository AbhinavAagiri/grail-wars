/**
 * End-to-end smoke test and load test, driven through the real Socket.IO API.
 *
 * It exercises the whole game loop — create/join, settings, draft, lock, summon,
 * research, and either the full War playback or the Debate bracket — and asserts
 * the invariants the spec promises (unique room code, no own pick, distinct
 * classes, exactly one survivor, no unresolved text tokens).
 *
 * Start a server first, then:
 *
 *   npm run smoke                                  # 5 Masters, War, 5 days
 *   npm run smoke -- --players 7 --days 3
 *   npm run smoke -- --mode DEBATE --players 4
 *   npm run smoke -- --rooms 30                    # load test: 30 rooms x 7
 *
 * The server URL comes from BASE_URL (default http://127.0.0.1:3000).
 */
import { io, type Socket } from 'socket.io-client';
import {
  CLASSES,
  C2S,
  S2C,
  type ArenaPhase,
  type RoomState,
  type SearchCandidate,
  type Servant,
  type ServantClass,
  type Token,
  type WarEvent,
} from '@hgd/shared';
import fallbackCharacters from '../data/fallback-characters.json';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const LOOP_MS = 40;

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function until(label: string, predicate: () => boolean, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return;
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${label}`);
    await sleep(LOOP_MS);
  }
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : 'true';
}

/** Flatten rendered tokens back into a plain sentence. */
function flat(tokens: Token[]): string {
  return tokens.map((t) => t.v).join('');
}

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

/* ------------------------------------------------------------------ */
/* A virtual player                                                    */
/* ------------------------------------------------------------------ */

interface JoinedPayload {
  code: string;
  playerId: string;
  sessionToken: string;
}

class Client {
  readonly socket: Socket;
  playerId = '';
  state: RoomState | null = null;
  events: WarEvent[] = [];
  errors: string[] = [];
  final: { winnerId: string; wish: string } | null = null;
  arenaPhase: ArenaPhase | null = null;
  /** ballots the server says are in for the current match */
  votedCount = 0;
  eligibleCount = 0;
  championId?: string;

  constructor(readonly nickname: string) {
    this.socket = io(BASE, { transports: ['websocket'], forceNew: true, reconnection: false });
    this.socket.on('room:joined', (payload: JoinedPayload) => {
      this.playerId = payload.playerId;
    });
    this.socket.on(S2C.roomState, (state: RoomState) => {
      this.state = state;
    });
    this.socket.on(S2C.warEvent, (payload: { event: WarEvent }) => {
      if (payload?.event) this.events.push(payload.event);
    });
    this.socket.on(S2C.warFinal, (payload: { winnerId: string; wish: string }) => {
      this.final = payload;
    });
    this.socket.on(S2C.arenaPhase, (payload: { phase: ArenaPhase }) => {
      this.arenaPhase = payload.phase;
    });
    // The ballot count resets with every match, so a stale high-water mark can
    // never make the run look like everyone voted when they did not.
    this.socket.on(S2C.arenaMatchStart, () => {
      this.votedCount = 0;
    });
    this.socket.on(S2C.arenaVotes, (payload: { votedCount: number; eligibleCount: number }) => {
      this.votedCount = payload.votedCount;
      this.eligibleCount = payload.eligibleCount;
    });
    this.socket.on(S2C.arenaChampion, (payload: { championId: string }) => {
      this.championId = payload.championId;
    });
    this.socket.on('error', (payload: { message?: string }) => {
      this.errors.push(payload?.message ?? 'unknown error');
    });
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.nickname}: connect timed out`)), 10_000);
      this.socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.once('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  emit(event: string, payload: unknown = {}): void {
    this.socket.emit(event, payload);
  }

  /** All Masters in this client's view, i.e. players who are not spectators. */
  get masters() {
    return (this.state?.players ?? []).filter((p) => !p.isSpectator);
  }

  close(): void {
    this.socket.close();
  }
}

/* ------------------------------------------------------------------ */
/* Shared game setup                                                   */
/* ------------------------------------------------------------------ */

interface Setup {
  code: string;
  clients: Client[];
  host: Client;
  servants: Servant[];
}

async function setUpGame(playerCount: number, mode: 'WAR' | 'DEBATE', days: number): Promise<Setup> {
  const clients = Array.from({ length: playerCount }, (_, i) => new Client(`Tester${i + 1}`));
  /* ------------------------------------------------------------------ */
  /* 1. Connect and fill a room                                          */
  /* ------------------------------------------------------------------ */
  await Promise.all(clients.map((c) => c.connect()));
  log(`✓ ${playerCount} sockets connected to ${BASE}`);

  const host = clients[0]!;
  host.emit(C2S.roomCreate, { nickname: host.nickname });
  await until('the host to receive a room snapshot', () => Boolean(host.state), 15_000);

  const code = host.state!.code;
  assert(
    /^[A-HJ-NP-Z]{4}$/.test(code),
    `room code "${code}" must be 4 letters from the no-I/no-O alphabet`,
  );
  log(`✓ room ${code} created`);

  await until('the host to be assigned an identity', () => Boolean(host.playerId));
  assert(host.state!.hostId === host.playerId, 'the creator should be the host');

  for (const client of clients.slice(1)) {
    client.emit(C2S.roomJoin, { code, nickname: client.nickname });
  }
  const joiners = clients.slice(1);
  await Promise.all(joiners.map((c) => until(`${c.nickname} to join`, () => Boolean(c.playerId))));
  await until(
    'every member to see the full player list',
    () => clients.every((c) => c.masters.length === playerCount),
    15_000,
  );
  log(`✓ ${playerCount} Masters visible in every client's player list`);

  /* ------------------------------------------------------------------ */
  /* 2. Settings                                                         */
  /* ------------------------------------------------------------------ */
  host.emit(C2S.settingsUpdate, {
    patch: {
      mode,
      avoidOwnPick: true,
      allowSpectators: true,
      // Exercise every class, including the optional Shielder / Ruler / Avenger.
      classes: [...CLASSES],
      war: {
        days,
        minEventsPerDay: 5,
        maxEventsPerDay: 7,
        narration: 'templated',
        locationMode: 'ai',
        // Fast playback so the smoke test does not sit through 7s per event.
        autoplayMs: 150,
        classAdvantage: true,
        commandSpellRescues: true,
        goreLevel: 'standard',
      },
      debate: {
        argueSec: 10,
        voteSec: 5,
        tieBreak: 'random',
        showOracleCards: false,
      },
    },
  });
  await until('the host settings to apply', () => host.state?.settings.war.days === days, 10_000);
  log(`✓ settings applied (mode ${mode}, ${days} days)`);

  /* ------------------------------------------------------------------ */
  /* 3. Draft                                                            */
  /* ------------------------------------------------------------------ */
  host.emit(C2S.draftStart);
  await until('the DRAFT phase', () => host.state?.phase === 'DRAFT', 10_000);

  // The draft only accepts characters whose fighting style fits the class, so the
  // smoke test drafts from the game's own curated class lists. Keys are unique
  // per player (the server would otherwise reject the second identical pick).
  const fallbacks = fallbackCharacters as unknown as Record<
    ServantClass,
    { name: string; source: string }[]
  >;
  const candidateFor = (cls: ServantClass, index: number): SearchCandidate => {
    const list = fallbacks[cls] ?? [];
    const entry = list[index % Math.max(1, list.length)]!;
    return { key: `smoke:${cls}:${index}`, name: entry.name, source: entry.source, provider: 'fallback', thumb: '' };
  };

  for (const [index, client] of clients.entries()) {
    for (const cls of CLASSES) {
      client.emit(C2S.draftPick, { cls, candidate: candidateFor(cls, index) });
    }
  }
  await until(
    `every player to have ${CLASSES.length} picks`,
    () => clients.every((c) => Object.keys(c.state?.myPicks ?? {}).length === CLASSES.length),
    20_000,
  );
  log(`✓ every Master filled all ${CLASSES.length} class slots`);

  // The uniqueness rule: one canonical character may only exist once per room.
  const poacher = clients[clients.length - 1]!;
  poacher.emit(C2S.draftPick, { cls: 'saber', candidate: candidateFor('saber', 0) });
  await until(
    'the duplicate pick to be rejected',
    () => poacher.errors.some((message) => /already/i.test(message)),
    10_000,
  );
  log('✓ duplicate character across Masters was rejected');

  // The two rules the reported bugs were about: a hand-curated class the
  // scraped rosters had mis-filed (Kirito was a Shielder there), and the ban on
  // real-world political figures. Both settle without a wiki lookup.
  const arbiter = clients[0]!;
  arbiter.emit(C2S.draftPick, { cls: 'ruler', customName: 'JD Vance' });
  await until(
    'the political figure to be refused',
    () => arbiter.errors.some((message) => /political figure/i.test(message)),
    10_000,
  );
  log('✓ a real-world political figure was refused');

  arbiter.emit(C2S.draftPick, { cls: 'saber', customName: 'Kirito' });
  await until('the canon Saber to be accepted', () => Boolean(arbiter.state?.myPicks?.saber), 10_000);
  arbiter.emit(C2S.draftPick, { cls: 'shielder', customName: 'Kirito' });
  await until(
    'the canon Saber to be refused as Shielder',
    () => arbiter.errors.some((message) => /Kirito can only be drafted as Saber/i.test(message)),
    10_000,
  );
  log('✓ the class canon settles Kirito as Saber and refuses him as Shielder');

  for (const client of clients) client.emit(C2S.draftLock);
  await until(
    'every Master to lock in',
    () => clients.every((c) => c.masters.every((p) => p.locked)),
    15_000,
  );
  log('✓ every Master locked in');

  /* ------------------------------------------------------------------ */
  /* 4. Summon                                                           */
  /* ------------------------------------------------------------------ */
  host.emit(C2S.summonBegin);
  await until('the SUMMON phase', () => host.state?.phase === 'SUMMON', 15_000);
  await until(
    'every client to receive the assignments',
    () => clients.every((c) => (c.state?.servants?.length ?? 0) === playerCount),
    20_000,
  );

  const servants = host.state!.servants!;
  assert(
    new Set(servants.map((s) => s.cls)).size === playerCount,
    `with ${playerCount} Masters every class must be distinct, got ${servants.map((s) => s.cls).join(',')}`,
  );
  assert(
    new Set(servants.map((s) => s.character.key)).size === playerCount,
    'every summoned character must be unique',
  );
  for (const servant of servants) {
    assert(
      servant.character.submittedBy !== servant.playerId,
      `${servant.masterName} was given their own pick (${servant.character.name})`,
    );
  }
  log(`✓ summoning: ${servants.map((s) => `${s.cls}→${s.character.name}`).join(', ')}`);
  return { code, clients, host, servants };
}

/* ------------------------------------------------------------------ */
/* War                                                                 */
/* ------------------------------------------------------------------ */

async function runWar(playerCount: number, days: number): Promise<void> {
  const { clients, host, servants } = await setUpGame(playerCount, 'WAR', days);

  host.emit(C2S.researchStart);
  log('… researching (this hits live wikis, allow up to 60s)');
  await until('the RESEARCH phase', () => host.state?.phase === 'RESEARCH', 15_000);
  await until('the POWER REVIEW phase', () => host.state?.phase === 'REVIEW', 120_000);
  const reviewed = host.state!.servants ?? [];
  const scored = reviewed.filter((s) => s.profile);
  assert(scored.length === playerCount, `every Servant needs a profile, got ${scored.length}`);
  log(`✓ research complete — ${scored.map((s) => `${s.character.name}: ${s.profile!.tierPeak} (${s.profile!.confidence}, ${s.profile!.baseScore.toFixed(1)})`).join(' | ')}`);

  host.emit(C2S.warStart);
  await until('the WAR to begin', () => host.state?.phase === 'WAR', 20_000);
  await until('the war to finish', () => Boolean(host.final), 120_000);

  const state = host.state!;
  assert(state.phase === 'RESULTS', `expected RESULTS after the war, got ${state.phase}`);
  assert(state.winnerId === host.final!.winnerId, 'the winner must match the war:final payload');

  const timeline = state.timeline!;
  assert(timeline.days.length === days, `expected ${days} days, got ${timeline.days.length}`);

  const fallenTotal = timeline.daySummaries.reduce((sum, d) => sum + d.fallen.length, 0);
  assert(
    fallenTotal === playerCount - 1,
    `expected exactly ${playerCount - 1} deaths for one survivor, got ${fallenTotal}`,
  );

  const lastSummary = timeline.daySummaries[timeline.daySummaries.length - 1]!;
  assert(lastSummary.remaining.length === 1, `expected 1 survivor, got ${lastSummary.remaining.length}`);

  const winner = servants.find((s) => s.character.key === state.timeline!.servants.find((x) => x.id === state.winnerId)?.character.key
    || s.id === state.winnerId);
  log(`✓ war complete — ${fallenTotal} fell, winner: ${winner?.character.name ?? state.winnerId}`);
  log(`✓ wish: ${timeline.wish}`);

  // No template should ever leak an unresolved placeholder.
  const unfinished = host.events.map((e) => flat(e.tokens)).filter((text) => /\{[A-Za-z_.]+\}/.test(text));
  assert(unfinished.length === 0, `unresolved placeholders in ${unfinished.length} events: ${unfinished[0] ?? ''}`);

  // Every event's participants must have been alive when it played.
  const deathDay = new Map<string, number>();
  for (const summary of timeline.daySummaries) {
    for (const id of summary.fallen) deathDay.set(id, summary.day);
  }
  for (const event of host.events) {
    for (const participant of event.participants) {
      const died = deathDay.get(participant.servantId);
      if (died !== undefined) {
        assert(died >= event.day, `a dead Servant took part in a Day ${event.day} event (died Day ${died})`);
      }
    }
  }
  log(`✓ ${host.events.length} events received, no dead Servant appeared after death, no unresolved tokens`);

  for (const summary of timeline.daySummaries) {
    const day = timeline.days.find((d) => d.day === summary.day)!;
    const sample = day.events[0] ? flat(day.events[0].tokens) : '(none)';
    log(`   Day ${summary.day} — ${summary.title}: ${sample}`);
  }

  for (const client of clients) client.close();
}

/* ------------------------------------------------------------------ */
/* Debate                                                              */
/* ------------------------------------------------------------------ */

async function runDebate(playerCount: number): Promise<void> {
  const { clients, host, servants } = await setUpGame(playerCount, 'DEBATE', 5);

  host.emit(C2S.arenaStart);
  await until('the ARENA phase', () => host.state?.phase === 'ARENA', 15_000);
  await until('the bracket to be published', () => (host.state?.arena?.bracket.length ?? 0) > 0, 10_000);
  log(`✓ bracket drawn — ${host.state!.arena!.bracket.length} matches`);

  const seen = new Set<string>();
  const deadline = Date.now() + 120_000;
  while (!host.championId) {
    if (Date.now() > deadline) throw new Error('the debate bracket never produced a champion');
    const phase = host.arenaPhase ?? host.state?.arena?.phase;
    const matchId = host.state?.arena?.currentMatchId ?? '-';
    const signature = `${matchId}:${phase}`;
    if (phase && phase !== 'CHAMPION' && !seen.has(signature)) {
      seen.add(signature);
      if (phase === 'VOTE') {
        await sleep(120);
        // Every Master votes in every match — the two fighting it included.
        for (const [index, client] of clients.entries()) {
          client.emit(C2S.arenaVote, { choice: index % 2 === 0 ? 'a' : 'b' });
        }
        // Wait for the server to acknowledge the whole room before moving on:
        // a ballot dropped here is exactly the bug this run guards against.
        await until(
          `every Master's ballot (${matchId})`,
          () => host.votedCount >= clients.length,
          5_000,
        );
        await sleep(60);
      }
      host.emit(C2S.arenaSkip);
    }
    await sleep(LOOP_MS);
  }

  const championId = host.championId!;
  assert(
    servants.some((s) => s.id === championId),
    'the champion must be one of the summoned Servants',
  );
  const champion = servants.find((s) => s.id === championId)!;
  for (const client of clients) {
    assert(client.championId === championId, 'every client must agree on the champion');
  }
  assert(host.state?.phase === 'RESULTS', `expected RESULTS after the bracket, got ${host.state?.phase}`);

  // The bracket must always end: every match decided, no empty match, one real
  // match per eliminated Servant, and never more than one bye in a round.
  const bracket = host.state!.arena!.bracket;
  assert(bracket.every((m) => Boolean(m.winner)), 'every bracket match must be decided');
  assert(bracket.every((m) => Boolean(m.a)), 'no bracket match may be left without fighters');
  assert(
    bracket.filter((m) => m.a && m.b && !m.bye).length === servants.length - 1,
    'a single-elimination bracket plays one match per eliminated Servant',
  );
  const rounds = [...new Set(bracket.map((m) => m.round))];
  for (const round of rounds) {
    assert(
      bracket.filter((m) => m.round === round && m.bye).length <= 1,
      `round ${round} must never hand out more than one bye`,
    );
  }
  const realMatches = bracket.filter((m) => m.a && m.b && !m.bye);
  assert(
    realMatches.every((m) => m.voters.length === playerCount && m.votesA + m.votesB === playerCount),
    'every Master must hold a ballot in every match, and every ballot must count',
  );
  assert(
    realMatches.some((m) => m.votesA > 0 && m.votesB > 0) || playerCount < 3,
    'an odd field must scatter votes across both fighters',
  );
  const expectedRounds = Math.ceil(Math.log2(servants.length));
  assert(host.state!.arena!.totalRounds === expectedRounds, `expected ${expectedRounds} rounds`);
  assert(host.state!.arena!.championId === championId, 'the snapshot must name the champion');
  assert(host.state!.winnerId === championId, 'the Results screen crowns whoever winnerId names');
  log(
    `✓ debate bracket resolved in ${rounds.length} round(s) — ${bracket.length} matches, ${bracket.filter((m) => m.bye).length} bye(s)`,
  );
  log(`✓ debate complete — champion: ${champion.character.name} (${champion.cls})`);

  for (const client of clients) client.close();
}

/**
 * The Arena's floor: two Masters cannot produce a third ballot, so the server
 * refuses the draft outright instead of letting a room draft into a dead end.
 */
async function runDebateMinimum(): Promise<void> {
  const clients = Array.from({ length: 2 }, (_, i) => new Client(`Pair${i + 1}`));
  await Promise.all(clients.map((c) => c.connect()));
  const host = clients[0]!;
  const other = clients[1]!;
  host.emit(C2S.roomCreate, { nickname: host.nickname });
  await until('a two-Master room', () => Boolean(host.state), 15_000);
  other.emit(C2S.roomJoin, { code: host.state!.code, nickname: other.nickname });
  await until('both Masters', () => clients.every((c) => c.playerId), 15_000);
  host.emit(C2S.settingsUpdate, { patch: { mode: 'DEBATE' } });
  await until('DEBATE settings', () => host.state?.settings.mode === 'DEBATE', 10_000);

  host.emit(C2S.draftStart);
  await until(
    'the two-Master refusal',
    () => host.errors.some((e) => e.includes('at least 3 Masters')),
    10_000,
  );
  assert(host.state?.phase === 'LOBBY', 'a two-Master Arena must stay in the lobby');
  log('✓ a two-Master Debate Arena is refused — it needs 3+');

  for (const client of clients) client.close();
}

/* ------------------------------------------------------------------ */
/* Load test                                                           */
/* ------------------------------------------------------------------ */

async function runLoadTest(rooms: number, masters: number): Promise<void> {
  let peakRooms = 0;
  let peakPlayers = 0;

  for (let batch = 0; batch < rooms; batch += 5) {
    const size = Math.min(5, rooms - batch);
    await Promise.all(
      Array.from({ length: size }, async (_, i) => {
        const index = batch + i;
        const clients = Array.from({ length: masters }, (_, j) => new Client(`Room${index}M${j}`));
        try {
          await Promise.all(clients.map((c) => c.connect()));
          const host = clients[0]!;
          host.emit(C2S.roomCreate, { nickname: host.nickname });
          await until(`room ${index}`, () => Boolean(host.state), 20_000);
          const code = host.state!.code;
          for (const client of clients.slice(1)) client.emit(C2S.roomJoin, { code, nickname: client.nickname });
          await until(
            `room ${index} to fill`,
            () => clients.every((c) => c.masters.length === masters),
            20_000,
          );
          host.emit(C2S.draftStart);
          await until(`room ${index} draft`, () => host.state?.phase === 'DRAFT', 10_000);
        } finally {
          for (const client of clients) client.close();
        }
      }),
    );

    const health = (await fetch(`${BASE}/healthz`).then((r) => r.json())) as {
      rooms: number;
      players: number;
    };
    peakRooms = Math.max(peakRooms, health.rooms);
    peakPlayers = Math.max(peakPlayers, health.players);
    log(`   ${Math.min(batch + size, rooms)}/${rooms} rooms — live: ${health.rooms} rooms / ${health.players} players`);
  }

  log(`✓ load test done — peak ${peakRooms} rooms, ${peakPlayers} players, ${rooms * masters} sockets total`);
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const roomsFlag = flag('rooms');
  if (roomsFlag) {
    const rooms = Number(roomsFlag);
    const masters = Number(flag('players') ?? 7);
    log(`▶ load test: ${rooms} rooms x ${masters} Masters against ${BASE}`);
    await runLoadTest(rooms, masters);
    return;
  }

  const players = Number(flag('players') ?? 5);
  const days = Number(flag('days') ?? 5);
  const mode = (flag('mode') ?? 'WAR').toUpperCase();
  assert(mode === 'WAR' || mode === 'DEBATE', `--mode must be WAR or DEBATE, got "${mode}"`);

  log(`▶ smoke test: ${mode}, ${players} Masters, ${days} days against ${BASE}`);
  if (mode === 'WAR') await runWar(players, days);
  else {
    assert(players >= 3, `the Debate Arena needs at least 3 Masters, got ${players}`);
    await runDebate(players);
    await runDebateMinimum();
  }
  log('✅ smoke test passed');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\n❌ smoke test failed: ${message}\n`);
  if (err instanceof Error && err.stack) process.stderr.write(`${err.stack}\n`);
  process.exitCode = 1;
});
