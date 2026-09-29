import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { CLASS_META, enabledClasses, type Character, type SearchCandidate, type ServantClass } from '@hgd/shared';
import { ClassBadge, Modal, Portrait, StickyHeader } from '../components/ui';
import { CharacterSearch } from '../components/CharacterSearch';
import { ImagePickerModal } from '../components/ImagePickerModal';
import { useStore } from '../store';

function Countdown({ endsAt }: { endsAt?: number }) {
  const skew = useStore((s) => s.serverSkewMs);
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + skew), 500);
    return () => clearInterval(timer);
  }, [skew]);
  if (!endsAt) return null;
  const remaining = Math.max(0, endsAt - now);
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return (
    <span className={clsx('font-body text-[13px]', remaining < 30000 ? 'text-crimson' : 'text-gold')}>
      {minutes}:{String(seconds).padStart(2, '0')}
    </span>
  );
}

export default function Draft() {
  const room = useStore((s) => s.room)!;
  const playerId = useStore((s) => s.playerId);
  const pick = useStore((s) => s.pick);
  const clearSlot = useStore((s) => s.clearSlot);
  const setImage = useStore((s) => s.setImage);
  const lock = useStore((s) => s.lock);
  const unlock = useStore((s) => s.unlock);
  const beginSummon = useStore((s) => s.beginSummon);
  const slotError = useStore((s) => s.slotError);
  const [imageFor, setImageFor] = useState<ServantClass | null>(null);
  const [infoFor, setInfoFor] = useState<ServantClass | null>(null);

  const me = room.players.find((p) => p.id === playerId);
  const isHost = room.hostId === playerId;
  const classes = enabledClasses(room.settings.classes);
  const myPicks = (room.myPicks ?? {}) as Partial<Record<ServantClass, Character>>;
  const filled = classes.filter((cls) => myPicks[cls]).length;
  const allLocked = room.players.filter((p) => !p.isSpectator).every((p) => p.locked);

  const handleSelect = (cls: ServantClass, candidate: SearchCandidate) => pick(cls, { candidate });
  const handleCustom = (cls: ServantClass, name: string) => pick(cls, { customName: name });

  return (
    <div className="min-h-screen">
      <StickyHeader right={<Countdown endsAt={room.draftEndsAt} />} />

      <div className="mx-auto max-w-5xl px-4 py-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="hgd-heading text-xl">Draft</h1>
            <p className="text-[12px] text-muted">
              One character for each of the {classes.length} classes in play. Any character can go in any class.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-muted">
              <span className="text-gold">{filled}</span> / {classes.length} slots filled
            </span>
            <div className="flex items-center gap-1.5">
              {room.players
                .filter((p) => !p.isSpectator)
                .map((player) => (
                  <span
                    key={player.id}
                    title={`${player.nickname}: ${player.locked ? 'locked in' : 'drafting'}`}
                    className={clsx(
                      'flex h-7 items-center gap-1 rounded-full border px-2 text-[11px]',
                      player.locked ? 'border-[var(--success)] text-[var(--success)]' : 'border-border text-muted',
                    )}
                  >
                    {player.locked ? '✓' : '…'} {player.nickname.slice(0, 8)}
                  </span>
                ))}
            </div>
          </div>
        </div>

        {slotError && (
          <div className="mb-3 rounded-lg border border-crimson bg-[rgba(179,40,61,.12)] px-3 py-2 text-[12px] text-ink">
            {slotError.message}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((cls) => {
            const character = myPicks[cls];
            const meta = CLASS_META[cls];
            const error = slotError?.cls === cls ? slotError.message : null;
            return (
              <article
                key={cls}
                className="hgd-card flex flex-col p-3"
                style={{ borderTop: `3px solid ${meta.color}` }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[22px]" aria-hidden="true">
                    {meta.icon}
                  </span>
                  <ClassBadge cls={cls} />
                  <button
                    type="button"
                    onClick={() => setInfoFor(cls)}
                    aria-label={`What is a ${meta.label}?`}
                    title={`What is a ${meta.label}?`}
                    className="ml-auto flex h-[24px] w-[24px] items-center justify-center rounded-full border border-border text-[12px] font-bold text-muted transition-colors hover:border-gold hover:text-gold"
                  >
                    ?
                  </button>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-snug text-muted">{meta.flavor}</p>

                {character ? (
                  <div className="mt-3 flex gap-3">
                    <Portrait
                      src={character.imageUrl}
                      name={character.name}
                      cls={cls}
                      size={72}
                      showCaption={false}
                      fallback={character.imageCandidates?.[0]}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-gold" title={character.name}>
                        {character.name}
                      </p>
                      <p className="truncate text-[11px] text-muted">{character.source}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="hgd-btn hgd-btn-ghost !min-h-[30px] !px-2 !text-[10px]"
                          disabled={me?.locked}
                          onClick={() => setImageFor(cls)}
                        >
                          Change Picture
                        </button>
                        <button
                          type="button"
                          className="hgd-btn hgd-btn-ghost !min-h-[30px] !px-2 !text-[10px]"
                          disabled={me?.locked}
                          onClick={() => clearSlot(cls)}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3">
                    <CharacterSearch
                      placeholder={`Search a ${meta.label}…`}
                      disabled={me?.locked}
                      onSelect={(candidate) => handleSelect(cls, candidate)}
                      onCustom={(name) => handleCustom(cls, name)}
                    />
                  </div>
                )}

                {error && <p className="mt-2 text-[11px] text-crimson">{error}</p>}
              </article>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col items-center gap-2">
          {me?.locked ? (
            <>
              <p className="text-[13px] text-[var(--success)]">Locked in. Waiting for the rest of the room.</p>
              <button
                type="button"
                className="hgd-btn hgd-btn-secondary"
                onClick={unlock}
                disabled={!allLocked && false}
              >
                Unlock
              </button>
            </>
          ) : (
            <button
              type="button"
              className="hgd-btn hgd-btn-primary"
              disabled={filled < classes.length}
              onClick={lock}
            >
              Lock In {filled < classes.length ? `(${filled}/${classes.length})` : ''}
            </button>
          )}

          {isHost && (
            <button
              type="button"
              className="hgd-btn hgd-btn-secondary"
              disabled={!allLocked}
              title={allLocked ? undefined : 'Everyone must lock in first'}
              onClick={beginSummon}
            >
              Begin Summoning
            </button>
          )}
          {!allLocked && <p className="text-[11px] text-muted">The host can begin once every Master has locked in.</p>}
        </div>
      </div>

      {infoFor && (
        <Modal title={`${CLASS_META[infoFor].icon} ${CLASS_META[infoFor].label}`} onClose={() => setInfoFor(null)}>
          <p className="text-[13px] leading-relaxed text-muted">{CLASS_META[infoFor].flavor}</p>
          <p className="mt-3">{CLASS_META[infoFor].description}</p>
          <p className="mt-3 text-[11.5px] text-muted">
            Any character can be drafted into any class — the class decides how they fight, not who they are.
          </p>
        </Modal>
      )}

      {imageFor && (
        <ImagePickerModal
          name={myPicks[imageFor]?.name ?? 'this Servant'}
          candidates={myPicks[imageFor]?.imageCandidates ?? []}
          onChoose={(url) => {
            setImage(imageFor, url);
            setImageFor(null);
          }}
          onClose={() => setImageFor(null)}
        />
      )}
    </div>
  );
}
