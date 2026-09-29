import { clsx } from 'clsx';
import type { ArenaMatch, Servant } from '@hgd/shared';
import { CLASS_META } from '@hgd/shared';
import { portraitFor } from '../lib/portrait';

function MatchCard({
  match,
  servants,
  current,
  onPick,
  canPick,
}: {
  match: ArenaMatch;
  servants: Servant[];
  current: boolean;
  onPick?: (servantId: string) => void;
  canPick?: boolean;
}) {
  const nameOf = (id?: string) => servants.find((s) => s.id === id)?.character.name ?? 'TBD';
  const clsOf = (id?: string) => servants.find((s) => s.id === id)?.cls;

  const side = (id: string | undefined, votes: number, isWinner: boolean) => (
    <div
      className={clsx(
        'flex items-center gap-2 rounded px-2 py-1.5',
        isWinner ? 'bg-[rgba(201,164,92,.14)]' : 'bg-surface-2',
      )}
    >
      <span
        className="h-6 w-6 shrink-0 rounded object-cover"
        style={{
          backgroundImage: `url(${portraitFor(servants.find((s) => s.id === id)?.character, nameOf(id))})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          borderLeft: clsOf(id) ? `2px solid ${CLASS_META[clsOf(id)!].color}` : undefined,
        }}
        aria-hidden="true"
      />
      <span className={clsx('min-w-0 flex-1 truncate text-[12px]', isWinner ? 'text-gold' : 'text-ink')}>
        {id ? nameOf(id) : '—'}
      </span>
      {match.bye === id && <span className="text-[10px] uppercase text-muted">bye</span>}
      {votes > 0 && <span className="text-[11px] text-gold">{votes}</span>}
      {canPick && id && !match.winner && (
        <button
          type="button"
          className="hgd-btn hgd-btn-ghost !min-h-[26px] !px-2 !text-[10px]"
          onClick={() => onPick?.(id)}
        >
          Wins
        </button>
      )}
    </div>
  );

  return (
    <div
      className={clsx('hgd-card space-y-1 p-2', current && 'outline outline-1 outline-gold')}
      style={current ? { borderColor: 'var(--gold)' } : undefined}
    >
      {side(match.a, match.votesA, match.winner === match.a)}
      {side(match.b, match.votesB, match.winner === match.b)}
      {match.tieBroken && (
        <p className="px-2 text-[10px] uppercase tracking-wide text-muted">tie-break: {match.tieBroken}</p>
      )}
    </div>
  );
}

export function BracketView({
  bracket,
  servants,
  currentMatchId,
  onPick,
  canPick,
}: {
  bracket: ArenaMatch[];
  servants: Servant[];
  currentMatchId?: string;
  onPick?: (servantId: string) => void;
  canPick?: boolean;
}) {
  const rounds = [...new Set(bracket.map((m) => m.round))].sort((a, b) => a - b);
  const total = rounds.length;

  return (
    <div className="hgd-scroll flex gap-3 overflow-x-auto pb-2">
      {rounds.map((round) => {
        const matches = bracket.filter((m) => m.round === round).sort((a, b) => a.slot - b.slot);
        const fromEnd = total - round;
        const label = fromEnd <= 0 ? 'Final' : fromEnd === 1 ? 'Semifinals' : fromEnd === 2 ? 'Quarterfinals' : `Round ${round}`;
        return (
          <div key={round} className="min-w-[190px] flex-1 space-y-2">
            <h3 className="text-center text-[10.5px] uppercase tracking-wide text-muted">{label}</h3>
            {matches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                servants={servants}
                current={match.id === currentMatchId}
                onPick={onPick}
                canPick={canPick}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
