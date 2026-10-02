import type { ComponentType } from 'react';
import { clsx } from 'clsx';
import { LIMITS, type Mode, type RoomSettings } from '@hgd/shared';
import { SettingRow, Select, Toggle } from './components/SettingsControls';
import { useStore } from './store';

/*
 * How each mode presents itself in the lobby: the panel over its rules, the
 * words the rest of the lobby uses for it, and the room size it needs. The
 * lobby renders whichever entry matches `settings.mode` and never compares the
 * mode itself, so a new mode is one entry here — and the record is keyed by
 * `Mode`, so adding a mode to the union will not compile until its entry
 * exists.
 *
 * The cards the modes are chosen with are a different list, shared/src's
 * MODE_CARDS, because the landing page draws those too.
 */

export interface ModeLobby {
  /** heading over the rules panel */
  title: string;
  /** title over the class toggles */
  classesTitle: string;
  /** the word the lobby's prose uses for this mode, as in "a bigger, stranger war" */
  noun: string;
  /** what the Extended switch is called in this mode */
  extendedLabel: string;
  /** the smallest room that can play it */
  minMasters: number;
  /** what the Master list says while the room is too small */
  waitingFor: (masters: number) => string;
  /** the mode's own rules rows, drawn inside the shared, divided settings list */
  Rules: ComponentType;
  /** the mode's own block below the shared rows, if it has one */
  Extra?: ComponentType;
}

/* ------------------------------------------------------------------ */
/* Web-Driven War                                                      */
/* ------------------------------------------------------------------ */

function WarRules() {
  const room = useStore((s) => s.room)!;
  const playerId = useStore((s) => s.playerId);
  const updateSettings = useStore((s) => s.updateSettings);
  const isHost = room.hostId === playerId;
  const settings = room.settings;
  const patchWar = (value: Partial<RoomSettings['war']>) => updateSettings({ war: value });

  return (
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
  );
}

/** The Grail War's real-world location — it has no meaning in the arena. */
function WarLocationBlock() {
  const room = useStore((s) => s.room)!;
  const playerId = useStore((s) => s.playerId);
  const rerollLocation = useStore((s) => s.rerollLocation);
  const pickLocation = useStore((s) => s.pickLocation);
  const isHost = room.hostId === playerId;

  return (
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
            <p className="text-[12px] text-ink">You choose where the war happens. Pick one of these three:</p>
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
                  className={clsx('hgd-card p-2 text-left', canPick ? 'hgd-card-interactive' : 'opacity-70')}
                >
                  <span className="block text-[13px] font-bold text-ink">{option.name}</span>
                  <span className="block text-[11px] text-muted">{option.country}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mt-1 text-[12px] text-muted">None chosen yet — the Grail will decide when the war starts.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Debate Arena                                                        */
/* ------------------------------------------------------------------ */

function DebateRules() {
  const room = useStore((s) => s.room)!;
  const playerId = useStore((s) => s.playerId);
  const updateSettings = useStore((s) => s.updateSettings);
  const isHost = room.hostId === playerId;
  const settings = room.settings;
  const patchDebate = (value: Partial<RoomSettings['debate']>) => updateSettings({ debate: value });

  return (
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
      <SettingRow label="Ballots" hint="Every Master votes in every match — including the two whose Servants are fighting.">
        <span className="text-[12px] text-muted">Everyone votes</span>
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
  );
}

/* ------------------------------------------------------------------ */
/* The declaration                                                     */
/* ------------------------------------------------------------------ */

export const MODE_LOBBY: Record<Mode, ModeLobby> = {
  WAR: {
    title: 'Rules of the War',
    classesTitle: 'Classes in this war',
    noun: 'war',
    extendedLabel: 'Extended War',
    minMasters: LIMITS.MIN_PLAYERS,
    waitingFor: (masters) => `Waiting for at least ${masters} Masters — share the code above.`,
    Rules: WarRules,
    Extra: WarLocationBlock,
  },
  DEBATE: {
    title: 'Rules of the Arena',
    classesTitle: 'Classes in this Arena',
    noun: 'arena',
    extendedLabel: 'Extended Arena',
    minMasters: LIMITS.DEBATE_MIN_PLAYERS,
    waitingFor: (masters) =>
      `Waiting for at least ${masters} Masters — the Arena needs a third ballot to break a tie between the two fighters.`,
    Rules: DebateRules,
  },
};
