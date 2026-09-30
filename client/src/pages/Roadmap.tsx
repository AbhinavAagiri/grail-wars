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
  teaser: string;
  status: string;
  body: string;
  items: { title: string; body: string }[];
  /**
   * Where the flag stands on the road, as a percentage of the canvas. The
   * road is drawn through these points, so a flag is always on the tarmac.
   */
  at: { x: number; y: number };
  /** Which side of the road the card hangs from. */
  place: 'above' | 'below';
}

const MILESTONES: Milestone[] = [
  {
    id: 'v0-1',
    version: 'v0.1',
    tag: 'Where it started',
    teaser: 'The first build you could actually play: draft, summon, five days of war.',
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
    at: { x: 24, y: 8 },
    place: 'below',
  },
  {
    id: 'v0-5',
    version: 'v0.5',
    tag: 'Where we are now',
    teaser: 'The build live today: sharper scaling, stricter classes, and rosters dealt by the Grail.',
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
    at: { x: 46, y: 36 },
    place: 'above',
  },
  {
    id: 'v1-0',
    version: 'v1.0',
    tag: 'The full release',
    teaser: 'The version that fixes the rough edges, leaves early access and runs on a real host.',
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
    at: { x: 52, y: 62 },
    place: 'below',
  },
];

/** The marker that says how far along the road the project actually is. */
const CURRENT = { x: 20, y: 48 };
/** Where the road leaves the canvas, under the Coming soon sign. */
const TERMINUS = { x: 48, y: 100 };

/**
 * The road itself, as waypoints through the 0–100 square. The milestones above
 * are points on this list, which is what keeps every flag standing on tarmac.
 * Spacing is deliberate: the shelves are long and flat so a card can hang from
 * one without the road cutting through it on the way back.
 */
const ROAD_WAYPOINTS: [number, number][] = [
  [-6, 8],
  [24, 8], // v0.1
  [40, 8],
  [58, 12],
  [66, 22],
  [64, 32],
  [46, 36], // v0.5
  [30, 36],
  [22, 42],
  [20, 48], // where we are
  [22, 55],
  [30, 62],
  [52, 62], // v1.0
  [72, 62],
  [78, 70],
  [76, 78],
  [64, 86],
  [48, 86],
  [48, 100], // coming soon
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

/** Custom properties a milestone card reads for its own position. */
function place(x: number, y: number): CSSProperties {
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

/** One milestone: a card you can open, hung off the road by its pin. */
function MilestoneCard({ milestone, onOpen }: { milestone: Milestone; onOpen: () => void }) {
  const { at, place: side } = milestone;
  return (
    <>
      <Pin
        className="absolute left-[var(--x)] top-[var(--y)] z-20 h-6 w-6 -translate-x-1/2 -translate-y-full"
        style={place(at.x, at.y)}
      />
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${milestone.version} — ${milestone.tag}. Open the details.`}
        style={place(at.x, at.y)}
        className={clsx(
          'hgd-card hgd-card-interactive absolute z-10 block w-[250px] cursor-pointer p-3 text-left lg:w-[300px]',
          side === 'below'
            ? 'top-[calc(var(--y)_+_34px)] left-[clamp(150px,var(--x),calc(100%_-_150px))] -translate-x-1/2'
            : 'bottom-[calc(100%_-_var(--y)_+_34px)] left-[clamp(150px,var(--x),calc(100%_-_150px))] -translate-x-1/2',
        )}
      >
        <span className="flex items-baseline gap-2">
          <span className="font-display text-[17px] font-black tracking-wide text-gold">{milestone.version}</span>
          <span className="text-[9.5px] uppercase tracking-[0.18em] text-muted">{milestone.tag}</span>
        </span>
        <span className="mt-1 block text-[11.5px] leading-relaxed text-ink">{milestone.teaser}</span>
        <span className="mt-1.5 block text-[9.5px] uppercase tracking-[0.16em] text-gold-dark">
          Tap for details →
        </span>
      </button>
    </>
  );
}

/** The winding road, drawn as a road: dark tarmac, gold edges, dashed centre. */
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

/** Small phone screens get a straight road with the cards stacked beside it. */
function RoadList({ onOpen }: { onOpen: (m: Milestone) => void }) {
  return (
    <section className="relative mt-6 sm:hidden">
      <span
        aria-hidden="true"
        className="absolute bottom-10 left-[14px] top-2 w-[32px] rounded-full bg-[#26262e] ring-1 ring-[rgba(201,164,92,.24)]"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-10 left-[30px] top-2 w-0 -translate-x-1/2 border-l-2 border-dashed border-[rgba(230,199,126,.45)]"
      />

      <ul className="space-y-5">
        {[MILESTONES[0], MILESTONES[1]].map((m) => (
          <li key={m.id} className="relative pl-[56px]">
            <Pin className="absolute left-[30px] top-3 h-6 w-6 -translate-x-1/2" />
            <button
              type="button"
              onClick={() => onOpen(m)}
              aria-label={`${m.version} — ${m.tag}. Open the details.`}
              className="hgd-card hgd-card-interactive block w-full cursor-pointer p-3 text-left"
            >
              <span className="flex items-baseline gap-2">
                <span className="font-display text-[17px] font-black tracking-wide text-gold">{m.version}</span>
                <span className="text-[9.5px] uppercase tracking-[0.18em] text-muted">{m.tag}</span>
              </span>
              <span className="mt-1 block text-[11.5px] leading-relaxed text-ink">{m.teaser}</span>
            </button>
          </li>
        ))}

        <li className="relative pl-[56px]">
          <span
            aria-hidden="true"
            className="absolute left-[30px] top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--gold-bright)] bg-[var(--gold)] shadow-[0_0_16px_rgba(201,164,92,.85)]"
          />
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold">Where we are</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            v0.5 is the build you can play today. v1.0 is the next stop on the road.
          </p>
        </li>

        <li className="relative pl-[56px]">
          <Pin className="absolute left-[30px] top-3 h-6 w-6 -translate-x-1/2" />
          <button
            type="button"
            onClick={() => onOpen(MILESTONES[2])}
            aria-label={`${MILESTONES[2].version} — ${MILESTONES[2].tag}. Open the details.`}
            className="hgd-card hgd-card-interactive block w-full cursor-pointer p-3 text-left"
          >
            <span className="flex items-baseline gap-2">
              <span className="font-display text-[17px] font-black tracking-wide text-gold">
                {MILESTONES[2].version}
              </span>
              <span className="text-[9.5px] uppercase tracking-[0.18em] text-muted">{MILESTONES[2].tag}</span>
            </span>
            <span className="mt-1 block text-[11.5px] leading-relaxed text-ink">{MILESTONES[2].teaser}</span>
          </button>
        </li>

        <li className="relative pl-[56px]">
          <p className="hgd-heading text-[15px] uppercase tracking-[0.2em]">Coming soon</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">The road carries on past v1.0.</p>
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
    <div className="relative min-h-screen">
      <SiteNav />

      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="hgd-heading text-center text-[26px] sm:text-[34px]">ROADMAP</h1>
        <p className="mx-auto mt-3 max-w-2xl text-center text-[13px] leading-relaxed text-muted">
          Grail Wars is one person's fan project, built in the open. This is the road so far and the road ahead — every
          stop is a version you can open.
        </p>

        {/* The winding road, from `sm` up. */}
        <section className="relative mb-8 mt-8 hidden h-[clamp(880px,118vw,1240px)] sm:block">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-2 top-2 h-20 w-28 opacity-25"
            style={DOT_GRID}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-24 left-0 h-20 w-24 opacity-25"
            style={DOT_GRID}
          />

          <Road />

          {MILESTONES.map((milestone) => (
            <MilestoneCard key={milestone.id} milestone={milestone} onOpen={() => setOpen(milestone)} />
          ))}

          {/* Where we are: a sign over the road, an arrow pointing down it, and a
              glowing dot on the tarmac itself. */}
          <span
            aria-hidden="true"
            className="absolute left-[var(--x)] top-[var(--y)] z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-[var(--gold)] opacity-40"
            style={place(CURRENT.x, CURRENT.y)}
          />
          <span
            aria-hidden="true"
            className="absolute left-[var(--x)] top-[var(--y)] z-20 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--gold-bright)] bg-[var(--gold)] shadow-[0_0_16px_rgba(201,164,92,.85)]"
            style={place(CURRENT.x, CURRENT.y)}
          />
          <div
            className="absolute left-[var(--x)] top-[var(--y)] z-20 -translate-x-1/2 -translate-y-full pb-2 text-center"
            style={place(CURRENT.x, CURRENT.y)}
          >
            <span className="block whitespace-nowrap rounded-full border border-[var(--gold)] bg-[var(--bg-deep)] px-2.5 py-[3px] text-[10px] font-black uppercase tracking-[0.18em] text-gold">
              Where we are
            </span>
            <span aria-hidden="true" className="mt-0.5 block text-[15px] leading-none text-gold">
              ▼
            </span>
          </div>

          {/* The road runs out of the canvas and into the sign at the bottom. */}
          <p
            className="absolute left-[var(--x)] top-[var(--y)] z-20 -translate-x-1/2 -translate-y-1/2 text-center"
            style={place(TERMINUS.x, TERMINUS.y)}
          >
            <span className="hgd-heading block whitespace-nowrap px-3 text-[15px] uppercase tracking-[0.22em]">
              Coming soon
            </span>
            <span className="mt-0.5 block whitespace-nowrap text-[10.5px] uppercase tracking-[0.16em] text-muted">
              the road carries on
            </span>
          </p>
        </section>

        <RoadList onOpen={setOpen} />

        <p className="mt-10 text-center text-[12.5px] leading-relaxed text-muted">
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
