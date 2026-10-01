import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { CLASS_META, LIMITS, POWER_CAPS, type Servant } from '@hgd/shared';
import { TIER_OPTIONS, SPEED_OPTIONS, DURABILITY_OPTIONS } from '../lib/scales';
import { ClassBadge, ConfidenceDot, Portrait, StickyHeader, SummoningCircle, TierBadge } from '../components/ui';
import { useStore } from '../store';

const CYCLING_LINES = [
  'Reading the wikis…',
  'Comparing feats…',
  'Measuring mana…',
  'Weighing Noble Phantasms…',
  'Consulting the Throne of Heroes…',
];

function ProgressScreen({ servants }: { servants: Servant[] }) {
  const research = useStore((s) => s.research);
  const rows = research.length
    ? research
    : servants.map((s) => ({
        servantId: s.id,
        name: s.character.name,
        imageUrl: s.character.imageUrl,
        status: 'pending' as const,
      }));
  const [line, setLine] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setLine((l) => (l + 1) % CYCLING_LINES.length), 2600);
    return () => clearInterval(timer);
  }, []);

  const done = rows.filter((r) => r.status === 'done' || r.status === 'failed').length;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="text-center">
        <h1 className="hgd-heading text-2xl">Consulting the Throne of Heroes…</h1>
        <p className="mt-1 text-[12px] text-muted">{CYCLING_LINES[line]}</p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${rows.length ? (done / rows.length) * 100 : 0}%`, background: 'var(--gold)' }}
        />
      </div>
      <ul className="mt-5 space-y-2">
        {rows.map((row) => (
          <li key={row.servantId} className="hgd-card flex items-center gap-3 p-2">
            <Portrait src={row.imageUrl} name={row.name} size={40} showCaption={false} />
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{row.name}</span>
            {row.status === 'done' && <ConfidenceDot confidence={row.confidence} />}
            {row.status === 'failed' && <span className="text-[11px] text-crimson">fallback</span>}
            <span className="text-[14px]" aria-hidden="true">
              {row.status === 'running' ? '⏳' : row.status === 'done' ? '✓' : row.status === 'failed' ? '⚠' : '·'}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-center text-[11px] text-muted">
        Anything that cannot be found is estimated from heuristics and marked with low confidence.
      </p>
    </div>
  );
}

function EditRow({ servant }: { servant: Servant }) {
  const overrideProfile = useStore((s) => s.overrideProfile);
  const reresearch = useStore((s) => s.reresearch);
  const [tier, setTier] = useState(servant.profile?.tierPeak ?? '7-B');
  const [speed, setSpeed] = useState(servant.profile?.speed ?? 'Hypersonic');
  const [durability, setDurability] = useState(servant.profile?.durability ?? 'City');
  const [abilities, setAbilities] = useState((servant.profile?.abilities ?? []).join(', '));

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border bg-surface-2 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-[11px] text-muted">
          Tier
          <select className="hgd-input mt-1 !min-h-[36px] !text-[12px]" value={tier} onChange={(e) => setTier(e.target.value)}>
            {TIER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-muted">
          Speed
          <select className="hgd-input mt-1 !min-h-[36px] !text-[12px]" value={speed} onChange={(e) => setSpeed(e.target.value)}>
            {SPEED_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-muted">
          Durability
          <select
            className="hgd-input mt-1 !min-h-[36px] !text-[12px]"
            value={durability}
            onChange={(e) => setDurability(e.target.value)}
          >
            {DURABILITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-[11px] text-muted">
        Abilities (comma separated)
        <input
          className="hgd-input mt-1 !min-h-[36px] !text-[12px]"
          value={abilities}
          onChange={(e) => setAbilities(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="hgd-btn hgd-btn-primary !min-h-[36px] !px-3 !text-[11px]"
          onClick={() =>
            overrideProfile(servant.id, {
              tierPeak: tier,
              speed,
              durability,
              abilities: abilities
                .split(',')
                .map((a) => a.trim())
                .filter(Boolean)
                .slice(0, 8),
            })
          }
        >
          Save
        </button>
        <button
          type="button"
          className="hgd-btn hgd-btn-secondary !min-h-[36px] !px-3 !text-[11px]"
          onClick={() => reresearch(servant.id)}
        >
          Re-research
        </button>
      </div>
    </div>
  );
}

function ReviewScreen({ servants }: { servants: Servant[] }) {
  const room = useStore((s) => s.room)!;
  const playerId = useStore((s) => s.playerId);
  const startWar = useStore((s) => s.startWar);
  const startArena = useStore((s) => s.startArena);
  const [editing, setEditing] = useState<string | null>(null);
  const isHost = room.hostId === playerId;

  const sorted = [...servants].sort(
    (a, b) => (b.profile?.baseScore ?? 0) - (a.profile?.baseScore ?? 0),
  );
  // The Arena's floor: two Masters cannot produce a third ballot, so the
  // server refuses to start it and the button says why up front.
  const arenaNeedsMasters =
    room.settings.mode === 'DEBATE' && servants.length < LIMITS.DEBATE_MIN_PLAYERS;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="hgd-heading text-2xl">Power Review</h1>
          <p className="text-[12px] text-muted">
            Sorted strongest → weakest.{' '}
            {isHost
              ? `Fix any mistakes before the ${room.settings.mode === 'WAR' ? 'war begins' : 'arena opens'}.`
              : 'The host can edit these.'}
            {arenaNeedsMasters && (
              <>
                {' '}
                <span className="text-gold">
                  The Arena needs at least {LIMITS.DEBATE_MIN_PLAYERS} Masters — invite one more.
                </span>
              </>
            )}
          </p>
        </div>
        {isHost && (
          <button
            type="button"
            className="hgd-btn hgd-btn-primary"
            disabled={arenaNeedsMasters}
            onClick={() => (room.settings.mode === 'WAR' ? startWar() : startArena())}
          >
            {room.settings.mode === 'WAR' ? 'Start the War' : 'Start the Arena'}
          </button>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {sorted.map((servant, index) => {
          const profile = servant.profile;
          const meta = CLASS_META[servant.cls];
          return (
            <article key={servant.id} className="hgd-card p-3">
              <div className="flex items-start gap-3">
                <span className="w-6 shrink-0 pt-1 text-center font-display text-lg text-muted">{index + 1}</span>
                <Portrait
                  src={servant.character.imageUrl}
                  name={servant.character.name}
                  cls={servant.cls}
                  size={64}
                  showCaption={false}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-gold">{servant.character.name}</span>
                    <ClassBadge cls={servant.cls} />
                    {profile && <TierBadge tier={profile.tierPeak} />}
                    {profile?.capped && (
                      <span
                        className="rounded border border-[var(--gold)] px-1.5 py-[2px] text-[10px] font-bold uppercase tracking-wide text-gold"
                        title={`Scaled down from ${profile.capped.from} by this room's Max Power level`}
                      >
                        capped from {profile.capped.from}
                      </span>
                    )}
                    {profile && <ConfidenceDot confidence={profile.confidence} />}
                  </div>
                  <p className="truncate text-[11.5px] text-muted">
                    {servant.character.source} · Master: {servant.masterName}
                  </p>

                  {profile && (
                    <>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
                        <span className="text-muted">
                          Speed <span className="text-ink">{profile.speed}</span>
                        </span>
                        <span className="text-muted">
                          Durability <span className="text-ink">{profile.durability}</span>
                        </span>
                        <span className="text-muted">
                          Range <span className="text-ink">{profile.range}</span>
                        </span>
                        <span className="text-muted">
                          Archetype <span className="text-ink">{profile.archetype}</span>
                        </span>
                      </div>
                      {profile.abilities.length > 0 && (
                        <p className="mt-1 text-[11.5px] text-muted">
                          <span className="text-ink">Key ability:</span> {profile.keyAbilityName} ·{' '}
                          {profile.abilities.slice(0, 4).join(', ')}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(2, profile.baseScore)}%`,
                              background: `linear-gradient(90deg, ${meta.color}, var(--gold))`,
                            }}
                          />
                        </div>
                        <span className="w-12 text-right text-[12px] font-bold text-gold">
                          {profile.baseScore.toFixed(1)}
                        </span>
                      </div>
                      {profile.sources.length > 0 && (
                        <p className="mt-1 text-[10.5px] text-muted">
                          {profile.sources.map((source, i) => (
                            <span key={source.url}>
                              {i > 0 && ' · '}
                              <a href={source.url} target="_blank" rel="noreferrer noopener" className="text-gold underline">
                                {source.label}
                              </a>
                            </span>
                          ))}
                        </p>
                      )}
                    </>
                  )}
                </div>
                {isHost && (
                  <button
                    type="button"
                    className="hgd-btn hgd-btn-ghost !min-h-[32px] !px-2 !text-[11px]"
                    onClick={() => setEditing(editing === servant.id ? null : servant.id)}
                  >
                    {editing === servant.id ? 'Close' : 'Edit'}
                  </button>
                )}
              </div>
              {isHost && editing === servant.id && <EditRow servant={servant} />}
            </article>
          );
        })}
      </div>

      <p className="mt-4 text-center text-[11.5px] text-muted">
        {room.settings.mode === 'WAR'
          ? "These scores decide fights. Randomness only appears when two Servants are within 3 points of each other, and every result is explained in the war's “Why?” panel."
          : 'These scores are the Oracle numbers voters see beside each Servant. Every matchup is still decided by the room’s vote.'}
      </p>
      <p className="mt-1 text-center text-[11px] text-muted">
        This room's Max Power level is{' '}
        <span className="text-gold">
          {POWER_CAPS.find((cap) => cap.value === room.settings.war.maxPowerLevel)?.label ??
            room.settings.war.maxPowerLevel}
        </span>
        . Servants researched above it are scaled down to it.
      </p>
    </div>
  );
}

export default function Research({ review = false }: { review?: boolean }) {
  const room = useStore((s) => s.room)!;
  const servants = room.servants ?? [];

  return (
    <div className="relative min-h-screen">
      <StickyHeader />
      <SummoningCircle size={560} className="left-[-160px] top-24" />
      <div className="relative">
        {review ? <ReviewScreen servants={servants} /> : <ProgressScreen servants={servants} />}
      </div>
    </div>
  );
}
