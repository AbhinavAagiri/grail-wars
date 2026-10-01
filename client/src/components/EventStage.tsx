import { useState } from 'react';
import { clsx } from 'clsx';
import type { Servant, WarDay, WarEvent } from '@hgd/shared';
import { Portrait } from './ui';
import { TokenText, TypewriterTokens, type ServantStatus } from './ServantCard';

const PHASE_LABEL: Record<WarEvent['phase'], string> = {
  morning: '☀ Morning',
  afternoon: '🌤 Afternoon',
  evening: '🌆 Evening',
  night: '🌙 Night',
};

const BANNER_STYLE: Record<NonNullable<WarEvent['banner']>, { label: string; color: string }> = {
  death: { label: '☠', color: 'var(--crimson)' },
  alliance: { label: '🤝 Alliance formed', color: 'var(--gold)' },
  betrayal: { label: '🗡 Betrayal!', color: 'var(--crimson)' },
  global: { label: '📜 Church announcement', color: 'var(--purple, #a855f7)' },
  finale: { label: '✦ The final battle', color: 'var(--gold)' },
};

const CONFLICT_GLYPH: Partial<Record<WarEvent['category'], string>> = {
  duel: '⚔',
  hunt: '⚔',
  rematch: '⚔',
  skirmish: '⚔',
  teamup: '⚔',
  chaos: '⚔',
  alliance: '🤝',
  betrayal: '🗡',
  master_hunt: '🗡',
  rest: '✨',
};

function portraitSize(count: number): number {
  if (count <= 1) return 240;
  if (count === 2) return 200;
  if (count <= 4) return 160;
  return 120;
}

export function EventStage({
  day,
  event,
  servants,
  statuses,
  prevEvent,
  onSelectServant,
  typing,
  onRevealChange,
}: {
  day: WarDay;
  event: WarEvent;
  servants: Servant[];
  statuses: Record<string, ServantStatus>;
  prevEvent?: WarEvent;
  onSelectServant: (servant: Servant) => void;
  typing: boolean;
  /** forwards the typewriter's state, so Space only toggles playback once the line is shown */
  onRevealChange?: (revealing: boolean) => void;
}) {
  const [showWhy, setShowWhy] = useState(false);

  const byId = new Map(servants.map((s) => [s.id, s]));
  const participants = event.participants
    .map((p) => ({ servant: byId.get(p.servantId), role: p.role }))
    .filter((p): p is { servant: Servant; role: typeof p.role } => Boolean(p.servant));

  const isNightfall = event.category === 'nightfall';
  const size = portraitSize(participants.length);
  const winners = new Set(event.participants.filter((p) => p.role === 'actor').map((p) => p.servantId));
  const glyph = CONFLICT_GLYPH[event.category as WarEvent['category']] ?? null;
  const deaths = new Set(event.deaths);

  return (
    <div className="flex min-h-full w-full flex-col items-center">
      {/* Day heading */}
      <div className="w-full text-center">
        <h2 className="hgd-heading text-[30px] leading-tight sm:text-[34px]">Day {day.day}</h2>
        <p className="mt-1 font-body text-[13px] italic text-muted">{day.title}</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted">
          <span className="rounded-full border border-border bg-surface-2 px-2 py-[3px]">
            {PHASE_LABEL[event.phase]}
          </span>
          {event.location && (
            <span className="rounded-full border border-border bg-surface-2 px-2 py-[3px]">📍 {event.location}</span>
          )}
        </div>
      </div>

      {/* Portraits */}
      {participants.length > 0 && (
        <div
          className={clsx(
            'mt-5 flex flex-wrap items-center justify-center gap-3 sm:gap-5',
            participants.length >= 5 && 'max-w-[520px]',
          )}
        >
          {participants.map(({ servant, role }, index) => (
            <div key={`${servant.id}-${index}`} className="flex items-center gap-3 sm:gap-5">
              {index > 0 && glyph && index === 1 && (
                <span className="text-2xl" aria-hidden="true">
                  {glyph}
                </span>
              )}
              <Portrait
                src={servant.character.imageUrl}
                name={servant.character.name}
                cls={servant.cls}
                size={size}
                dead={statuses[servant.id]?.dead}
                injured={statuses[servant.id]?.injured}
                winner={winners.has(servant.id) && !deaths.has(servant.id) && !isNightfall}
                onClick={() => onSelectServant(servant)}
                showCaption
                className={deaths.has(servant.id) ? 'hgd-fall' : undefined}
              />
              {role === 'ally' && (
                <span className="self-start rounded bg-surface-2 px-1 text-[10px] text-muted" aria-hidden="true">
                  ally
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Sentence */}
      <div className="mt-6 w-full max-w-[620px] px-1 text-center">
        <div className="font-body text-[17px] leading-relaxed text-ink sm:text-[19px]">
          {typing ? (
            <TypewriterTokens
              tokens={event.tokens}
              onRevealChange={onRevealChange}
              onNameClick={(id) => {
                const servant = byId.get(id);
                if (servant) onSelectServant(servant);
              }}
            />
          ) : (
            <TokenText
              tokens={event.tokens}
              onNameClick={(id) => {
                const servant = byId.get(id);
                if (servant) onSelectServant(servant);
              }}
            />
          )}
        </div>
        {event.narration && event.narration.length > 0 && (
          <p className="mt-2 text-[13px] italic text-muted">
            <TokenText tokens={event.narration} />
          </p>
        )}
        {prevEvent && (
          <p className="mt-3 text-[12px] text-muted">
            <span className="uppercase tracking-wide">Previously:</span>{' '}
            <TokenText tokens={prevEvent.tokens} />
          </p>
        )}
      </div>

      {/* Why panel */}
      {event.explain && (
        <div className="mt-4 w-full max-w-[620px]">
          <button
            type="button"
            onClick={() => setShowWhy((v) => !v)}
            className="hgd-btn hgd-btn-ghost !min-h-[32px] !px-3 !text-[11px]"
            aria-expanded={showWhy}
          >
            {showWhy ? 'Hide' : 'Why?'}
          </button>
          {showWhy && (
            <div className="hgd-card mt-2 p-3 text-left text-[12px]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-gold">
                  {event.explain.a}: <span className="font-bold">{event.explain.ea}</span>
                </span>
                <span className="text-muted">vs</span>
                <span className="text-gold">
                  {event.explain.b}: <span className="font-bold">{event.explain.eb}</span>
                </span>
              </div>
              {event.explain.modifiers.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-muted">
                  {event.explain.modifiers
                    .filter((m) => m.value !== 0 || m.label.includes('Tier'))
                    .map((modifier, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="truncate">{modifier.label}</span>
                        <span className={modifier.value > 0 ? 'text-[var(--success)]' : modifier.value < 0 ? 'text-crimson' : 'text-muted'}>
                          {modifier.value > 0 ? '+' : ''}
                          {modifier.value}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
              <p className="mt-2 border-t border-border pt-2 text-ink">{event.explain.result}</p>
            </div>
          )}
        </div>
      )}

      {/* Banners */}
      {event.banner && event.banner !== 'global' && (
        <div
          className="mt-4 w-full max-w-[620px] rounded-md px-3 py-2 text-center text-[13px] font-bold"
          style={{
            background: 'rgba(12,12,15,.6)',
            borderLeft: `3px solid ${BANNER_STYLE[event.banner].color}`,
            color: BANNER_STYLE[event.banner].color,
          }}
        >
          {event.banner === 'death'
            ? `☠ ${event.deaths.length} Servant${event.deaths.length === 1 ? '' : 's'} fell. ${day.remaining.length} remain.`
            : BANNER_STYLE[event.banner].label}
        </div>
      )}
    </div>
  );
}
