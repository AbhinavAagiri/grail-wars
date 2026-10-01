import { useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { CLASS_META, type Servant, type Token } from '@hgd/shared';
import { ClassBadge, ConfidenceDot, Portrait, TagList, TierBadge } from './ui';

/* ------------------------------------------------------------------ */
/* Token rendering                                                     */
/* ------------------------------------------------------------------ */

export function TokenText({
  tokens,
  onNameClick,
  className,
}: {
  tokens: Token[];
  onNameClick?: (servantId: string) => void;
  className?: string;
}) {
  return (
    <span className={className}>
      {tokens.map((token, i) => {
        if (token.t === 'name') {
          return (
            <button
              key={i}
              type="button"
              onClick={() => onNameClick?.(token.servantId)}
              className="font-semibold text-gold hover:text-gold-bright"
            >
              {token.v}
            </button>
          );
        }
        if (token.t === 'np') {
          return (
            <span
              key={i}
              className="italic"
              style={{ textShadow: '0 1px 0 rgba(179,40,61,.55)', borderBottom: '1px solid rgba(179,40,61,.5)' }}
            >
              {token.v}
            </span>
          );
        }
        return <span key={i}>{token.v}</span>;
      })}
    </span>
  );
}

/**
 * Reveals tokens with a typewriter effect. Clicking the text or pressing Space
 * skips straight to the end.
 */
export function TypewriterTokens({
  tokens,
  onNameClick,
  speedMs = 20,
  enabled = true,
  className,
  onRevealChange,
}: {
  tokens: Token[];
  onNameClick?: (servantId: string) => void;
  speedMs?: number;
  enabled?: boolean;
  className?: string;
  /**
   * Called with true while the line is still typing and false once it is fully
   * revealed (or unmounted). The war uses it so the Space key finishes a line
   * instead of also toggling playback — both actions used to fire on one press.
   */
  onRevealChange?: (revealing: boolean) => void;
}) {
  const full = useMemo(() => tokens.map((t) => t.v).join(''), [tokens]);
  const [shown, setShown] = useState(enabled ? 0 : full.length);
  const done = shown >= full.length;
  const skipRef = useRef(() => setShown(full.length));
  const revealRef = useRef(onRevealChange);
  revealRef.current = onRevealChange;

  useEffect(() => {
    revealRef.current?.(enabled && !done);
  }, [enabled, done]);

  // A skipped or replaced line must not leave the Space key "held" by a
  // typewriter that is no longer on screen.
  useEffect(() => () => revealRef.current?.(false), []);

  useEffect(() => {
    if (!enabled) {
      setShown(full.length);
      return;
    }
    setShown(0);
    const total = Math.min(full.length * speedMs, 3000);
    if (!full.length) return;
    const step = Math.max(1, Math.ceil(full.length / Math.max(1, total / 16)));
    const timer = setInterval(() => {
      setShown((current) => {
        const next = current + step;
        if (next >= full.length) {
          clearInterval(timer);
          return full.length;
        }
        return next;
      });
    }, 16);
    return () => clearInterval(timer);
  }, [full, speedMs, enabled]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !done) {
        event.preventDefault();
        skipRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done]);

  // While typing, render plain text; once finished, swap in the styled tokens.
  if (!done) {
    const partial = full.slice(0, shown);
    return (
      <span
        className={clsx('cursor-pointer', className)}
        onClick={() => skipRef.current()}
        title="Click to skip"
      >
        {partial}
        <span className="opacity-70">▌</span>
      </span>
    );
  }
  return <TokenText tokens={tokens} onNameClick={onNameClick} className={className} />;
}

/* ------------------------------------------------------------------ */
/* Card modal                                                          */
/* ------------------------------------------------------------------ */

export interface ServantStatus {
  dead: boolean;
  injured: number;
  kills: number;
  masterless?: boolean;
  diedOnDay?: number;
}

export function ServantCard({
  servant,
  status,
  onClose,
}: {
  servant: Servant;
  status?: ServantStatus;
  onClose: () => void;
}) {
  const profile = servant.profile;
  const meta = CLASS_META[servant.cls];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(8,8,11,.78)] p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${servant.character.name} details`}
    >
      <div
        className="hgd-card max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-b-none p-4 sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-4">
          <Portrait
            src={servant.character.imageUrl}
            name={servant.character.name}
            cls={servant.cls}
            dead={status?.dead}
            winner={status && !status.dead && status.kills > 0}
            size={120}
            showCaption={false}
          />
          <div className="min-w-0 flex-1">
            <h2 className="hgd-heading truncate text-xl">{servant.character.name}</h2>
            <p className="mb-2 truncate text-[13px] text-muted">{servant.character.source}</p>
            <div className="flex flex-wrap items-center gap-2">
              <ClassBadge cls={servant.cls} />
              {profile && <TierBadge tier={profile.tierPeak} />}
              {status?.dead && <span className="text-[12px] font-bold text-crimson">Fallen{status.diedOnDay ? ` on Day ${status.diedOnDay}` : ''}</span>}
              {status?.masterless && !status.dead && (
                <span className="text-[12px] font-bold text-crimson">Masterless — fading</span>
              )}
            </div>
            <p className="mt-2 text-[13px] text-muted">
              Master: <span className="text-gold">{servant.masterName}</span>
            </p>
          </div>
        </div>

        {profile ? (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
              {[
                ['Tier', profile.tierPeak],
                ['Speed', profile.speed],
                ['Durability', profile.durability],
                ['Range', profile.range],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-surface-2 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
                  <div className="truncate text-gold" title={value}>{value}</div>
                </div>
              ))}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-muted">
                <span>Oracle score</span>
                <span className="text-gold">{profile.baseScore.toFixed(1)} / 100</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, profile.baseScore)}%`,
                    background: `linear-gradient(90deg, ${meta.color}, var(--gold))`,
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[13px]">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted">Key ability</div>
                <div className="italic text-ink">{profile.keyAbilityName}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted">Archetype</div>
                <div className="text-ink">{profile.archetype}</div>
              </div>
            </div>

            {profile.abilities.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">Abilities</div>
                <div className="flex flex-wrap gap-1">
                  {profile.abilities.map((ability) => (
                    <span key={ability} className="rounded bg-surface-2 px-1.5 py-[3px] text-[11px] text-ink">
                      {ability}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <TagList tags={profile.tags} />
              <ConfidenceDot confidence={profile.confidence} />
            </div>

            {status && (
              <div className="flex gap-4 rounded-lg border border-border bg-surface-2 p-2 text-[13px]">
                <span className="text-muted">
                  Kills: <span className="text-gold">{status.kills}</span>
                </span>
                <span className="text-muted">
                  Injuries: <span className="text-crimson">{status.injured}</span>
                </span>
                <span className="text-muted">Alive: {status.dead ? 'no' : 'yes'}</span>
              </div>
            )}

            {profile.sources.length > 0 && (
              <div className="text-[11px] text-muted">
                Sources:{' '}
                {profile.sources.map((source, i) => (
                  <span key={source.url}>
                    {i > 0 && ', '}
                    <a href={source.url} target="_blank" rel="noreferrer noopener" className="text-gold underline">
                      {source.label}
                    </a>
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 text-[13px] text-muted">
            No Oracle profile yet — this Servant has not been researched.
          </p>
        )}

        <button onClick={onClose} className="hgd-btn hgd-btn-secondary mt-4 w-full">
          Close
        </button>
      </div>
    </div>
  );
}

/** Compute per-Servant status for the roster and cards. */
export function computeStatuses(
  servants: Servant[],
  events: { deaths: string[]; participants: { servantId: string }[]; injured: string[]; category: string }[],
): Record<string, ServantStatus> {
  const out: Record<string, ServantStatus> = {};
  for (const servant of servants) out[servant.id] = { dead: false, injured: 0, kills: 0 };

  for (const event of events) {
    const dead = new Set(event.deaths);
    for (const id of event.deaths) {
      const status = out[id];
      if (status) status.dead = true;
    }
    for (const id of event.injured) {
      const status = out[id];
      if (status) status.injured = Math.min(3, status.injured + 1);
    }
    // The killer is the participant who did not die in this event.
    if (dead.size > 0 && event.category !== 'nightfall') {
      for (const participant of event.participants) {
        if (dead.has(participant.servantId)) continue;
        const status = out[participant.servantId];
        if (status && !status.dead) status.kills += dead.size;
        break;
      }
    }
  }
  return out;
}
