import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import type { Servant, WarEvent } from '@hgd/shared';
import { StickyHeader, TopBanner } from '../components/ui';
import { EventStage } from '../components/EventStage';
import { Roster } from '../components/Roster';
import { ServantCard, computeStatuses } from '../components/ServantCard';
import { TokenText } from '../components/ServantCard';
import { useStore } from '../store';

const SPEEDS = [
  { value: 0, label: 'Manual' },
  { value: 4000, label: '4 s' },
  { value: 7000, label: '7 s' },
  { value: 10000, label: '10 s' },
  { value: 15000, label: '15 s' },
];

export default function War() {
  const room = useStore((s) => s.room)!;
  const playerId = useStore((s) => s.playerId);
  const warEvent = useStore((s) => s.warEvent);
  const dayEnd = useStore((s) => s.dayEnd);
  const warControl = useStore((s) => s.warControl);

  const [selected, setSelected] = useState<Servant | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [typingId, setTypingId] = useState<string | null>(null);
  const lastIdRef = useRef<string | null>(null);
  // True while the event's line is still being typed out. The typewriter owns
  // the Space key until it is done, so one press never skips the text *and*
  // toggles playback at the same time.
  const revealingRef = useRef(false);
  const handleRevealChange = useCallback((revealing: boolean) => {
    revealingRef.current = revealing;
  }, []);

  const timeline = room.timeline;
  const cursor = room.cursor;
  const servants = room.servants ?? [];
  const isHost = room.hostId === playerId;

  const days = timeline?.days ?? [];
  const currentDay = useMemo(() => {
    if (!days.length || !cursor) return undefined;
    return days.find((d) => d.day === cursor.dayIndex + 1) ?? days[Math.min(cursor.dayIndex, days.length - 1)];
  }, [days, cursor]);

  const event: WarEvent | undefined = useMemo(() => {
    if (warEvent) return warEvent;
    if (!currentDay || !cursor) return undefined;
    return currentDay.events[cursor.eventIndex] ?? currentDay.events[currentDay.events.length - 1];
  }, [warEvent, currentDay, cursor]);

  const allEvents = useMemo(() => days.flatMap((d) => d.events), [days]);
  const statuses = useMemo(() => computeStatuses(servants, allEvents), [servants, allEvents]);
  const statusesWithDays = useMemo(() => {
    const out = { ...statuses };
    for (const day of days) {
      for (const id of day.fallen) {
        if (out[id]) out[id] = { ...out[id], dead: true, diedOnDay: day.day };
      }
    }
    return out;
  }, [statuses, days]);

  // Typewriter only for events we have not shown yet.
  useEffect(() => {
    if (!event) return;
    if (lastIdRef.current !== event.id) {
      lastIdRef.current = event.id;
      revealingRef.current = false;
      setTypingId(event.id);
    }
  }, [event]);

  const myServant = servants.find((s) => s.playerId === playerId);
  const totalEvents = days.reduce((sum, d) => sum + d.events.length, 0);
  const shownEvents = days
    .filter((d) => !currentDay || d.day <= currentDay.day)
    .reduce((sum, d) => sum + d.events.length, 0);

  // Keyboard shortcuts for the host.
  useEffect(() => {
    if (!isHost) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.code === 'ArrowRight') warControl('next');
      else if (e.code === 'ArrowLeft') warControl('prev');
      else if (e.code === 'Space') {
        e.preventDefault();
        // Space finishes the line while it is typing; only once the whole line
        // is on screen does it mean play/pause.
        if (revealingRef.current) return;
        warControl(cursor?.playing ? 'pause' : 'play');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isHost, warControl, cursor?.playing]);

  if (!timeline || !cursor || !event) {
    return (
      <div className="relative min-h-screen">
        <StickyHeader />
        <p className="p-8 text-center text-muted">Preparing the war…</p>
      </div>
    );
  }

  const past = allEvents.slice(0, Math.max(0, allEvents.findIndex((e) => e.id === event.id)));

  const controls = isHost ? (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button type="button" className="hgd-btn hgd-btn-ghost !min-h-[38px] !px-3" onClick={() => warControl('prev')} aria-label="Previous event">
        ◀ Prev
      </button>
      <button
        type="button"
        className="hgd-btn hgd-btn-primary !min-h-[38px] !px-4"
        onClick={() => warControl(cursor.playing ? 'pause' : 'play')}
        aria-label={cursor.playing ? 'Pause' : 'Play'}
      >
        {cursor.playing ? '⏸ Pause' : '▶ Play'}
      </button>
      <button type="button" className="hgd-btn hgd-btn-ghost !min-h-[38px] !px-3" onClick={() => warControl('next')} aria-label="Next event">
        Next ▶
      </button>
      <select
        className="hgd-input !min-h-[38px] !w-auto !py-1 !text-[12px]"
        value={cursor.speedMs}
        onChange={(e) => warControl('speed', Number(e.target.value))}
        aria-label="Playback speed"
      >
        {SPEEDS.map((speed) => (
          <option key={speed.value} value={speed.value}>
            {speed.label}
          </option>
        ))}
      </select>
    </div>
  ) : (
    <p className="text-center text-[12px] text-muted">Host controls the pace.</p>
  );

  return (
    <div className="min-h-screen pb-24 lg:pb-0">
      <TopBanner title="Holy Grail War" subtitle="Mock War of the Grail" />
      <StickyHeader right={<span className="text-[11px] text-muted">War #{timeline.seed.toString(16).toUpperCase()}</span>} />

      <div className="mx-auto max-w-6xl px-3 py-4 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-5">
        {/* Roster — sidebar on desktop, chip scroller on mobile */}
        <aside className="mb-4 lg:mb-0">
          <div className="mb-2 hidden items-center justify-between lg:flex">
            <h2 className="hgd-heading text-[13px] uppercase tracking-wide">Roster</h2>
            <span className="text-[11px] text-muted">{currentDay?.remaining.length ?? 0} alive</span>
          </div>
          <div className="lg:max-h-[70vh]">
            <Roster
              servants={servants}
              statuses={statusesWithDays}
              myServantId={myServant?.id}
              onSelect={setSelected}
              compact
            />
          </div>
          <div className="hidden lg:block">
            <Roster
              servants={servants}
              statuses={statusesWithDays}
              myServantId={myServant?.id}
              onSelect={setSelected}
            />
          </div>
        </aside>

        {/* Stage */}
        <main className="min-w-0">
          <div className="hgd-card min-h-[420px] px-3 py-5 sm:px-6">
            <EventStage
              day={currentDay!}
              event={event}
              servants={servants}
              statuses={statusesWithDays}
              onSelectServant={setSelected}
              typing={typingId === event.id}
              onRevealChange={handleRevealChange}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="hgd-btn hgd-btn-ghost !min-h-[36px] !px-3 !text-[11px]" onClick={() => setLogOpen((v) => !v)}>
              {logOpen ? 'Hide log' : 'Log'}
            </button>
            <span className="text-[11.5px] text-muted">
              Event {shownEvents} of {totalEvents} · Day {currentDay?.day} of {days.length}
            </span>
          </div>

          <div className="mt-3">{controls}</div>

          {/* Nightfall recap */}
          {dayEnd && dayEnd.day === currentDay?.day && (
            <div className="hgd-card mt-3 p-3">
              <h3 className="hgd-heading text-[13px] uppercase tracking-wide">
                Fallen on Day {dayEnd.day}
              </h3>
              {dayEnd.fallen.length === 0 ? (
                <p className="mt-1 text-[12.5px] text-muted">No one fell today.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-3">
                  {dayEnd.fallen.map((id) => {
                    const servant = servants.find((s) => s.id === id);
                    if (!servant) return null;
                    return (
                      <div key={id} className="hgd-fallen flex items-center gap-2">
                        <img
                          src={servant.character.imageUrl}
                          alt={`Portrait of ${servant.character.name}`}
                          loading="lazy"
                          className="h-12 w-12 rounded object-cover"
                        />
                        <div>
                          <p className="text-[12px] text-ink line-through">{servant.character.name}</p>
                          <p className="text-[10.5px] text-crimson">💀 Fallen</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="mt-2 text-[11.5px] text-muted">Remaining: {dayEnd.remaining.length}</p>
            </div>
          )}

          {/* Log drawer */}
          {logOpen && (
            <div className="hgd-card hgd-scroll mt-3 max-h-[320px] overflow-y-auto p-3">
              <h3 className="hgd-heading mb-2 text-[13px] uppercase tracking-wide">War log</h3>
              <ul className="space-y-1.5">
                {past.map((pastEvent) => (
                  <li key={pastEvent.id} className="flex gap-2 text-[12px] text-muted">
                    <span className="shrink-0 text-gold">D{pastEvent.day}</span>
                    <span>
                      <TokenText
                        tokens={pastEvent.tokens}
                        onNameClick={(id) => {
                          const servant = servants.find((s) => s.id === id);
                          if (servant) setSelected(servant);
                        }}
                      />
                    </span>
                  </li>
                ))}
                {past.length === 0 && <li className="text-[12px] text-muted">Nothing has happened yet.</li>}
              </ul>
            </div>
          )}
        </main>
      </div>

      {/* Mobile fixed controls */}
      {isHost && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-[rgba(12,12,15,.94)] px-3 py-2 backdrop-blur lg:hidden">
          {controls}
        </div>
      )}

      {selected && (
        <ServantCard
          servant={selected}
          status={statusesWithDays[selected.id]}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
