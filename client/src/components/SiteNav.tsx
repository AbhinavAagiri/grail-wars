import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';

const LINKS = [
  { to: '/', label: 'Play' },
  { to: '/credits', label: 'Credits' },
  { to: '/roadmap', label: 'Roadmap' },
  { to: '/contact', label: 'Contact' },
];

/** The top menu bar shown on the public pages (home, credits, contact). */
export function SiteNav() {
  return (
    <nav className="sticky top-0 z-40 border-b border-[rgba(201,164,92,.14)] bg-[rgba(12,12,15,.42)] backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
        <NavLink to="/" className="font-display text-[14px] font-bold tracking-[0.24em] text-gold">
          GW
        </NavLink>
        <div className="flex flex-wrap items-center gap-1">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'hgd-btn hgd-btn-ghost !min-h-[32px] !px-2 !text-[11px] uppercase tracking-wide sm:!px-3 sm:!text-[12px]',
                  isActive ? 'text-gold' : 'text-muted',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
        <span className="ml-auto hidden text-[11px] uppercase tracking-[0.16em] text-muted sm:inline">
          Grail Wars
        </span>
      </div>
    </nav>
  );
}
