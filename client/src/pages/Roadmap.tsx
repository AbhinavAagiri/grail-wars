import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { SiteNav } from '../components/SiteNav';
import { Modal } from '../components/ui';

/* ------------------------------------------------------------------ */
/* The road's canvas                                                   */
/* ------------------------------------------------------------------ */

/**
 * The road is drawn in a 150 × 100 grid that matches the 3:2 box it fills, so
 * the SVG needs no stretching and every stroke can be given in the same units —
 * the whole diagram scales as one piece. One grid unit is 1.5% of the width, so
 * a milestone's grid `x` is `x / 1.5` percent and its `y` is already a percent.
 */
const CANVAS_W = 150;

/* ------------------------------------------------------------------ */
/* The road, as a drive: runs joined by circular bends                 */
/* ------------------------------------------------------------------ */

/** A straight length, optionally carrying a named point. */
interface Run {
  run: number;
  mark?: string;
  /** Where along the run the mark sits, 0–1. */
  at?: number;
}

/** A circular bend. Positive turns right (clockwise on screen), negative left. */
interface Bend {
  turn: number;
  /** Radius in grid units — the same everywhere, which is what keeps the road smooth. */
  r: number;
  mark?: string;
  /** Which fraction of the sweep the mark sits at, 0–1. */
  at?: number;
}

type Step = Run | Bend;

interface Road {
  /** The SVG path data. */
  d: string;
  /** Named points on the tarmac, in grid units. */
  marks: Record<string, [number, number]>;
  /** Where the road runs out, in grid units. */
  end: [number, number];
}

const DEG = Math.PI / 180;
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Drive the road: a sequence of straight runs and circular bends, each bend
 * tangent-continuous with the one before it. Nothing here can draw a corner,
 * because a run's direction is the heading the last bend left, and a bend's
 * radius is fixed — so every turn the player sees has the same, deliberate
 * radius no matter how the milestones move.
 */
function buildRoad(start: [number, number], heading: number, steps: Step[]): Road {
  let x = start[0];
  let y = start[1];
  let h = heading * DEG;
  const d = [`M ${round(x)} ${round(y)}`];
  const marks: Record<string, [number, number]> = {};

  for (const step of steps) {
    if ('run' in step) {
      const ex = x + step.run * Math.cos(h);
      const ey = y + step.run * Math.sin(h);
      d.push(`L ${round(ex)} ${round(ey)}`);
      if (step.mark) {
        const t = step.at ?? 0.5;
        marks[step.mark] = [x + (ex - x) * t, y + (ey - y) * t];
      }
      x = ex;
      y = ey;
      continue;
    }

    const r = step.r;
    const delta = step.turn * DEG;
    const side = Math.sign(step.turn);
    // Centre of the turn, always square to the direction of travel.
    const cx = x - r * side * Math.sin(h);
    const cy = y + r * side * Math.cos(h);
    const ux = x - cx;
    const uy = y - cy;
    const cos = Math.cos(delta);
    const sin = Math.sin(delta);
    const ex = cx + ux * cos - uy * sin;
    const ey = cy + ux * sin + uy * cos;
    d.push(`A ${r} ${r} 0 ${Math.abs(step.turn) > 180 ? 1 : 0} ${side > 0 ? 1 : 0} ${round(ex)} ${round(ey)}`);
    if (step.mark) {
      const t = (step.at ?? 0.5) * delta;
      const tc = Math.cos(t);
      const ts = Math.sin(t);
      marks[step.mark] = [cx + ux * tc - uy * ts, cy + ux * ts + uy * tc];
    }
    x = ex;
    y = ey;
    h += delta;
  }

  return { d: d.join(' '), marks, end: [x, y] };
}

/**
 * The drive. Read it as a route: a long shelf across the top, a wide bend to the
 * right, a long drop back across the page to the left, a tighter bend that puts
 * the road back on a heading of straight down, and a last nudge to vertical.
 *
 * The marks are points on this drive rather than coordinates of their own, which
 * is the whole reason a pin can never end up beside the road: move a bend and
 * its milestone moves with it.
 */
const ROAD = buildRoad([-8, 20], 0, [
  { run: 112, mark: 'v0.1', at: 0.27 },
  { turn: 155, r: 11, mark: 'v0.5', at: 90 / 155 }, // apex of the right-hand bend
  { run: 52, mark: 'current', at: 0.8 },
  { turn: -90, r: 11, mark: 'v1.0', at: 65 / 90 }, // apex of the left-hand bend
  { turn: 25, r: 11 },
  { run: 1, mark: 'arrow', at: 1 },
]);

/** The kerbs' golden line and the tarmac, in grid units. */
const ROAD_W = 4.8;
/** The kerb, a touch wider than the tarmac so a gold rim shows on both sides. */
const KERB_W = 5.8;
/**
 * The slab's thickness, in grid units — how far the golden side face drops below
 * the driving surface. Painting the same path a second time, pushed down by this
 * much and in a darker gold, is what turns a flat ribbon into a road with a side
 * you can see, which is the whole trick of the template this is drawn from.
 */
const EXTRUDE = 1.7;
/** How far under the arrowhead the sign hangs, in grid units. */
const SIGN_DROP = 9.8;

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

interface Milestone {
  id: string;
  /** The name of the point on the road's drive this stop stands on. */
  mark: string;
  version: string;
  tag: string;
  status: string;
  body: string;
  items: { title: string; body: string }[];
  /** Which way the card hangs off the road. */
  place: 'above' | 'below' | 'left' | 'right';
}

const MILESTONES: Milestone[] = [
  {
    id: 'v0-1',
    mark: 'v0.1',
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
    place: 'above',
  },
  {
    id: 'v0-5',
    mark: 'v0.5',
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
        title: 'Faster drafting',
        body: 'The pick lands immediately and the class check follows as a badge on the card.',
      },
      {
        title: 'AI Chooses',
        body: '25 characters dealt per class from committed anime and history rosters, generated and filtered from public wiki data.',
      },
      {
        title: 'The Debate Arena',
        body: 'A second mode: every Master drafts for every class, the Grail hands them one character, and random 1v1 matchups are argued and voted down to a champion. An odd field sends one random character through on a bye.',
      },
      {
        title: 'Sound',
        body: 'Stings for the summoning and the events, with a mute that is remembered.',
      },
      {
        title: 'Still rough',
        body: 'Refreshing mid-draft can drop a Master to spectator. That one is on the list for v1.0.',
      },
    ],
    place: 'left',
  },
  {
    id: 'v1-0',
    mark: 'v1.0',
    version: 'v1.0',
    tag: 'The full release',
    status: 'Planned',
    body: 'What v1.0 means: the game stops apologising for itself. The defects come out, the deployment becomes real, and the polish nobody notices until it is missing gets added.',
    items: [
      {
        title: 'Rejoining a war mid-draft',
        body: 'Refreshing during the draft should put a Master back in their seat instead of the spectator list.',
      },
      {
        title: 'A real deployment',
        body: 'Docker image, compose stack and Caddy certificates on a live host, idle reclamation included.',
      },
      {
        title: 'Interactive War',
        body: 'A war you steer by hand: Masters make the calls between events instead of watching the AI play the whole thing out.',
      },
      {
        title: 'Recap export',
        body: 'Turn a finished war — the roster, the tiers and the day-by-day story — into one shareable image.',
      },
    ],
    place: 'left',
  },
];

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

/** Position custom properties, in canvas percent, from a grid point. */
function onPoint(x: number, y: number): CSSProperties {
  return { '--x': `${round((x / CANVAS_W) * 100)}%`, '--y': `${round(y)}%` } as CSSProperties;
}

/** The same, for a named point on the road. */
function onRoad(mark: string): CSSProperties {
  const [x, y] = ROAD.marks[mark] ?? ROAD.end;
  return onPoint(x, y);
}

/** A faint dot grid, like the corners of the mock-ups the road is drawn from. */
const DOT_GRID: CSSProperties = {
  backgroundImage: 'radial-gradient(circle, rgba(201,164,92,.5) 1px, transparent 1.1px)',
  backgroundSize: '10px 10px',
};

/**
 * The gold pin: a coin struck into the tarmac, centred on its mark so the point
 * it stands for is exactly the point it covers.
 */
function Pin({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={clsx('pointer-events-none drop-shadow-[0_2px_5px_rgba(0,0,0,.7)]', className)}
      style={style}
    >
      <circle cx="12" cy="12" r="10.4" fill="var(--bg-deep)" opacity=".9" />
      <circle cx="12" cy="12" r="9.3" fill="var(--gold)" />
      <circle cx="12" cy="12" r="9.3" fill="none" stroke="var(--gold-dark)" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="5.9" fill="none" stroke="rgba(230,199,126,.8)" strokeWidth="1" />
      <ellipse cx="9.2" cy="8.3" rx="2.4" ry="1.6" fill="rgba(255,255,255,.24)" transform="rotate(-38 9.2 8.3)" />
    </svg>
  );
}

/** One stop: a card you can open, hung off the road by its pin. */
function MilestoneCard({ milestone, onOpen }: { milestone: Milestone; onOpen: () => void }) {
  const { place } = milestone;
  return (
    <>
      <Pin
        className="absolute left-[var(--x)] top-[var(--y)] z-20 h-[clamp(16px,3cqw,28px)] w-[clamp(16px,3cqw,28px)] -translate-x-1/2 -translate-y-1/2"
        style={onRoad(milestone.mark)}
      />
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${milestone.version} — ${milestone.tag}. Open the details.`}
        style={onRoad(milestone.mark)}
        className={clsx(
          'hgd-card hgd-card-interactive absolute z-10 block w-[clamp(150px,26cqw,236px)] cursor-pointer text-left',
          'p-[clamp(6px,1.05cqw,11px)]',
          place === 'above' && 'bottom-[calc(100%_-_var(--y)_+_3cqw)] left-[clamp(124px,var(--x),calc(100%_-_124px))] -translate-x-1/2',
          place === 'below' && 'top-[calc(var(--y)_+_3cqw)] left-[clamp(124px,var(--x),calc(100%_-_124px))] -translate-x-1/2',
          place === 'left' && 'right-[calc(100%_-_var(--x)_+_4.3cqw)] top-[var(--y)] -translate-y-1/2',
          place === 'right' && 'left-[calc(var(--x)_+_4.3cqw)] top-[var(--y)] -translate-y-1/2',
        )}
      >
        <span className="flex items-center justify-between gap-[0.6cqw]">
          <span className="rounded-[5px] border border-[var(--gold-dark)] bg-[rgba(201,164,92,.1)] px-[0.7cqw] py-[0.15cqw] font-display text-[clamp(11px,1.75cqw,15px)] font-black tracking-wide text-gold">
            {milestone.version}
          </span>
          <span className="text-[clamp(7px,0.9cqw,9.5px)] uppercase tracking-[0.14em] text-gold-dark">
            Open →
          </span>
        </span>
        <span className="mt-[0.6cqw] block text-[clamp(8px,0.95cqw,10px)] uppercase tracking-[0.16em] text-muted">
          {milestone.tag}
        </span>
      </button>
    </>
  );
}

/**
 * The road itself, painted back to front: a gold haze, a contact shadow, the
 * extruded side of the slab in two tones, then the driving surface — kerb,
 * tarmac, a lighter centre band and a dashed centre line. Every stroke is the
 * same path measured in grid units, so the whole thing scales as one piece and
 * the side face can never drift away from the tarmac above it.
 */
function Road() {
  const strokes: { width: number; stroke: string; dy?: number; dash?: string; cap?: 'butt' | 'round' }[] = [
    { width: 9.6, stroke: 'rgba(201,164,92,.055)' }, // haze
    { width: 8.2, stroke: 'rgba(0,0,0,.55)', dy: EXTRUDE + 1.5 }, // contact shadow
    { width: KERB_W, stroke: '#2e2510', dy: EXTRUDE }, // slab, deepest
    { width: KERB_W, stroke: '#6f5719', dy: EXTRUDE * 0.5 }, // slab, lit edge
    { width: KERB_W, stroke: 'rgba(201,164,92,.5)' }, // gold kerb
    { width: ROAD_W, stroke: '#26262f' }, // tarmac
    { width: 2.4, stroke: '#33333f' }, // centre band
    { width: 0.34, stroke: 'rgba(230,199,126,.5)', dash: '1.5 2.3', cap: 'round' }, // centre line
  ];
  return (
    /*
      The solid strokes are butt-capped, so the road — and the slab under it —
      ends in a clean cut at `ROAD.end` for the arrowhead to sit on, rather than
      a round cap bulging past it. The dashes keep round caps, because a pill is
      what a road marking should be.
    */
    <svg viewBox={`0 0 ${CANVAS_W} 100`} aria-hidden="true" className="absolute inset-0 h-full w-full">
      {strokes.map((s, i) => (
        <path
          key={i}
          d={ROAD.d}
          fill="none"
          transform={s.dy ? `translate(0 ${s.dy})` : undefined}
          stroke={s.stroke}
          strokeWidth={s.width}
          strokeDasharray={s.dash}
          strokeLinecap={s.cap ?? 'butt'}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/**
 * The arrowhead the road ends on. Its wide base sits on the road's cut end and
 * only its point hangs below, so the widest part of the arrow is always the part
 * that meets the tarmac — hung any other way it would clip the road's corners.
 */
function RoadArrow() {
  const point = onRoad('arrow');
  return (
    <svg
      viewBox="0 0 30 16"
      aria-hidden="true"
      className="absolute left-[var(--x)] top-[var(--y)] z-20 w-[clamp(30px,5.4cqw,52px)] -translate-x-1/2"
      style={point}
    >
      <path d="M1.4 0.9h27.2L15 15.1Z" transform="translate(0 1)" fill="#2e2510" />
      <path
        d="M1.4 0.9h27.2L15 15.1Z"
        fill="#26262f"
        stroke="rgba(201,164,92,.6)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
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
      <span className="flex items-center justify-between gap-2">
        <span className="rounded-[5px] border border-[var(--gold-dark)] bg-[rgba(201,164,92,.1)] px-1.5 py-[1px] font-display text-[15px] font-black tracking-wide text-gold">
          {milestone.version}
        </span>
        <span className="text-[9px] uppercase tracking-[0.14em] text-gold-dark">Open →</span>
      </span>
      <span className="mt-1 block text-[9.5px] uppercase tracking-[0.16em] text-muted">{milestone.tag}</span>
    </button>
  );

  return (
    <section className="relative mt-4 flex-1 sm:hidden">
      <span
        aria-hidden="true"
        className="absolute bottom-9 left-[14px] top-0 w-[30px] rounded-full bg-[#25252d] ring-1 ring-[rgba(201,164,92,.22)]"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-9 left-[29px] top-0 w-0 -translate-x-1/2 border-l-2 border-dashed border-[rgba(230,199,126,.4)]"
      />

      <ul className="space-y-3.5">
        {[MILESTONES[0], MILESTONES[1]].map((m) => (
          <li key={m.id} className="relative pl-[52px]">
            <Pin className="absolute left-[29px] top-2.5 h-[22px] w-[22px] -translate-x-1/2" />
            {card(m)}
          </li>
        ))}

        <li className="relative pl-[52px]">
          <span
            aria-hidden="true"
            className="absolute left-[29px] top-1/2 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[var(--gold-bright)] bg-[var(--gold)] shadow-[0_0_16px_rgba(230,199,126,.9)]"
          >
            <span className="h-[38%] w-[38%] rounded-full bg-[#fff6dd]" />
          </span>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gold">We are here right now</p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted">v0.5 is live. v1.0 is the next stop.</p>
        </li>

        <li className="relative pl-[52px]">
          <Pin className="absolute left-[29px] top-2.5 h-[22px] w-[22px] -translate-x-1/2" />
          {card(MILESTONES[2])}
        </li>

        <li className="relative pl-[52px] pb-1">
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
          A fixed 3:2 canvas, sized off whichever of the height or the width runs
          out first (`min(100cqh, 100cqw / 1.5)`), so the diagram shrinks to fit
          the screen instead of pushing the page into a scroll. Everything inside
          is measured in `cqw`, so road, pins and type scale as one piece.
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
              className="pointer-events-none absolute right-0 top-0 h-[clamp(24px,5cqw,52px)] w-[clamp(32px,6.5cqw,68px)] opacity-25"
              style={DOT_GRID}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[14%] left-0 h-[clamp(24px,5cqw,52px)] w-[clamp(20px,4.5cqw,46px)] opacity-25"
              style={DOT_GRID}
            />

            <Road />

            {MILESTONES.map((milestone) => (
              <MilestoneCard key={milestone.id} milestone={milestone} onOpen={() => setOpen(milestone)} />
            ))}

            {/* Where we are: a sign over the road, an arrow pointing down at it,
                and a dot on the tarmac itself. */}
            <span
              aria-hidden="true"
              className="absolute left-[var(--x)] top-[var(--y)] z-20 h-[clamp(14px,2.6cqw,24px)] w-[clamp(14px,2.6cqw,24px)] -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-[var(--gold)] opacity-30"
              style={onRoad('current')}
            />
            <span
              aria-hidden="true"
              className="absolute left-[var(--x)] top-[var(--y)] z-20 flex h-[clamp(15px,2.8cqw,26px)] w-[clamp(15px,2.8cqw,26px)] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[var(--gold-bright)] bg-[var(--gold)] shadow-[0_0_18px_rgba(230,199,126,.9)]"
              style={onRoad('current')}
            >
              <span className="h-[38%] w-[38%] rounded-full bg-[#fff6dd]" />
            </span>
            <div
              className="absolute left-[var(--x)] top-[var(--y)] z-20 -translate-x-1/2 -translate-y-full pb-[0.6cqw] text-center"
              style={onRoad('current')}
            >
              <span className="block whitespace-nowrap rounded-full border border-[rgba(201,164,92,.5)] bg-[rgba(12,12,15,.72)] px-[1.4cqw] py-[0.3cqw] text-[clamp(10px,1.4cqw,13px)] font-black uppercase tracking-[0.16em] text-gold">
                We are here right now
              </span>
              <span aria-hidden="true" className="mt-[0.2cqw] block text-[clamp(10px,1.6cqw,14px)] leading-none text-gold">
                ▼
              </span>
            </div>

            <RoadArrow />
            <p
              className="absolute left-[var(--x)] top-[var(--y)] z-20 -translate-x-1/2 -translate-y-1/2 text-center"
              style={onPoint(ROAD.end[0], ROAD.end[1] + SIGN_DROP)}
            >
              <span className="hgd-heading block whitespace-nowrap text-[clamp(12px,2.1cqw,19px)] uppercase tracking-[0.22em]">
                Coming soon
              </span>
              <span className="mt-[0.2cqw] block whitespace-nowrap text-[clamp(7px,0.9cqw,10px)] uppercase tracking-[0.16em] text-muted">
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
