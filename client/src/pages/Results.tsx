import { useMemo, useRef, useState } from 'react';
import { CLASSES, CLASS_META, type Servant } from '@hgd/shared';
import { ClassBadge, Portrait, StickyHeader, SummoningCircle } from '../components/ui';
import { BracketView } from '../components/BracketView';
import { ServantCard, computeStatuses } from '../components/ServantCard';
import { useStore } from '../store';

interface Standing {
  servant: Servant;
  kills: number;
  diedOnDay?: number;
  place: number;
}

export default function Results() {
  const room = useStore((s) => s.room)!;
  const playerId = useStore((s) => s.playerId);
  const rematch = useStore((s) => s.rematch);
  const toLobby = useStore((s) => s.toLobby);
  const pushToast = useStore((s) => s.pushToast);

  const [selected, setSelected] = useState<Servant | null>(null);
  const [showThrone, setShowThrone] = useState(false);
  const recapRef = useRef<HTMLDivElement>(null);

  const servants = room.servants ?? [];
  const timeline = room.timeline;
  const isHost = room.hostId === playerId;

  const standings = useMemo<Standing[]>(() => {
    const events = timeline?.days.flatMap((d) => d.events) ?? [];
    const statuses = computeStatuses(servants, events);
    const diedOn = new Map<string, number>();
    for (const day of timeline?.days ?? []) {
      for (const id of day.fallen) diedOn.set(id, day.day);
    }
    const rows = servants.map((servant) => ({
      servant,
      kills: statuses[servant.id]?.kills ?? 0,
      diedOnDay: diedOn.get(servant.id),
    }));
    rows.sort((a, b) => {
      const aAlive = a.servant.id === room.winnerId ? 1 : 0;
      const bAlive = b.servant.id === room.winnerId ? 1 : 0;
      if (aAlive !== bAlive) return bAlive - aAlive;
      if ((b.diedOnDay ?? 0) !== (a.diedOnDay ?? 0)) return (b.diedOnDay ?? 0) - (a.diedOnDay ?? 0);
      return b.kills - a.kills;
    });
    return rows.map((row, i) => ({ ...row, place: i + 1 }));
  }, [servants, timeline, room.winnerId]);

  const winner = servants.find((s) => s.id === room.winnerId);
  const isWar = room.settings.mode === 'WAR';
  const mostDangerous = [...standings].sort((a, b) => b.kills - a.kills)[0];
  const arena = room.arena;
  const arenaMatches = arena?.bracket ?? [];
  const arenaFights = arenaMatches.filter((match) => !match.bye).length;
  const arenaVotes = arenaMatches.reduce((total, match) => total + match.voters.length, 0);

  const downloadRecap = async () => {
    try {
      const { toPng } = await import('html-to-image');
      if (!recapRef.current) return;
      const dataUrl = await toPng(recapRef.current, { backgroundColor: '#121216', pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `holy-grail-war-${room.code}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      pushToast({ kind: 'warn', message: 'Could not generate the recap image.' });
    }
  };

  return (
    <div className="relative min-h-screen">
      <StickyHeader />
      <SummoningCircle size={700} className="left-1/2 top-[-240px] -translate-x-1/2" />

      <div ref={recapRef} className="relative mx-auto max-w-3xl px-4 py-8">
        {winner ? (
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-[0.3em] text-muted">
              {isWar ? 'Victor of the Grail' : 'Champion of the Arena'}
            </p>
            <img
              src={winner.character.imageUrl}
              alt={`Portrait of ${winner.character.name}`}
              className="mx-auto mt-4 h-40 w-40 rounded object-cover sm:h-48 sm:w-48"
              style={{ border: '3px solid var(--gold)', boxShadow: '0 0 60px rgba(201,164,92,.5)' }}
            />
            <h1 className="hgd-heading mt-4 text-3xl sm:text-4xl">{winner.character.name}</h1>
            <p className="mt-1 text-[13px] text-muted">
              Master: <span className="text-gold">{winner.masterName}</span>
            </p>
            <div className="mt-2 flex items-center justify-center gap-2">
              <ClassBadge cls={winner.cls} />
              <span className="text-[11.5px] text-muted">{winner.character.source}</span>
            </div>
            {room.wish && <p className="mx-auto mt-4 max-w-md text-[14px] italic text-ink">{room.wish}</p>}
          </div>
        ) : (
          <h1 className="hgd-heading text-center text-2xl">
            {isWar ? 'The war is over' : 'The arena has no champion yet'}
          </h1>
        )}

        {isWar ? (
        <section className="mt-8">
          <h2 className="hgd-heading mb-2 text-[13px] uppercase tracking-wide">Final standings</h2>
          <ul className="space-y-1.5">
            {standings.map((row) => (
              <li
                key={row.servant.id}
                className="hgd-card flex items-center gap-3 p-2"
                style={row.servant.id === room.winnerId ? { borderColor: 'var(--gold)' } : undefined}
              >
                <span className="w-6 text-center font-display text-[15px] text-muted">{row.place}</span>
                <img
                  src={row.servant.character.imageUrl}
                  alt={`Portrait of ${row.servant.character.name}`}
                  loading="lazy"
                  className={`h-10 w-10 rounded object-cover ${row.diedOnDay ? 'hgd-fallen' : ''}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-ink">{row.servant.character.name}</p>
                  <p className="text-[11px] text-muted">
                    {CLASS_META[row.servant.cls].label} · {row.servant.masterName}
                  </p>
                </div>
                <div className="shrink-0 text-right text-[11px]">
                  <p className="text-gold">{row.kills} kill{row.kills === 1 ? '' : 's'}</p>
                  <p className="text-muted">{row.diedOnDay ? `fell day ${row.diedOnDay}` : 'survived'}</p>
                </div>
                <button
                  type="button"
                  className="hgd-btn hgd-btn-ghost !min-h-[30px] !px-2 !text-[11px]"
                  onClick={() => setSelected(row.servant)}
                >
                  Details
                </button>
              </li>
            ))}
          </ul>
        </section>
        ) : (
          <section className="mt-8">
            <h2 className="hgd-heading mb-2 text-[13px] uppercase tracking-wide">The bracket</h2>
            <BracketView bracket={arenaMatches} servants={servants} totalRounds={arena?.totalRounds} />
          </section>
        )}

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="hgd-card p-3 text-center">
            <p className="text-[10.5px] uppercase tracking-wide text-muted">
              {isWar ? 'Most dangerous' : 'Fights'}
            </p>
            {isWar ? (
              <>
                <p className="mt-1 truncate text-[13px] text-gold">{mostDangerous?.servant.character.name ?? '—'}</p>
                <p className="text-[11px] text-muted">{mostDangerous?.kills ?? 0} kills</p>
              </>
            ) : (
              <>
                <p className="mt-1 text-[13px] text-gold">{arenaFights}</p>
                <p className="text-[11px] text-muted">decided by vote</p>
              </>
            )}
          </div>
          <div className="hgd-card p-3 text-center">
            <p className="text-[10.5px] uppercase tracking-wide text-muted">{isWar ? 'Days' : 'Rounds'}</p>
            <p className="mt-1 text-[13px] text-gold">
              {isWar ? (timeline?.days.length ?? 0) : (arena?.totalRounds ?? 0)}
            </p>
            <p className="text-[11px] text-muted">{isWar ? 'war length' : 'arena rounds'}</p>
          </div>
          <div className="hgd-card p-3 text-center">
            <p className="text-[10.5px] uppercase tracking-wide text-muted">{isWar ? 'War seed' : 'Votes cast'}</p>
            <p className="mt-1 text-[13px] text-gold">
              {isWar ? (timeline ? timeline.seed.toString(16).toUpperCase() : '—') : arenaVotes}
            </p>
            <p className="text-[11px] text-muted">{isWar ? 'reproducible' : 'across the bracket'}</p>
          </div>
        </section>

        <section className="mt-6">
          <button
            type="button"
            className="hgd-btn hgd-btn-ghost w-full"
            onClick={() => setShowThrone((v) => !v)}
          >
            {showThrone ? 'Hide' : 'Show'} the Throne of Heroes ({room.unsummoned?.length ?? 0})
          </button>
          {showThrone && (
            <div className="hgd-card mt-2 p-3">
              <p className="mb-2 text-[11.5px] text-muted">
                Every pick that was not summoned this time. They watched from the Throne.
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {(room.unsummoned ?? []).map((character) => (
                  <div key={`${character.key}-${character.submittedBy}`} className="text-center">
                    <img
                      src={character.imageUrl}
                      alt={`Portrait of ${character.name}`}
                      loading="lazy"
                      className="hgd-fallen mx-auto aspect-square w-full rounded object-cover"
                    />
                    <p className="mt-1 truncate text-[10.5px] text-muted" title={character.name}>
                      {character.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2 px-4 pb-2">
        {isHost && (
          <>
            <button type="button" className="hgd-btn hgd-btn-primary" onClick={rematch}>
              Rematch (same roster)
            </button>
            <button type="button" className="hgd-btn hgd-btn-secondary" onClick={toLobby}>
              Back to Lobby
            </button>
          </>
        )}
        <button type="button" className="hgd-btn hgd-btn-ghost" onClick={downloadRecap}>
          Download recap image
        </button>
      </div>

      {selected && (
        <ServantCard
          servant={selected}
          status={computeStatuses(servants, timeline?.days.flatMap((d) => d.events) ?? [])[selected.id]}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
