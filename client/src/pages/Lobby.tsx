import { useState } from 'react';
import { clsx } from 'clsx';
import {
  CLASSES,
  CLASS_META,
  enabledClasses,
  LIMITS,
  POWER_CAPS,
  type Mode,
  type RoomSettings,
  type ServantClass,
  type SettingsPatch,
} from '@hgd/shared';
import { AvatarCircle, PlayerDot, StickyHeader, SummoningCircle } from '../components/ui';
import { useStore } from '../store';

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="text-[13px] text-ink">{label}</div>
        {hint && <div className="text-[11px] text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Select<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="hgd-input !min-h-[38px] !w-auto !py-1 !text-[12px]"
      value={String(value)}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        const found = options.find((o) => String(o.value) === raw);
        if (found) onChange(found.value);
      }}
    >
      {options.map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative h-[26px] w-[48px] rounded-full border transition-colors',
        checked ? 'border-gold bg-gold' : 'border-border bg-surface-2',
        disabled && 'opacity-45',
      )}
    >
      <span
        className={clsx(
          'absolute top-[2px] h-[20px] w-[20px] rounded-full bg-[#121216] transition-all',
          checked ? 'left-[24px]' : 'left-[2px]',
        )}
      />
    </button>
  );
}

export default function Lobby() {
  const room = useStore((s) => s.room)!;
  const playerId = useStore((s) => s.playerId);
  const updateSettings = useStore((s) => s.updateSettings);
  const startDraft = useStore((s) => s.startDraft);
  const pickLocation = useStore((s) => s.pickLocation);
  const rerollLocation = useStore((s) => s.rerollLocation);
  const kick = useStore((s) => s.kick);
  const transferHost = useStore((s) => s.transferHost);
  const pushToast = useStore((s) => s.pushToast);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const isHost = room.hostId === playerId;
  const masters = room.players.filter((p) => !p.isSpectator);
  const settings = room.settings;
  const patch = (value: SettingsPatch) => updateSettings(value);
  const patchWar = (value: Partial<RoomSettings['war']>) => updateSettings({ war: value });
  const patchDebate = (value: Partial<RoomSettings['debate']>) => updateSettings({ debate: value });

  const enabledClassList = enabledClasses(settings.classes);
  const toggleClass = (cls: ServantClass) => {
    const active = enabledClassList.includes(cls);
    if (active && enabledClassList.length === 1) return;
    const next = active
      ? enabledClassList.filter((c) => c !== cls)
      : CLASSES.filter((c) => c === cls || enabledClassList.includes(c));
    patch({ classes: next });
  };

  const copyInvite = async () => {
    const link = `${window.location.origin}/room/${room.code}`;
    try {
      await navigator.clipboard.writeText(link);
      pushToast({ kind: 'success', message: 'Invite link copied.' });
    } catch {
      pushToast({ kind: 'warn', message: link });
    }
  };

  const modeCard = (
    mode: Mode,
    icon: string,
    title: string,
    blurb: string,
    options?: { badge?: string; comingSoon?: boolean; note?: string },
  ) => (
    <button
      type="button"
      disabled={!isHost || options?.comingSoon}
      onClick={() => patch({ mode })}
      aria-disabled={!isHost || Boolean(options?.comingSoon)}
      title={options?.comingSoon ? `${title} is not playable yet.` : undefined}
      className={clsx(
        'hgd-card hgd-card-interactive relative p-3 text-left',
        settings.mode === mode && 'outline outline-1 outline-gold',
        options?.comingSoon && 'cursor-not-allowed opacity-60',
      )}
      style={settings.mode === mode ? { borderColor: 'var(--gold)' } : undefined}
    >
      {options?.badge && (
        <span className="absolute right-2 top-2 rounded bg-gold px-1.5 py-[2px] text-[9px] font-black uppercase text-[#1a1408]">
          {options.badge}
        </span>
      )}
      {options?.comingSoon && (
        <span className="absolute right-2 top-2 rounded border border-[var(--gold)] px-1.5 py-[2px] text-[9px] font-black uppercase tracking-wider text-gold">
          Coming soon
        </span>
      )}
      <div className="text-[20px]">{icon}</div>
      <div className="mt-1 font-bold text-ink">{title}</div>
      <p className="mt-1 text-[11.5px] leading-snug text-muted">{blurb}</p>
      {options?.note && (
        <p className="mt-2 rounded border border-border bg-surface-2 px-2 py-1.5 text-[10.5px] leading-snug text-muted">
          {options.note}
        </p>
      )}
      {options?.comingSoon && (
        <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-gold">Not playable yet</p>
      )}
    </button>
  );

  return (
    <div className="relative min-h-screen">
      <StickyHeader />
      <SummoningCircle size={520} className="right-[-140px] top-16" />

      <div className="relative mx-auto max-w-5xl px-4 py-6">
        <div className="hgd-card p-4 text-center">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Room code</p>
          <div className="mt-2 flex justify-center gap-2">
            {room.code.split('').map((char, i) => (
              <span
                key={i}
                className="flex h-[52px] w-[46px] items-center justify-center rounded-lg border border-border bg-surface-2 font-display text-[30px] font-bold text-gold sm:h-[64px] sm:w-[56px] sm:text-[38px]"
              >
                {char}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className="hgd-btn hgd-btn-secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(room.code);
                  pushToast({ kind: 'success', message: 'Room code copied.' });
                } catch {
                  pushToast({ kind: 'warn', message: room.code });
                }
              }}
            >
              Copy Code
            </button>
            <button type="button" className="hgd-btn hgd-btn-ghost" onClick={copyInvite}>
              Copy Invite Link
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.15fr]">
          {/* Players */}
          <section className="hgd-card p-4">
            <h2 className="hgd-heading mb-2 text-lg">
              Masters {masters.length}/{settings.maxPlayers}
            </h2>
            <ul className="space-y-2">
              {room.players.map((player) => (
                <li key={player.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2">
                  <AvatarCircle player={player} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] text-ink">{player.nickname}</span>
                      {player.id === room.hostId && <span title="Host">👑</span>}
                      {player.id === playerId && (
                        <span className="rounded bg-surface px-1 text-[9px] font-bold uppercase text-muted">You</span>
                      )}
                      {player.isSpectator && (
                        <span className="rounded bg-surface px-1 text-[9px] uppercase text-muted">spectator</span>
                      )}
                    </div>
                  </div>
                  <PlayerDot player={player} />
                  {isHost && player.id !== playerId && (
                    <div className="relative">
                      <button
                        type="button"
                        className="hgd-btn hgd-btn-ghost !min-h-[32px] !px-2"
                        onClick={() => setMenuFor(menuFor === player.id ? null : player.id)}
                        aria-label={`Options for ${player.nickname}`}
                      >
                        …
                      </button>
                      {menuFor === player.id && (
                        <div className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-surface">
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-left text-[12px] hover:bg-surface-2"
                            onClick={() => {
                              transferHost(player.id);
                              setMenuFor(null);
                            }}
                          >
                            Make host
                          </button>
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-left text-[12px] text-crimson hover:bg-surface-2"
                            onClick={() => {
                              kick(player.id);
                              setMenuFor(null);
                            }}
                          >
                            Remove from room
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {room.spectators > 0 && (
              <p className="mt-2 text-[11.5px] text-muted">{room.spectators} spectating</p>
            )}
            {masters.length < minMasters && (
              <p className="mt-3 text-[12px] text-gold">
                {settings.mode === 'DEBATE'
                  ? `Waiting for at least ${minMasters} Masters — the Arena needs a third ballot to break a tie between the two fighters.`
                  : `Waiting for at least ${minMasters} Masters — share the code above.`}
              </p>
            )}
          </section>

          {/* Settings */}
          <section className="hgd-card p-4">
            <h2 className="hgd-heading mb-2 text-lg">
              {settings.mode === 'WAR' ? 'Rules of the War' : 'Rules of the Arena'}
            </h2>
            {!isHost && <p className="mb-2 text-[11.5px] text-muted">Only the host can change these.</p>}

            <div className="grid gap-2 sm:grid-cols-2">
              {modeCard(
                'WAR',
                '⚔️',
                'Web-Driven War',
                'The AI researches every Servant, power-scales them, and plays out a five-day Holy Grail War.',
                {
                  badge: 'Recommended',
                  note: 'Heads up: this mode is powered by AI, and it scales every Servant against the VS Battles Wiki. Characters with higher tiers also scale higher here, so the stronger ones will usually win — set the Max Power level below if you want a closer war.',
                },
              )}
              {modeCard(
                'DEBATE',
                '🗣️',
                'Debate Arena',
                'One random 1v1 at a time. Every Master argues their Servant, everyone votes, winners advance.',
                {
                  note: `Three to ${LIMITS.MAX_PLAYERS_EXTENDED} Masters, and every Master votes in every match — even the one they are fighting. Each Master drafts a character for every class, then the Grail hands them one to debate for; an uneven field sends one random character through on a bye.`,
                },
              )}
            </div>

            <div className="mt-3 divide-y divide-[var(--border)]">
              {settings.mode === 'WAR' ? (
                <>
                  <SettingRow label="War length" hint="Number of in-game days">
                    <Select
                      value={settings.war.days}
                      disabled={!isHost}
                      onChange={(v) => patchWar({ days: Number(v) })}
                      options={[3, 4, 5, 6, 7].map((n) => ({ value: n, label: `${n} days` }))}
                    />
                  </SettingRow>
                  <SettingRow label="Events per day">
                    <div className="flex items-center gap-1">
                      <Select
                        value={settings.war.minEventsPerDay}
                        disabled={!isHost}
                        onChange={(v) => patchWar({ minEventsPerDay: Number(v) })}
                        options={[4, 5, 6, 7, 8].map((n) => ({ value: n, label: `min ${n}` }))}
                      />
                      <Select
                        value={settings.war.maxEventsPerDay}
                        disabled={!isHost}
                        onChange={(v) => patchWar({ maxEventsPerDay: Number(v) })}
                        options={[4, 5, 6, 7, 8].map((n) => ({ value: n, label: `max ${n}` }))}
                      />
                    </div>
                  </SettingRow>
                  <SettingRow label="Auto-play speed">
                    <Select
                      value={settings.war.autoplayMs}
                      disabled={!isHost}
                      onChange={(v) => patchWar({ autoplayMs: Number(v) })}
                      options={[
                        { value: 0, label: 'Manual' },
                        { value: 4000, label: '4 s' },
                        { value: 7000, label: '7 s' },
                        { value: 10000, label: '10 s' },
                        { value: 15000, label: '15 s' },
                      ]}
                    />
                  </SettingRow>
                  <SettingRow
                    label="Class advantage"
                    hint="Saber > Lancer > Archer, Rider > Caster > Assassin, Ruler > Avenger"
                  >
                    <Toggle
                      label="Class advantage"
                      checked={settings.war.classAdvantage}
                      disabled={!isHost}
                      onChange={(v) => patchWar({ classAdvantage: v })}
                    />
                  </SettingRow>
                  <SettingRow label="Command Spell rescues" hint="Once per Servant per war">
                    <Toggle
                      label="Command Spell rescues"
                      checked={settings.war.commandSpellRescues}
                      disabled={!isHost}
                      onChange={(v) => patchWar({ commandSpellRescues: v })}
                    />
                  </SettingRow>
                  <SettingRow label="Narration" hint="The voice the war is told in">
                    <Select
                      value={settings.war.narration}
                      disabled={!isHost}
                      onChange={(v) => patchWar({ narration: v as RoomSettings['war']['narration'] })}
                      options={[
                        { value: 'templated', label: 'Templated' },
                        { value: 'hunger_games', label: 'Hunger Games' },
                        { value: 'fate', label: 'Fate' },
                      ]}
                    />
                  </SettingRow>
                  <SettingRow label="War location" hint="Where on Earth the Grail War takes place">
                    <Select
                      value={settings.war.locationMode}
                      disabled={!isHost}
                      onChange={(v) => patchWar({ locationMode: v as RoomSettings['war']['locationMode'] })}
                      options={[
                        { value: 'ai', label: 'Let AI Decide' },
                        { value: 'players', label: "Let Players Choose" },
                      ]}
                    />
                  </SettingRow>
                </>
              ) : (
                <>
                  <SettingRow label="Argue time">
                    <Select
                      value={settings.debate.argueSec}
                      disabled={!isHost}
                      onChange={(v) => patchDebate({ argueSec: Number(v) })}
                      options={[30, 60, 90, 120, 180].map((n) => ({ value: n, label: `${n}s` }))}
                    />
                  </SettingRow>
                  <SettingRow label="Vote time">
                    <Select
                      value={settings.debate.voteSec}
                      disabled={!isHost}
                      onChange={(v) => patchDebate({ voteSec: Number(v) })}
                      options={[15, 20, 30].map((n) => ({ value: n, label: `${n}s` }))}
                    />
                  </SettingRow>
                  <SettingRow label="Tie-break">
                    <Select
                      value={settings.debate.tieBreak}
                      disabled={!isHost}
                      onChange={(v) => patchDebate({ tieBreak: v as 'host' | 'random' | 'oracle' })}
                      options={[
                        { value: 'host', label: 'Host decides' },
                        { value: 'random', label: 'Random' },
                        { value: 'oracle', label: 'Oracle decides' },
                      ]}
                    />
                  </SettingRow>
                  <SettingRow label="Owners can vote in their own match">
                    <Toggle
                      label="Owners vote"
                      checked={settings.debate.ownersVote}
                      disabled={!isHost}
                      onChange={(v) => patchDebate({ ownersVote: v })}
                    />
                  </SettingRow>
                  <SettingRow label="Show Oracle stat cards">
                    <Toggle
                      label="Oracle cards"
                      checked={settings.debate.showOracleCards}
                      disabled={!isHost}
                      onChange={(v) => patchDebate({ showOracleCards: v })}
                    />
                  </SettingRow>

                  {/* Team-ups are designed but not built yet: the row is shown
                      greyed so hosts can see what is coming, and neither control
                      is wired to the server. */}
                  <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3 opacity-70">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] text-ink">Team-ups</span>
                          <span className="rounded border border-[var(--gold)] px-1.5 py-[2px] text-[9px] font-black uppercase tracking-wider text-gold">
                            Coming soon
                          </span>
                        </div>
                        <div className="text-[11px] text-muted">
                          Off, every round is a straight 1v1. On, some rounds become a 2v1 team-up.
                        </div>
                      </div>
                      <div className="shrink-0">
                        <Toggle label="Team-ups" checked={false} disabled onChange={() => {}} />
                      </div>
                    </div>
                    <div className="mt-2">
                      <p className="text-[10.5px] uppercase tracking-wide text-muted">How teams are chosen</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Select
                          value={settings.debate.teamMode}
                          disabled
                          onChange={() => {}}
                          options={[
                            { value: 'weaker', label: 'Weaker characters team up' },
                            { value: 'canonical', label: 'Canonical allies' },
                            { value: 'random', label: 'Random pairings' },
                          ]}
                        />
                        <span className="text-[11px] text-muted">
                          Two underdogs against a favourite · allies from the same story · anyone at all.
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* The cap applies to both modes: it is what the Oracle profiles
                  are clamped to before the arena shows them. */}
              <SettingRow
                label="Max Power level"
                hint="A hard cap: any Servant researched above this level is scaled down to it. Default 4-B Solar System."
              >
                <Select
                  value={settings.war.maxPowerLevel}
                  disabled={!isHost}
                  onChange={(v) => patchWar({ maxPowerLevel: v })}
                  options={POWER_CAPS.map((cap) => ({ value: cap.value as string, label: cap.label }))}
                />
              </SettingRow>

              <SettingRow label="Draft timer">
                <Select
                  value={settings.draftTimerSec}
                  disabled={!isHost}
                  onChange={(v) => patch({ draftTimerSec: Number(v) })}
                  options={[
                    { value: 0, label: 'Off' },
                    { value: 300, label: '5 min' },
                    { value: 600, label: '10 min' },
                    { value: 900, label: '15 min' },
                  ]}
                />
              </SettingRow>
              <SettingRow label="Avoid own pick" hint="Nobody is handed their own submission when possible">
                <Toggle
                  label="Avoid own pick"
                  checked={settings.avoidOwnPick}
                  disabled={!isHost}
                  onChange={(v) => patch({ avoidOwnPick: v })}
                />
              </SettingRow>
              <SettingRow
                label={settings.mode === 'WAR' ? 'Extended War' : 'Extended Arena'}
                hint={`Up to ${LIMITS.MAX_PLAYERS_EXTENDED} Masters`}
              >
                <Toggle
                  label="Extended war"
                  checked={settings.extendedWar}
                  disabled={!isHost}
                  onChange={(v) =>
                    patch({
                      extendedWar: v,
                      maxPlayers: v ? LIMITS.MAX_PLAYERS_EXTENDED : LIMITS.MAX_PLAYERS_DEFAULT,
                    })
                  }
                />
              </SettingRow>
              <SettingRow label="Max Masters">
                <Select
                  value={settings.maxPlayers}
                  disabled={!isHost}
                  onChange={(v) => patch({ maxPlayers: Number(v) })}
                  options={Array.from(
                    { length: (settings.extendedWar ? LIMITS.MAX_PLAYERS_EXTENDED : LIMITS.MAX_PLAYERS_DEFAULT) - 1 },
                    (_, i) => i + 2,
                  ).map((n) => ({ value: n, label: String(n) }))}
                />
              </SettingRow>
              <SettingRow label="Allow spectators">
                <Toggle
                  label="Allow spectators"
                  checked={settings.allowSpectators}
                  disabled={!isHost}
                  onChange={(v) => patch({ allowSpectators: v })}
                />
              </SettingRow>
            </div>

            {isHost && (
              <button
                type="button"
                className="hgd-btn hgd-btn-primary mt-4 w-full"
                disabled={masters.length < LIMITS.MIN_PLAYERS}
                onClick={startDraft}
              >
                Start Draft
              </button>
            )}

            {/* Which classes take part. Toggle any of them in or out. */}
            <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] text-ink">
                  {settings.mode === 'WAR' ? 'Classes in this war' : 'Classes in this Arena'}
                </span>
                <span className="text-[11px] text-muted">
                  {enabledClassList.length} of {CLASSES.length} selected · one character each
                </span>
              </div>
              {!isHost && <p className="mt-1 text-[11px] text-muted">Only the host can change these.</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {CLASSES.map((cls) => {
                  const on = enabledClassList.includes(cls);
                  const meta = CLASS_META[cls];
                  const last = on && enabledClassList.length === 1;
                  return (
                    <button
                      key={cls}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`${meta.label} ${on ? 'on' : 'off'}`}
                      disabled={!isHost || last}
                      title={last ? 'At least one class must be selected' : `${meta.label} ${on ? 'on' : 'off'}`}
                      onClick={() => toggleClass(cls)}
                      className={clsx(
                        'flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11.5px] font-bold uppercase tracking-wide transition-colors',
                        on ? 'bg-surface' : 'bg-transparent opacity-50',
                        (!isHost || last) && 'cursor-not-allowed',
                      )}
                      style={{ borderColor: on ? meta.color : 'var(--border)', color: on ? meta.color : undefined }}
                    >
                      <span aria-hidden="true">{meta.icon}</span>
                      {meta.label}
                      <span className="text-[10px]">{on ? '✓' : '＋'}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted">
                Shielder, Ruler and Avenger are optional — switch them on for a bigger, stranger{' '}
                {settings.mode === 'WAR' ? 'war' : 'arena'}.
              </p>
            </div>

            {/* How the draft is dealt: free search, or the game's own rosters. */}
            <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
              <SettingRow
                label="AI Chooses characters"
                hint="The game deals 25 characters per class instead of free search"
              >
                <Toggle
                  label="AI Chooses characters"
                  checked={settings.aiChooses}
                  disabled={!isHost}
                  onChange={(v) => patch({ aiChooses: v })}
                />
              </SettingRow>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Select
                  value={settings.aiPool}
                  disabled={!isHost || !settings.aiChooses}
                  onChange={(v) => patch({ aiPool: v as RoomSettings['aiPool'] })}
                  options={[
                    { value: 'anime', label: 'Anime only' },
                    { value: 'history', label: 'History only' },
                    { value: 'mixed', label: 'Mixed' },
                  ]}
                />
                <span className="text-[11px] text-muted">
                  {settings.aiChooses
                    ? 'Each class is dealt 25 random characters from that roster.'
                    : 'Off — Masters search for anyone they like (class rules still apply).'}
                </span>
              </div>
            </div>

            {/* The Grail War's real-world location — it has no meaning in the arena. */}
            {settings.mode === 'WAR' && (
              <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted">War location</p>
                {room.warLocation ? (
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-display text-[16px] font-bold text-gold">{room.warLocation.name}</p>
                      <p className="text-[11.5px] text-muted">{room.warLocation.country}</p>
                    </div>
                    {isHost && (
                      <button
                        type="button"
                        className="hgd-btn hgd-btn-ghost !min-h-[30px] !px-2 !text-[11px]"
                        onClick={rerollLocation}
                      >
                        Re-roll
                      </button>
                    )}
                  </div>
                ) : room.locationChoice ? (
                  <div className="mt-1">
                    {room.locationChoice.chooserId === playerId ? (
                      <p className="text-[12px] text-ink">
                        You choose where the war happens. Pick one of these three:
                      </p>
                    ) : (
                      <p className="text-[12px] text-ink">
                        <span className="text-gold">
                          {room.players.find((p) => p.id === room.locationChoice?.chooserId)?.nickname ?? 'A Master'}
                        </span>{' '}
                        is choosing where the war happens.
                      </p>
                    )}
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {room.locationChoice.options.map((option) => {
                        const canPick = room.locationChoice?.chooserId === playerId;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            disabled={!canPick}
                            onClick={() => pickLocation(option.id)}
                            className={clsx(
                              'hgd-card p-2 text-left',
                              canPick ? 'hgd-card-interactive' : 'opacity-70',
                            )}
                          >
                            <span className="block text-[13px] font-bold text-ink">{option.name}</span>
                            <span className="block text-[11px] text-muted">{option.country}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-[12px] text-muted">
                    None chosen yet — the Grail will decide when the war starts.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
