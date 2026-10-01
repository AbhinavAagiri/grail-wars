import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CLASS_META, LIMITS, enabledClasses, type Servant } from '@hgd/shared';
import { ClassBadge, Portrait, StickyHeader, SummoningCircle, TierBadge } from '../components/ui';
import { ServantCard } from '../components/ServantCard';
import { useStore } from '../store';

export default function Summon() {
  const room = useStore((s) => s.room)!;
  const playerId = useStore((s) => s.playerId);
  const startResearch = useStore((s) => s.startResearch);
  const startArena = useStore((s) => s.startArena);

  const servants: Servant[] = room.servants ?? [];
  const [revealed, setRevealed] = useState(0);
  const [selected, setSelected] = useState<Servant | null>(null);
  const isHost = room.hostId === playerId;

  // Reveal one card at a time.
  useEffect(() => {
    if (revealed >= servants.length) return;
    const timer = setTimeout(() => setRevealed((r) => r + 1), revealed === 0 ? 2200 : 900);
    return () => clearTimeout(timer);
  }, [revealed, servants.length]);

  const allRevealed = revealed >= servants.length && servants.length > 0;
  const mine = servants.find((s) => s.playerId === playerId);

  const continueTo = () => {
    if (room.settings.mode === 'WAR') startResearch();
    else if (room.settings.debate.showOracleCards) startResearch();
    else startArena();
  };

  // The Arena's floor: with two Masters every match is fought by the only two
  // voters, so there is no third ballot to break a tie.
  const arenaBlocked = room.settings.mode === 'DEBATE' && servants.length < LIMITS.DEBATE_MIN_PLAYERS;

  return (
    <div className="relative min-h-screen">
      <StickyHeader />
      <SummoningCircle size={760} className="left-1/2 top-[-220px] -translate-x-1/2" />

      <div className="relative mx-auto max-w-5xl px-4 py-6">
        <div className="text-center">
          <h1 className="hgd-heading text-2xl sm:text-3xl">The Summoning</h1>
          <p className="mt-1 text-[13px] text-muted">
            {enabledClasses(room.settings.classes).length} classes, {servants.length} Masters, one Grail.
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {servants.map((servant, index) => {
            const isMine = servant.id === mine?.id;
            const shown = index < revealed;
            return (
              <div key={servant.id} className="hgd-card p-3" style={isMine ? { borderColor: 'var(--gold)' } : undefined}>
                {!shown ? (
                  <div className="flex h-[168px] items-center justify-center rounded-lg border border-dashed border-border bg-surface-2">
                    <span className="text-[28px] opacity-40" aria-hidden="true">
                      ✦
                    </span>
                  </div>
                ) : (
                  <motion.div
                    initial={{ rotateY: 90, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    transition={{ duration: 0.45 }}
                    className="flex gap-3"
                  >
                    <Portrait
                      src={servant.character.imageUrl}
                      name={servant.character.name}
                      cls={servant.cls}
                      size={92}
                      showCaption={false}
                      onClick={() => setSelected(servant)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ClassBadge cls={servant.cls} />
                        {isMine && (
                          <span className="rounded bg-gold px-1.5 text-[9px] font-black uppercase text-[#1a1408]">
                            Your Servant
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate font-bold text-gold" title={servant.character.name}>
                        {servant.character.name}
                      </p>
                      <p className="truncate text-[11.5px] text-muted">{servant.character.source}</p>
                      {servant.profile && <TierBadge tier={servant.profile.tierPeak} className="mt-1" />}
                      <p className="mt-1.5 text-[12px] text-ink">
                        <span className="text-gold">{servant.masterName}</span> summons{' '}
                        <span className="text-gold">{servant.character.name}</span>, the{' '}
                        <span style={{ color: CLASS_META[servant.cls].color }}>{CLASS_META[servant.cls].label}</span>!
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>

        {allRevealed && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6 text-center">
            {mine && (
              <div className="hgd-card mx-auto max-w-md p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Your Servant</p>
                <p className="mt-1 font-display text-lg text-gold">{mine.character.name}</p>
                <p className="text-[12px] text-muted">
                  {CLASS_META[mine.cls].label} · {mine.character.source}
                </p>
              </div>
            )}

            <div className="mt-4">
              {isHost ? (
                <button
                  type="button"
                  className="hgd-btn hgd-btn-primary"
                  onClick={continueTo}
                  disabled={arenaBlocked}
                >
                  Continue
                </button>
              ) : (
                <p className="text-[13px] text-muted">Waiting for the host…</p>
              )}
              {arenaBlocked && (
                <p className="mt-2 text-[12px] text-gold">
                  The Debate Arena needs at least {LIMITS.DEBATE_MIN_PLAYERS} Masters — this room has{' '}
                  {servants.length}.
                </p>
              )}
            </div>
          </motion.div>
        )}

        <div className="mt-6">
          <h2 className="hgd-heading text-center text-[13px] opacity-70">The Throne of Heroes</h2>
          <p className="mt-1 text-center text-[11px] text-muted">
            {room.unsummoned?.length ?? 0} picks went unsummoned this time.
          </p>
        </div>
      </div>

      {selected && <ServantCard servant={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
