import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { SiteNav } from '../components/SiteNav';
import { Modal } from '../components/ui';

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

interface Milestone {
  id: string;
  /** Shown as the flag on the road and the modal's title. */
  version: string;
  tag: string;
  status: string;
  body: string;
  items: { title: string; body: string }[];
  /**
   * Where the flag stands on the road, as a percentage of the canvas. The road
   * is drawn through these points, so a flag is always on the tarmac.
   */
  at: { x: number; y: number };
  /** Which side of the road the card hangs from. */
  place: 'above' | 'below' | 'left' | 'right';
}

const MILESTONES: Milestone[] = [
  {
    id: 'v0-1',
    version: 'v0.1',
    tag: 'Where it started',
    status: 'Shipped',
    body: 'The summoning circle went up with ten classes, a hidden draft board and a war engine that plays out one event at a time. Everything since has been about sharpening what was already here.',
    items: [
      {
        title: 'Ten classes',
        body: "Saber to Avenger — Type-Moon's full line-up, each with its own traits, flavour and art.",
      },
      {
        title: 'A five-day war',
        body: 'Draft, summon, research, power review, then day-by-day events until exactly one Servant is left standing.',
      },
      {
        title: 'Three narration styles',
        body: 'The same war told straight, dry, or dramatic — pick the voice before the first die is cast.',
      },
    ],
    at: { x: 18, y: 20 },
    place: 'above',
  },
  {
    id: 'v0-5',
    version: 'v0.5',
    tag: 'Where we are now',
    status: 'Shipped · current',
    body: 'The biggest piece of work since launch. A Servant is now scaled from their own VS Battles page, only drafted into a class their fighting style suits, and can be handed to the room in pools of 25.',
    items: [
      {
        title: 'Power scaling, rebuilt',
        body: 'AniList → Fandom → Wikipedia evidence, resolved against the matching VS Battles page, so Saber scales off Artoria Pendragon rather than a stray story arc.',
      },
      {
        title: 'Class gating',
        body: 'A pick that does not fit the class is refused — and the refusal names the classes that would have worked.',
      },
      {
        title: 'AI Chooses',
        body: '25 characters dealt per class from committed anime and history rosters, generated and filtered from public wiki data.',
      },
      {
        title: 'Still rough',
        body: 'Selecting a character can pause while the Oracle checks it, and refreshing mid-draft can drop a Master to spectator. Both are on the list for v1.0.',
      },
    ],
    at: { x: 66, y: 40 },
    place: 'right',
  },
  {
    id: 'v1-0',
    version: 'v1.0',
    tag: 'The full release',
    status: 'Planned',
    body: 'What v1.0 means: the game stops apologising for itself. The defects come out, the deployment becomes real, and the polish nobody notices until it is missing gets added.',
    items: [
      {
        title: 'Faster drafting',
        body: 'Return the pick immediately and report the class check afterwards, as a badge on the card.',
      },
      {
        title: 'Rejoining a war mid-draft',
        body: 'Refreshing during the draft should put a Master back in their seat instead of the spectator list.',
      },
      {
        title: 'The Debate Arena',
        body: 'Get the bracket to produce a champion, then take the mode out from behind "Coming soon".',
      },
      {
        title: 'A real deployment',
        body: 'Docker image, compose stack and Caddy certificates on a live host, idle reclamation included.',
      },
      {
        title: 'Sound and accessibility',
        body: 'Stings for the summoning and the events, plus a keyboard-only drafting pass and a contrast review.',
      },
      {
        title: 'Recap export',
        body: 'Turn a finished war — the roster, the tiers and the day-by-day story — into one shareable image.',
      },
    ],
    at: { x: 25, y: 72 },
    place: 'above',
  },
];

/** How far along the road the project actually is. */
const CURRENT = { x: 44, y: 57 };
/** Where the road stops — the arrowhead — and the sign under it. */
const ARROW = { x: 50, y: 88 };
const SIGN = { x: 50, y: 96 };

/**
 * The road, as waypoints through the 0–100 square. The milestones are points on
 * this list, which is what keeps every flag standing on tarmac. The spacing is
 * the whole trick: long, shallow shelves between milestones, so the road bends
 * around a card instead of running back through it.
 */
const ROAD_WAYPOINTS: [number, number][] = [
  [-6, 20],
  [18, 20], // v0.1
  [38, 21],
  [54, 26],
  [62, 33],
  [66, 40], // v0.5
  [60, 49],
  [50, 54],
  [44, 57], // we are here right now
  [35, 62],
  [25, 72], // v1.0
  [27, 77],
  [33, 81],
  [41, 83],
  [48, 85],
  [50, 88], // the arrowhead
];

/** A faint dot grid, like the corners of the mock-ups the road is drawn from. */
const DOT_GRID: CSSProperties = {
  backgroundImage: 'radial-gradient(circle, rgba(201,164,92,.55) 1.5px, transparent 1.6px)',
  backgroundSize: '15px 15px',
};

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

/**
 * A Catmull-Rom spline through the waypoints, emitted as cubic Béziers so the
 * road can be drawn with a single `<path>`. Every waypoint is on the curve,
 * which is why a milestone can be pinned to a waypoint and land on the road.
 */
function smoothPath(points: readonly [number, number][], tension = 1): string {
  const p = [points[0], ...points, points[points.length - 1]];
  const round = (n: number) => Math.round(n * 100) / 100;
  let d = `M ${p[1][0]} ${p[1][1]}`;
  for (let i = 1; i < p.length - 2; i += 1) {
    const [x0, y0] = p[i - 1];
    const [x1, y1] = p[i];
    const [x2, y2] = p[i + 1];
    const [x3, y3] = p[i + 2];
    d +=
      ` C ${round(x1 + ((x2 - x0) / 6) * tension)} ${round(y1 + ((y2 - y0) / 6) * tension)}` +
      `, ${round(x2 - ((x3 - x1) / 6) * tension)} ${round(y2 - ((y3 - y1) / 6) * tension)}` +
      `, ${x2} ${y2}`;
  }
  return d;
}

const ROAD = smoothPath(ROAD_WAYPOINTS);

/** Custom properties a card reads for its own position, in canvas percent. */
function at(x: number, y: number): CSSProperties {
  return { '--x': `${x}%`, '--y': `${y}%` } as CSSProperties;
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/** The gold map pin, dropped point-first onto the road. */
function Pin({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      className={clsx('pointer-events-none text-gold drop-shadow-[0_2px_6px_rgba(0,0,0,.6)]', className)}
      style={style}
    >
      <path
        d="M12 1.6c-4.3 0-7.7 3.4-7.7 7.7 0 5.6 7.7 13.1 7.7 13.1s7.7-7.5 7.7-13.1c0-4.3-3.4-7.7-7.7-7.7Zm0 10.6a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"
        stroke="var(--bg-deep)"
        strokeWidth="0.9"
      />
    </svg>
  );
}

/**
 * One milestone: a card you can open, hung off the road by its flag. Sizes are
 * in `cqw`, so the whole diagram scales as one piece and always fits the screen
 * it is given instead of spilling past the fold.
 */
function MilestoneCard({ milestone, onOpen }: { milestone: Milestone; onOpen: () => void }) {
  const { at: point, place } = milestone;
  return (
    <>
      <Pin
        className="absolute left-[var(--x)] top-[var(--y)] z-20 h-[clamp(14px,2.6cqw,24px)] w-[clamp(14px,2.6cqw,24px)] -translate-x-1/2 -translate-y-full"
        style={at(point.x, point.y)}
      />
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${milestone.version} — ${milestone.tag}. Open the details.`}
        style={at(point.x, point.y)}
        className={clsx(
          'hgd-card hgd-card-interactive absolute z-10 block w-[clamp(150px,26cqw,236px)] cursor-pointer text-left',
          'p-[clamp(6px,1.05cqw,11px)]',
          place === 'above' && 'bottom-[calc(100%_-_var(--y)_+_2.6cqw)] left-[clamp(124px,var(--x),calc(100%_-_124px))] -translate-x-1/2',
          place === 'below' && 'top-[calc(var(--y)_+_2.6cqw)] left-[clamp(124px,var(--x),calc(100%_-_124px))] -translate-x-1/2',
          place === 'right' && 'left-[clamp(0px,calc(var(--x)_+_2.6cqw),calc(100%_-_26cqw))] top-[var(--y)] -translate-y-1/2',
          place === 'left' && 'right-[clamp(0px,calc(100%_-_var(--x)_+_2.6cqw),calc(100%_-_26cqw))] top-[var(--y)] -translate-y-1/2',
        )}
      >
        <span className="flex items-baseline gap-[0.7cqw]">
          <span className="font-display text-[clamp(12px,1.9cqw,16px)] font-black tracking-wide text-gold">
            {milestone.version}
          </span>
          <span className="text-[clamp(8px,0.95cqw,10px)] uppercase tracking-[0.16em] text-muted">
            {milestone.tag}
          </span>
        </span>
        <span className="mt-[0.5cqw] block text-[clamp(8px,0.95cqw,10px)] uppercase tracking-[0.16em] text-gold-dark">
          Open the details →
        </span>
      </button>
    </>
  );
}

/** The road: dark tarmac between gold kerbs, with a dashed centre line. */
function Road() {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="absolute inset-0 h-full w-full overflow-visible"
    >
      {/* Drop shadow, so the road sits above the page. */}
      <path
        d={ROAD}
        fill="none"
        transform="translate(0.25 0.4)"
        stroke="rgba(0,0,0,.55)"
        strokeWidth={54}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Gold kerbs. */}
      <path
        d={ROAD}
        fill="none"
        stroke="rgba(201,164,92,.28)"
        strokeWidth={50}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Tarmac. */}
      <path
        d={ROAD}
        fill="none"
        stroke="#26262e"
        strokeWidth={44}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={ROAD}
        fill="none"
        stroke="#30303b"
        strokeWidth={28}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Centre line. */}
      <path
        d={ROAD}
        fill="none"
        stroke="rgba(230,199,126,.5)"
        strokeWidth={2}
        strokeDasharray="8 12"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** The arrowhead the road ends on. */
function RoadArrow() {
  return (
    <svg
      viewBox="0 0 24 22"
      aria-hidden="true"
      className="absolute left-[var(--x)] top-[var(--y)] z-20 w-[clamp(24px,5.1cqw,46px)] -translate-x-1/2 -translate-y-1/2"
      style={at(ARROW.x, ARROW.y)}
    >
      <path d="M1.6 1.6h20.8L12 20.4Z" fill="#26262e" stroke="rgba(201,164,92,.45)" strokeWidth="1.4" />
    </svg>
  );
}

/** Small phone screens get a straight road with the cards stacked beside it. */
function RoadList({ onOpen }: { onOpen: (m: Milestone) => void }) {
  const card = (milestone: Milestone) => (
    <button
      type="button"
      onClick={() => onOpen(milestone)}
      aria-label={`${milestone.version} — ${milestone.tag}. Open the details.`}
      className="hgd-card hgd-card-interactive block w-full cursor-pointer p-2.5 text-left"
    >
      <span className="flex items-baseline gap-2">
        <span className="font-display text-[17px] font-black tracking-wide text-gold">{milestone.version}</span>
        <span className="text-[9.5px] uppercase tracking-[0.16em] text-muted">{milestone.tag}</span>
      </span>
      <span className="mt-1 block text-[9.5px] uppercase tracking-[0.16em] text-gold-dark">Open the details →</span>
    </button>
  );

  return (
    <section className="relative mt-4 flex-1 sm:hidden">
      <span
        aria-hidden="true"
        className="absolute bottom-9 left-[14px] top-0 w-[32px] rounded-full bg-[#26262e] ring-1 ring-[rgba(201,164,92,.24)]"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-9 left-[30px] top-0 w-0 -translate-x-1/2 border-l-2 border-dashed border-[rgba(230,199,126,.45)]"
      />

      <ul className="space-y-3.5">
        {[MILESTONES[0], MILESTONES[1]].map((m) => (
          <li key={m.id} className="relative pl-[54px]">
            <Pin className="absolute left-[30px] top-2.5 h-6 w-6 -translate-x-1/2" />
            {card(m)}
          </li>
        ))}

        <li className="relative pl-[54px]">
          <span
            aria-hidden="true"
            className="absolute left-[30px] top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--gold-bright)] bg-[var(--gold)] shadow-[0_0_16px_rgba(201,164,92,.85)]"
          />
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gold">We are here right now</p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted">v0.5 is live. v1.0 is the next stop.</p>
        </li>

        <li className="relative pl-[54px]">
          <Pin className="absolute left-[30px] top-2.5 h-6 w-6 -translate-x-1/2" />
          {card(MILESTONES[2])}
        </li>

        <li className="relative pl-[54px] pb-1">
          <p className="hgd-heading pt-2 text-[15px] uppercase tracking-[0.2em]">Coming soon</p>
        </li>
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Roadmap() {
  const [open, setOpen] = useState<Milestone | null>(null);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <SiteNav />

      <div className="mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col justify-center px-4 py-3">
        <h1 className="hgd-heading text-center text-[24px] leading-tight sm:text-[30px]">ROADMAP</h1>
        <p className="mx-auto mt-1.5 max-w-2xl text-center text-[12px] leading-snug text-muted">
          Grail Wars is one person's fan project, built in the open. Every stop on this road is a version — open one
          for the details.
        </p>

        {/*
          The diagram is a fixed 3:2 canvas, sized off whichever of the height or
          the width runs out first (`min(100%, 100cqw / 1.5)`), so it shrinks to
          fit the screen instead of pushing the page into a scroll. Everything
          inside it is measured in `cqw`, so the road, the flags and the type all
          scale as one piece.
        */}
        <div
          className="relative mx-auto hidden w-full items-center justify-center [container-type:size] sm:flex"
          style={{ height: 'calc(100dvh - 345px)' }}
        >
          <div
            className="relative aspect-[3/2] h-[460px] max-w-full [container-type:size]"
            style={{ height: 'clamp(300px, min(100cqh, 66.6667cqw), 620px)' }}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-0 top-0 h-[clamp(30px,7cqw,64px)] w-[clamp(40px,9cqw,84px)] opacity-25"
              style={DOT_GRID}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[18%] left-0 h-[clamp(30px,7cqw,64px)] w-[clamp(30px,7cqw,64px)] opacity-25"
              style={DOT_GRID}
            />

            <Road />

            {MILESTONES.map((milestone) => (
              <MilestoneCard key={milestone.id} milestone={milestone} onOpen={() => setOpen(milestone)} />
            ))}

            {/* Where we are: a label over the road, an arrow pointing down it,
                and a glowing dot on the tarmac itself. */}
            <span
              aria-hidden="true"
              className="absolute left-[var(--x)] top-[var(--y)] z-20 h-[clamp(9px,1.7cqw,16px)] w-[clamp(9px,1.7cqw,16px)] -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-[var(--gold)] opacity-40"
              style={at(CURRENT.x, CURRENT.y)}
            />
            <span
              aria-hidden="true"
              className="absolute left-[var(--x)] top-[var(--y)] z-20 h-[clamp(8px,1.5cqw,14px)] w-[clamp(8px,1.5cqw,14px)] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--gold-bright)] bg-[var(--gold)] shadow-[0_0_16px_rgba(201,164,92,.85)]"
              style={at(CURRENT.x, CURRENT.y)}
            />
            <div
              className="absolute left-[var(--x)] top-[var(--y)] z-20 -translate-x-1/2 -translate-y-full pb-[0.6cqw] text-center"
              style={at(CURRENT.x, CURRENT.y)}
            >
              <span className="block whitespace-nowrap text-[clamp(10px,1.5cqw,13px)] font-black uppercase tracking-[0.16em] text-gold">
                We are here right now
              </span>
              <span aria-hidden="true" className="mt-[0.2cqw] block text-[clamp(10px,1.7cqw,15px)] leading-none text-gold">
                ▼
              </span>
            </div>

            <RoadArrow />
            <p
              className="absolute left-[var(--x)] top-[var(--y)] z-20 -translate-x-1/2 -translate-y-1/2 text-center"
              style={at(SIGN.x, SIGN.y)}
            >
              <span className="hgd-heading block whitespace-nowrap text-[clamp(14px,2.2cqw,19px)] uppercase tracking-[0.22em]">
                Coming soon
              </span>
              <span className="mt-[0.2cqw] block whitespace-nowrap text-[clamp(8px,0.95cqw,10px)] uppercase tracking-[0.16em] text-muted">
                the road carries on
              </span>
            </p>
          </div>
        </div>

        <RoadList onOpen={setOpen} />

        <p className="mt-3 text-center text-[11.5px] leading-snug text-muted">
          Want something moved up the road? Ideas sent through the{' '}
          <Link to="/contact" className="text-gold underline">
            Contact page
          </Link>{' '}
          are how the last batch of work got picked.
        </p>
      </div>

      {open && (
        <Modal title={`${open.version} — ${open.tag}`} onClose={() => setOpen(null)} wide>
          <span className="inline-block rounded-full border border-border bg-surface-2 px-2.5 py-[3px] text-[9.5px] font-black uppercase tracking-[0.18em] text-gold">
            {open.status}
          </span>
          <p className="mt-2.5">{open.body}</p>
          <ul className="mt-3 space-y-2">
            {open.items.map((item) => (
              <li key={item.title} className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                <p className="font-display text-[13.5px] font-bold text-ink">{item.title}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
