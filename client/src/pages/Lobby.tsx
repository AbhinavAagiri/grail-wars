import { useState } from 'react';
import { clsx } from 'clsx';
import {
  CLASSES,
  CLASS_META,
  enabledClasses,
  LIMITS,
  MODE_CARDS,
  POWER_CAPS,
  type ModeCard,
  type RoomSettings,
  type ServantClass,
  type SettingsPatch,
} from '@hgd/shared';
import { SettingRow, Select, Toggle } from '../components/SettingsControls';
import { AvatarCircle, PlayerDot, StickyHeader, SummoningCircle } from '../components/ui';
import { MODE_LOBBY } from '../modes';
import { useStore } from '../store';

export default function Lobby() {
  const room = useStore((s) => s.room)!;
  const playerId = useStore((s) => s.playerId);
  const updateSettings = useStore((s) => s.updateSettings);
  const startDraft = useStore((s) => s.startDraft);
  const kick = useStore((s) => s.kick);
  const transferHost = useStore((s) => s.transferHost);
  const pushToast = useStore((s) => s.pushToast);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const isHost = room.hostId === playerId;
  const masters = room.players.filter((p) => !p.isSpectator);
  const settings = room.settings;
  // Everything the lobby says about this mode — its rules panel, its labels and
  // the room size it needs — is declared per mode in client/src/modes.tsx.
  const lobby = MODE_LOBBY[settings.mode];
  const Rules = lobby.Rules;
  const Extra = lobby.Extra;
  const patch = (value: SettingsPatch) => updateSettings(value);
  const patchWar = (value: Partial<RoomSettings['war']>) => updateSettings({ war: value });

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

  // One card per entry in MODE_CARDS — the same list the landing page renders,
  // so a mode is declared once and a flag decides whether it can be chosen.
  // A card that is not playable yet has no `mode` to set: it can never match
  // the room's current mode, so it never takes the gold selected outline.
  const renderModeCard = (card: ModeCard) => {
    const selected = card.playable && settings.mode === card.mode;
    const locked = !isHost || !card.playable;
    return (
      <button
        key={card.title}
        type="button"
        disabled={locked}
        onClick={() => card.playable && patch({ mode: card.mode })}
        aria-disabled={locked}
        title={card.playable ? undefined : `${card.title} is not playable yet.`}
        className={clsx(
          'hgd-card hgd-card-interactive relative p-3 text-left',
          selected && 'outline outline-1 outline-gold',
          !card.playable && 'cursor-not-allowed opacity-60',
        )}
        style={selected ? { borderColor: 'var(--gold)' } : undefined}
      >
        {card.badge && (
          <span className="absolute right-2 top-2 rounded bg-gold px-1.5 py-[2px] text-[9px] font-black uppercase text-[#1a1408]">
            {card.badge}
          </span>
        )}
        {!card.playable && (
          <span className="absolute right-2 top-2 rounded border border-[var(--gold)] px-1.5 py-[2px] text-[9px] font-black uppercase tracking-wider text-gold">
            Coming soon
          </span>
        )}
        <div className="text-[20px]">{card.icon}</div>
        <div className="mt-1 font-bold text-ink">{card.title}</div>
        <p className="mt-1 text-[11.5px] leading-snug text-muted">{card.blurb}</p>
        {card.note && (
          <p className="mt-2 rounded border border-border bg-surface-2 px-2 py-1.5 text-[10.5px] leading-snug text-muted">
            {card.note}
          </p>
        )}
        {!card.playable && (
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-gold">Not playable yet</p>
        )}
      </button>
    );
  };

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
            {masters.length < lobby.minMasters && (
              <p className="mt-3 text-[12px] text-gold">{lobby.waitingFor(lobby.minMasters)}</p>
            )}
          </section>

          {/* Settings */}
          <section className="hgd-card p-4">
            <h2 className="hgd-heading mb-2 text-lg">{lobby.title}</h2>
            {!isHost && <p className="mb-2 text-[11.5px] text-muted">Only the host can change these.</p>}

            <div className="grid gap-2 sm:grid-cols-2">{MODE_CARDS.map(renderModeCard)}</div>

            <div className="mt-3 divide-y divide-[var(--border)]">
              {/* This mode's own rules rows, declared in client/src/modes.tsx. */}
              <Rules />

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
                label={lobby.extendedLabel}
                hint={`Up to ${LIMITS.MAX_PLAYERS_EXTENDED} Masters`}
              >
                <Toggle
                  label={lobby.extendedLabel}
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
                disabled={masters.length < lobby.minMasters}
                onClick={startDraft}
              >
                Start Draft
              </button>
            )}

            {/* Which classes take part. Toggle any of them in or out. */}
            <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] text-ink">
                  {lobby.classesTitle}
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
                Shielder, Ruler and Avenger are optional — switch them on for a bigger, stranger {lobby.noun}.
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

            {/* The mode's own block below the shared rows, if it declared one. */}
            {Extra && <Extra />}
          </section>
        </div>
      </div>
    </div>
  );
}
