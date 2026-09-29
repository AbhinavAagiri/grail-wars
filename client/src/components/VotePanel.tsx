import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import type { ArenaMatch, Servant } from '@hgd/shared';
import { ClassBadge } from './ui';

export function VotePanel({
  match,
  servants,
  phase,
  myVote,
  onVote,
  canVote,
  reveal,
  myPlayerId,
}: {
  match: ArenaMatch;
  servants: Servant[];
  phase: string;
  myVote?: 'a' | 'b';
  onVote: (choice: 'a' | 'b') => void;
  canVote: boolean;
  reveal?: { a: number; b: number };
  myPlayerId?: string | null;
}) {
  const a = servants.find((s) => s.id === match.a);
  const b = servants.find((s) => s.id === match.b);
  const voting = phase === 'VOTE';
  const revealed = phase === 'REVEAL' || Boolean(reveal);

  const counts = reveal ?? { a: match.votesA, b: match.votesB };
  const total = Math.max(1, counts.a + counts.b);

  const votersFor = (choice: 'a' | 'b') => match.voters.filter((v) => v.choice === choice);

  const side = (servant: Servant | undefined, choice: 'a' | 'b', votes: number) => {
    if (!servant) return null;
    const isWinner = revealed && match.winner === servant.id;
    const mine = myVote === choice;
    return (
      <div className={clsx('flex-1', !revealed && 'space-y-2')}>
        <button
          type="button"
          onClick={() => voting && canVote && onVote(choice)}
          disabled={!voting || !canVote}
          className={clsx(
            'hgd-card hgd-card-interactive w-full p-3 text-center transition-all',
            mine && voting && 'outline outline-2 outline-gold',
            isWinner && 'border-gold',
          )}
          style={isWinner ? { borderColor: 'var(--gold)', boxShadow: '0 0 24px rgba(201,164,92,.3)' } : undefined}
        >
          <img
            src={servant.character.imageUrl}
            alt={`Portrait of ${servant.character.name}`}
            loading="lazy"
            className={clsx(
              'mx-auto h-20 w-20 rounded object-cover sm:h-24 sm:w-24',
              revealed && !isWinner && 'hgd-fallen',
            )}
          />
          <p className={clsx('mt-2 text-[13px] font-bold', isWinner ? 'text-gold' : 'text-ink')}>
            {servant.character.name}
          </p>
          <p className="truncate text-[11px] text-muted">{servant.character.source}</p>
          <ClassBadge cls={servant.cls} className="mt-1" />
          {servant.profile && (
            <p className="mt-1 text-[11px] text-muted">
              Tier <span className="text-gold">{servant.profile.tierPeak}</span> · Oracle{' '}
              <span className="text-gold">{servant.profile.baseScore.toFixed(1)}</span>
            </p>
          )}
          {voting && canVote && <p className="mt-2 text-[11px] text-gold">{mine ? 'Your vote' : 'Vote for this Servant'}</p>}
          {!canVote && voting && <p className="mt-2 text-[11px] text-muted">You cannot vote in this match</p>}
        </button>

        {revealed && (
          <div className="mt-2">
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(votes / total) * 100}%` }}
                transition={{ duration: 0.6 }}
                className="h-full rounded-full"
                style={{ background: isWinner ? 'var(--gold)' : 'var(--gold-dark)' }}
              />
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              <span className="text-[11px] text-gold">{votes} vote{votes === 1 ? '' : 's'}</span>
              {votersFor(choice).map((voter) => (
                <span
                  key={voter.voterId}
                  className={clsx('rounded bg-surface-2 px-1 text-[10px]', voter.voterId === myPlayerId && 'text-gold')}
                >
                  {voter.nickname}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex items-stretch gap-3">
      {side(a, 'a', counts.a)}
      <div className="flex items-center">
        <span className="font-display text-xl text-gold">VS</span>
      </div>
      {side(b, 'b', counts.b)}
    </div>
  );
}
