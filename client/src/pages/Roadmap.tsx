import { Link } from 'react-router-dom';
import { SiteNav } from '../components/SiteNav';

interface Item {
  title: string;
  body: string;
}

interface Stage {
  id: string;
  /** Badge text, already uppercased by CSS. */
  label: string;
  /** Tailwind colour class for the badge and the stage rule. */
  accent: string;
  blurb: string;
  items: Item[];
}

/**
 * The roadmap is written by hand rather than generated: it is a promise to the
 * player, not a changelog. It mirrors `DECISIONS.md` — what is finished, what is
 * being worked on right now, and what is only a plan.
 */
const STAGES: Stage[] = [
  {
    id: 'shipped',
    label: 'Shipped · v0.5',
    accent: 'text-success',
    blurb: 'In the game today.',
    items: [
      {
        title: 'Power scaling, rebuilt',
        body: 'Every Servant is researched through AniList, then Fandom, then Wikipedia, and the tier is read from that character\'s own VS Battles page — so a Saber is scaled from their own entry instead of a stray story arc.',
      },
      {
        title: 'Class gating',
        body: 'A character can only be drafted in a class their fighting style actually suits. When the Oracle refuses a pick it says which classes would have worked.',
      },
      {
        title: 'AI Chooses',
        body: 'Hand the drafting to the Grail: 25 characters are dealt per class, drawn from a committed roster of anime or historical figures — or a mix of both.',
      },
      {
        title: 'Ten classes, five-day wars, three narration styles',
        body: 'The full war runs end to end: draft, summon, research, power review, five days of events and exactly one winner.',
      },
      {
        title: 'Attribution',
        body: 'Every source this game borrows from — Type-Moon, VS Battles, AniList, Wikipedia, TMDB, Fandom — is credited on the Credits page.',
      },
    ],
  },
  {
    id: 'working-on',
    label: 'In progress',
    accent: 'text-gold',
    blurb: 'What I am working on right now.',
    items: [
      {
        title: 'Faster drafting',
        body: 'Selecting a character can pause for a moment while the Oracle checks the pick against its class. Making that feel instant is the next piece of work, and the reason the draft screen asks for patience.',
      },
      {
        title: 'Rejoining a war mid-draft',
        body: 'Refreshing during the draft can drop a Master into the spectator list and leave the session unrestored. The restore path needs rebuilding so a reload is invisible.',
      },
      {
        title: 'The Debate Arena',
        body: 'The mode exists in the type union and the bracket engine, but the bracket never produces a champion yet. It stays behind a "Coming soon" badge until it does.',
      },
      {
        title: 'AI narration',
        body: 'The third narration style is written and wired up, but has not been exercised with a live model key. It stays unreachable from the lobby until it is.',
      },
    ],
  },
  {
    id: 'planned',
    label: 'Planned',
    accent: 'text-muted',
    blurb: 'Not started, but on the list.',
    items: [
      {
        title: 'A real deployment',
        body: 'The Dockerfile, the compose stack and the Caddy reverse proxy are written but have never been run: the image build, the certificate handshake and idle reclamation all need their first pass on a live host.',
      },
      {
        title: 'Sound',
        body: 'Stings for the summoning, a hit for each war event and something for the final day — optional, and off by default.',
      },
      {
        title: 'An accessibility pass',
        body: 'Keyboard-only drafting, better screen-reader labels for the class and pool pickers, and a contrast review of the gold-on-black palette.',
      },
      {
        title: 'Recap export',
        body: 'Turn a finished war — the roster, the tiers and the day-by-day story — into a single shareable image.',
      },
      {
        title: 'Portrait coverage',
        body: 'A handful of characters still fall back to an initials avatar when the picture APIs are flaky. I want a complete set of real artwork.',
      },
    ],
  },
];

export default function Roadmap() {
  return (
    <div className="relative min-h-screen">
      <SiteNav />

      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="hgd-heading text-center text-[26px] sm:text-[34px]">ROADMAP</h1>
        <p className="mx-auto mt-3 max-w-2xl text-center text-[13px] leading-relaxed text-muted">
          Grail Wars is one person's fan project, built in the open. Here is what is already in the game, what I am
          working on at the moment, and what is still only a plan — newest work first.
        </p>

        {STAGES.map((stage) => (
          <section key={stage.id} className="mt-8">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className={`hgd-heading text-lg uppercase tracking-[0.14em] ${stage.accent}`}>{stage.label}</h2>
              <p className="text-[11.5px] text-muted">{stage.blurb}</p>
            </div>

            <div className="mt-3 space-y-3">
              {stage.items.map((item) => (
                <article key={item.title} className="hgd-card p-4">
                  <h3 className="font-display text-[16px] font-bold text-ink">{item.title}</h3>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{item.body}</p>
                </article>
              ))}
            </div>
          </section>
        ))}

        <p className="mt-8 text-center text-[12.5px] leading-relaxed text-muted">
          Want something moved up the list? Ideas sent through the{' '}
          <Link to="/contact" className="text-gold underline">
            Contact page
          </Link>{' '}
          are how the last batch of work got picked.
        </p>
      </div>
    </div>
  );
}
