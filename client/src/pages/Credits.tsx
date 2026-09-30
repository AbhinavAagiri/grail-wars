import { useState } from 'react';
import { SiteNav } from '../components/SiteNav';

interface Brand {
  name: string;
  /** path to a logo bundled with the client (see client/public/brands) */
  logo: string;
  /** initials shown if the logo cannot be loaded */
  monogram: string;
  url: string;
  text: string;
  role: string;
}

const BRANDS: Brand[] = [
  {
    name: 'Type-Moon',
    logo: '/brands/typemoon.svg',
    monogram: 'TM',
    url: 'https://typemoon.com/',
    role: 'The Fate franchise',
    text: 'The creators of Fate/stay night, Fate/Grand Order and the Holy Grail War itself. Every Servant class used here — Saber, Archer, Lancer, Rider, Caster, Assassin, Berserker, Shielder, Ruler and Avenger — along with Command Seals, Noble Phantasms, the Grail and the Throne of Heroes, comes from Type-Moon\'s work. This project is an unaffiliated fan tribute and claims no ownership of any of it.',
  },
  {
    name: 'VS Battles Wiki',
    logo: '/brands/vsbattles.webp',
    monogram: 'VS',
    url: 'https://vsbattles.fandom.com/wiki/Attack_Potency',
    role: 'Power scaling data',
    text: 'The tier system that drives the Oracle is derived from the VS Battles Wiki\'s Attack Potency and speed scales. VS Battles content is used under the Creative Commons Attribution-ShareAlike licence (CC BY-SA); the original authors retain all rights to it.',
  },
  {
    name: 'AniList',
    logo: '/brands/anilist.svg',
    monogram: 'AL',
    url: 'https://anilist.co/',
    role: 'Anime & manga characters',
    text: 'Character names, series titles and portrait artwork for anime and manga Servants are pulled from AniList\'s public GraphQL API. AniList is an independent community database, and all artwork belongs to the original studios and rights holders.',
  },
  {
    name: 'Wikipedia',
    logo: '/brands/wikipedia.svg',
    monogram: 'W',
    url: 'https://www.wikipedia.org/',
    role: 'Historical & mythological figures',
    text: 'Real people from history, myth and legend — the Achilleses, the Musashis, the Jeanne d\'Arcs — are researched from Wikipedia\'s free encyclopaedia and its text is available under the Creative Commons Attribution-ShareAlike licence.',
  },
  {
    name: 'The Movie Database',
    logo: '/brands/tmdb.svg',
    monogram: 'TMDB',
    url: 'https://www.themoviedb.org/',
    role: 'Film & television people',
    text: 'Film and television characters use TMDB\'s public API when a key is configured. This product uses the TMDB API but is not endorsed or certified by TMDB. Portraits are shown transiently and are never redistributed.',
  },
  {
    name: 'Fandom',
    logo: '/brands/fandom.svg',
    monogram: 'F',
    url: 'https://www.fandom.com/',
    role: 'Community wiki reference',
    text: 'Community wikis hosted on Fandom are used as a fallback reference for characters that the other sources do not cover. Wiki text remains the property of its authors and is used under their respective licences.',
  },
];

/** Open-source projects this game is built on. Names only. */
const STACK = [
  'React',
  'Vite',
  'TypeScript',
  'Tailwind CSS',
  'Framer Motion',
  'Express',
  'Socket.IO',
  'Zod',
  'seedrandom',
];

/**
 * A brand's real logo. Most logo files are dark artwork drawn for a white page,
 * so each sits on a pale tile to stay legible against the game's dark theme.
 * If the file cannot be loaded we quietly show the brand's initials instead of
 * a broken-image icon.
 */
function BrandLogo({ brand }: { brand: Brand }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-xl border"
      style={{ background: '#f4f1e9', borderColor: '#e2dccd' }}
      role="img"
      aria-label={brand.name}
    >
      {failed ? (
        <span className="font-display text-[15px] font-black tracking-wider text-[#4a4a52]" aria-hidden="true">
          {brand.monogram}
        </span>
      ) : (
        <img
          src={brand.logo}
          alt=""
          loading="lazy"
          className="h-[46px] w-[46px] object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

export default function Credits() {
  return (
    <div className="relative min-h-screen">
      <SiteNav />

      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="hgd-heading text-center text-[26px] sm:text-[34px]">CREDITS</h1>
        <p className="mx-auto mt-3 max-w-2xl text-center text-[13px] leading-relaxed text-muted">
          Grail Wars is a fan-made party game. Nothing here would exist without the studios, wikis and
          open-source projects below, so here is exactly who did the work and where it came from.
        </p>

        <section className="mt-8 space-y-3">
          {BRANDS.map((brand) => (
            <article key={brand.name} className="hgd-card flex items-center gap-4 p-4">
              <BrandLogo brand={brand} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted">{brand.role}</p>
                <h2 className="mt-0.5 font-display text-[17px] font-bold text-gold">
                  <a href={brand.url} target="_blank" rel="noreferrer noopener" className="underline">
                    {brand.name}
                  </a>
                </h2>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink">{brand.text}</p>
                <a
                  href={brand.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1 inline-block text-[11.5px] text-gold underline"
                >
                  {brand.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              </div>
            </article>
          ))}
        </section>

        <section className="mt-8 hgd-card p-4">
          <h2 className="hgd-heading text-lg">Built with</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {STACK.map((name) => (
              <li
                key={name}
                className="rounded-full border border-border bg-surface-2 px-3 py-1 font-body text-[12.5px] font-bold text-ink"
              >
                {name}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 hgd-card p-4 text-[12.5px] leading-relaxed text-muted">
          <h2 className="hgd-heading mb-2 text-lg">Legal</h2>
          <p>
            This is a non-commercial fan project and is not affiliated with, endorsed by, or sponsored by Type-Moon,
            AniList, VS Battles, Wikipedia, TMDB, Fandom, or any rights holder of the characters and franchises that
            appear in it. Character names and imagery belong to their respective owners.
          </p>
          <p className="mt-2">
            Logos on this page are the trademarks of their respective owners and are shown purely for identification
            and attribution. Images are shown transiently through a caching proxy and are never stored permanently or
            redistributed. Power-scaling data derived from the VS Battles Wiki is used under CC BY-SA; Wikipedia text
            is used under CC BY-SA.
          </p>
        </section>
      </div>
    </div>
  );
}
