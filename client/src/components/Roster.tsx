import { clsx } from 'clsx';
import { CLASSES, CLASS_META, type Servant, type ServantClass } from '@hgd/shared';
import { ClassBadge, Portrait } from './ui';
import type { ServantStatus } from './ServantCard';

export function Roster({
  servants,
  statuses,
  myServantId,
  onSelect,
  compact = false,
}: {
  servants: Servant[];
  statuses: Record<string, ServantStatus>;
  myServantId?: string;
  onSelect: (servant: Servant) => void;
  compact?: boolean;
}) {
  const ordered = [...servants].sort((a, b) => {
    const ai = CLASSES.indexOf(a.cls as ServantClass);
    const bi = CLASSES.indexOf(b.cls as ServantClass);
    if (ai !== bi) return ai - bi;
    return a.character.name.localeCompare(b.character.name);
  });

  return (
    <div className={clsx('hgd-scroll', compact ? 'flex gap-2 overflow-x-auto pb-1' : 'space-y-2 overflow-y-auto pr-1')}>
      {ordered.map((servant) => {
        const status = statuses[servant.id] ?? { dead: false, injured: 0, kills: 0 };
        const mine = servant.id === myServantId;
        return (
          <button
            key={servant.id}
            type="button"
            onClick={() => onSelect(servant)}
            className={clsx(
              'hgd-card hgd-card-interactive flex w-full items-center gap-2 p-2 text-left',
              compact && 'w-[190px] shrink-0',
              status.dead && 'hgd-fall',
              mine && 'outline outline-1 outline-gold',
            )}
            style={mine ? { borderColor: 'var(--gold)' } : undefined}
          >
            <div className="relative shrink-0">
              <Portrait
                src={servant.character.imageUrl}
                name={servant.character.name}
                cls={servant.cls}
                dead={status.dead}
                injured={status.injured}
                size={44}
                showCaption={false}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span
                  className={clsx('truncate text-[13px] font-bold', status.dead ? 'text-muted line-through' : 'text-gold')}
                  title={servant.character.name}
                >
                  {servant.character.name}
                </span>
                {mine && (
                  <span className="shrink-0 rounded bg-gold px-1 text-[9px] font-black text-[#1a1408]">YOU</span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <ClassBadge cls={servant.cls} className="!text-[10px] !px-1.5" />
                <span className="truncate text-[10px] text-muted">Master: {servant.masterName}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[10px]">
                {status.dead ? (
                  <span className="text-crimson">💀 Fallen{status.diedOnDay ? ` on Day ${status.diedOnDay}` : ''}</span>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1 text-muted">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--success)' }} />
                      alive
                    </span>
                    {status.injured > 0 && (
                      <span className="text-crimson" title={`${status.injured} injuries`}>
                        🩹{' '}
                        {Array.from({ length: status.injured }, (_, i) => (
                          <span key={i}>▪</span>
                        ))}
                      </span>
                    )}
                    {status.kills > 0 && <span className="text-gold">{status.kills} kill{status.kills === 1 ? '' : 's'}</span>}
                  </>
                )}
              </div>
            </div>
            <span className="shrink-0 text-[16px]" title={CLASS_META[servant.cls].label} aria-hidden="true">
              {CLASS_META[servant.cls].icon}
            </span>
          </button>
        );
      })}
    </div>
  );
}
