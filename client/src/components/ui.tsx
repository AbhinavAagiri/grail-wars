import { useEffect } from 'react';
import { clsx } from 'clsx';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { CLASS_META, PLAYER_COLORS, type PersonalityTag, type Player, type ServantClass, type Toast } from '@hgd/shared';
import { generatedAvatar, onPortraitError } from '../lib/avatar';
import { useStore } from '../store';

/* ------------------------------------------------------------------ */
/* Decorative banner                                                   */
/* ------------------------------------------------------------------ */

function LeafBorder({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 120 10"
      preserveAspectRatio="none"
      className={clsx('block h-[10px] w-full', flip && 'rotate-180')}
      aria-hidden="true"
    >
      <defs>
        <pattern id={`leaf-${flip ? 'b' : 'a'}`} width="20" height="10" patternUnits="userSpaceOnUse">
          <path
            d="M2 8 Q6 2 10 8 Q14 2 18 8"
            fill="none"
            stroke="var(--banner-ink)"
            strokeOpacity="0.6"
            strokeWidth="1.2"
          />
          <circle cx="10" cy="8" r="1.1" fill="var(--banner-ink)" fillOpacity="0.45" />
          <circle cx="2" cy="8" r="0.9" fill="var(--banner-ink)" fillOpacity="0.3" />
        </pattern>
      </defs>
      <rect width="120" height="10" fill={`url(#leaf-${flip ? 'b' : 'a'})`} />
    </svg>
  );
}

export function TopBanner({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="w-full bg-[var(--banner-tan)]">
      <LeafBorder />
      <div className="flex flex-col items-center justify-center px-4 py-[18px] text-center">
        <h1
          className="font-body text-[19px] font-black uppercase leading-none tracking-[0.05em] sm:text-[26px] md:text-[28px]"
          style={{ color: 'var(--banner-ink)' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 font-body text-[11px] font-bold uppercase tracking-[0.16em] opacity-70" style={{ color: 'var(--banner-ink)' }}>
            {subtitle}
          </p>
        )}
      </div>
      <LeafBorder flip />
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Summoning circle                                                    */
/* ------------------------------------------------------------------ */

export function SummoningCircle({ size = 620, className }: { size?: number; className?: string }) {
  const points = Array.from({ length: 7 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 7 - Math.PI / 2;
    return `${140 + Math.cos(angle) * 118},${140 + Math.sin(angle) * 118}`;
  }).join(' ');

  return (
    <svg
      viewBox="0 0 280 280"
      width={size}
      height={size}
      className={clsx('hgd-circle pointer-events-none absolute', className)}
      aria-hidden="true"
    >
      <circle cx="140" cy="140" r="132" fill="none" stroke="var(--gold)" strokeWidth="1" />
      <circle cx="140" cy="140" r="118" fill="none" stroke="var(--gold)" strokeWidth="0.6" />
      <circle cx="140" cy="140" r="86" fill="none" stroke="var(--gold)" strokeWidth="0.6" />
      <polygon points={points} fill="none" stroke="var(--gold)" strokeWidth="0.8" />
      <polygon
        points={Array.from({ length: 7 }, (_, i) => {
          const angle = (Math.PI * 2 * i) / 7 - Math.PI / 2;
          return `${140 + Math.cos(angle) * 96},${140 + Math.sin(angle) * 96}`;
        }).join(' ')}
        fill="none"
        stroke="var(--gold)"
        strokeWidth="0.5"
        transform="rotate(25.7 140 140)"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

export function ClassBadge({ cls, className }: { cls: ServantClass; className?: string }) {
  const meta = CLASS_META[cls];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-[3px] text-[11px] font-bold uppercase tracking-wide',
        className,
      )}
      style={{ borderLeft: `2px solid ${meta.color}` }}
    >
      <span aria-hidden="true">{meta.icon}</span>
      <span style={{ color: meta.color }}>{meta.label}</span>
    </span>
  );
}

export function TierBadge({ tier, className }: { tier: string; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md border border-gold-dark bg-surface-2 px-2 py-[2px] font-body text-[11px] font-bold text-gold',
        className,
      )}
      title="VS Battles tier"
    >
      {tier}
    </span>
  );
}

export function TagList({ tags }: { tags: PersonalityTag[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span key={tag} className="rounded bg-surface-2 px-1.5 py-[2px] text-[10px] uppercase tracking-wide text-muted">
          {tag}
        </span>
      ))}
    </div>
  );
}

export function ConfidenceDot({ confidence }: { confidence?: 'high' | 'medium' | 'low' }) {
  const map = { high: 'var(--success)', medium: 'var(--gold)', low: 'var(--crimson)' } as const;
  const label = confidence ?? 'low';
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted" title={`Confidence: ${label}`}>
      <span className="h-2 w-2 rounded-full" style={{ background: map[label] }} />
      {label}
    </span>
  );
}

export function PlayerDot({ player }: { player: Player }) {
  return (
    <span
      className={clsx('inline-block h-2 w-2 rounded-full')}
      style={{ background: player.connected ? 'var(--success)' : '#5a5a63' }}
      title={player.connected ? 'Connected' : 'Disconnected'}
    />
  );
}

export function AvatarCircle({ player }: { player: Player }) {
  const color = PLAYER_COLORS[player.colorIndex % PLAYER_COLORS.length];
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-black uppercase text-[#121216]"
      style={{ background: color }}
      aria-hidden="true"
    >
      {player.nickname.slice(0, 1)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Portrait                                                            */
/* ------------------------------------------------------------------ */

interface PortraitProps {
  src?: string;
  name: string;
  alt?: string;
  size?: number;
  cls?: ServantClass;
  dead?: boolean;
  injured?: number;
  winner?: boolean;
  onClick?: () => void;
  className?: string;
  showCaption?: boolean;
  fallback?: string;
}

export function Portrait({
  src,
  name,
  alt,
  size,
  cls,
  dead,
  injured,
  winner,
  onClick,
  className,
  showCaption,
  fallback,
}: PortraitProps) {
  const classColor = cls ? CLASS_META[cls].color : undefined;
  const Tag = onClick ? 'button' : 'div';
  const image = src || fallback || generatedAvatar(name);

  return (
    <Tag
      onClick={onClick}
      className={clsx('group flex flex-col items-stretch', onClick && 'cursor-pointer', className)}
      style={size ? { width: size, maxWidth: '100%' } : undefined}
      aria-label={onClick ? `Open details for ${name}` : undefined}
      type={onClick ? 'button' : undefined}
    >
      <div className="relative">
        <img
          src={image}
          alt={alt ?? `Portrait of ${name}`}
          loading="lazy"
          onError={onPortraitError(name)}
          className={clsx(
            'hgd-portrait-frame rounded-[2px] transition-[border-color,filter] duration-200',
            dead && 'hgd-fallen',
            winner && 'border-gold shadow-[0_0_28px_rgba(201,164,92,.45)]',
          )}
          style={winner ? { borderColor: 'var(--gold)' } : classColor ? { borderColor: '#6b5f4b' } : undefined}
        />
        {dead && (
          <>
            <span className="absolute inset-0 flex items-center justify-center text-[34px]" aria-hidden="true">
              💀
            </span>
            <span
              className="absolute inset-0 rounded-[2px]"
              style={{ background: 'rgba(12,12,15,.55)' }}
              aria-hidden="true"
            />
            <span className="absolute inset-0 flex items-center justify-center text-[40px] font-black text-crimson" aria-hidden="true">
              ✕
            </span>
          </>
        )}
        {!dead && injured ? (
          <span
            className="pointer-events-none absolute inset-0 rounded-[2px]"
            style={{ boxShadow: 'inset 0 0 26px rgba(179,40,61,.75)' }}
            aria-hidden="true"
          />
        ) : null}
        {cls && (
          <span
            className="absolute bottom-1 left-1 rounded bg-[rgba(12,12,15,.8)] px-1 py-[1px] text-[11px]"
            aria-hidden="true"
          >
            {CLASS_META[cls].icon}
          </span>
        )}
        {injured ? (
          <span
            className="absolute right-1 top-1 rounded bg-[rgba(12,12,15,.85)] px-1 text-[10px] font-bold text-crimson"
            title={`${injured} injur${injured === 1 ? 'y' : 'ies'}`}
          >
            {'\u2580'.repeat(0)}
            {Array.from({ length: injured }, () => '|').join('')}
          </span>
        ) : null}
      </div>
      {showCaption !== false && (
        <span className="mt-1 line-clamp-1 text-center text-[11px] text-muted">{name}</span>
      )}
    </Tag>
  );
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-4 right-3 z-50 flex w-[min(92vw,360px)] flex-col gap-2 sm:bottom-auto sm:top-4">
      {toasts.map((toast: Toast, i) => (
        <motion.button
          key={`${toast.message}-${i}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => dismiss(i)}
          className={clsx(
            'hgd-card pointer-events-auto px-3 py-2 text-left text-sm',
            toast.kind === 'error' && 'border-crimson',
            toast.kind === 'success' && 'border-[var(--success)]',
            toast.kind === 'warn' && 'border-gold',
          )}
        >
          {toast.message}
        </motion.button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sticky in-room header                                               */
/* ------------------------------------------------------------------ */

export function StickyHeader({ right }: { right?: React.ReactNode }) {
  const room = useStore((s) => s.room);
  const playerId = useStore((s) => s.playerId);
  const pushToast = useStore((s) => s.pushToast);
  const leaveRoom = useStore((s) => s.leaveRoom);
  if (!room) return null;

  const me = room.players.find((p) => p.id === playerId);
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      pushToast({ kind: 'success', message: 'Room code copied.' });
    } catch {
      pushToast({ kind: 'warn', message: `Code: ${room.code}` });
    }
  };

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-[rgba(12,12,15,.86)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2">
        <button onClick={copyCode} className="hgd-btn hgd-btn-ghost !min-h-[36px] !px-2 font-display text-[15px] font-bold tracking-[0.2em] text-gold" title="Copy room code">
          {room.code}
        </button>
        <span className="hidden text-[12px] uppercase tracking-wider text-muted sm:inline">{room.phase}</span>
        <span className="text-[12px] text-muted">
          {room.players.filter((p) => !p.isSpectator).length} Masters
          {room.spectators ? ` · ${room.spectators} spectating` : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {right}
          <span className="hidden text-[12px] text-muted sm:inline">{me?.nickname}</span>
          <button onClick={leaveRoom} className="hgd-btn hgd-btn-ghost !min-h-[36px]">
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Motion helpers                                                      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Attribution                                                         */
/* ------------------------------------------------------------------ */

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={clsx('mx-auto max-w-3xl px-4 pb-8 pt-6 text-center text-[10.5px] leading-relaxed text-muted', className)}>
      <p>
        Power-scaling data courtesy of the{' '}
        <a
          href="https://vsbattles.fandom.com/wiki/Attack_Potency"
          target="_blank"
          rel="noreferrer noopener"
          className="text-gold underline"
        >
          VS Battles Wiki
        </a>{' '}
        (CC BY-SA). Character data from AniList and Wikipedia. Fan project, not affiliated with Type-Moon or any
        rights holder of the characters used. Non-commercial.
      </p>
      <p className="mt-1">
        Images are shown transiently through a caching proxy and are never stored permanently. Portraits belong to
        their respective owners.
      </p>
      <p className="mt-2 text-center">
        <a
          href="https://abhinavaagiri.com"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-block font-body text-[11px] tracking-[0.18em] text-gold no-underline transition-opacity hover:opacity-80"
          style={{ textDecoration: 'none' }}
        >
          ~ Abhinav Aagiri ~
        </a>
      </p>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,6,9,.74)] p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx('hgd-card hgd-rise w-full overflow-hidden p-4', wide ? 'max-w-2xl' : 'max-w-md')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="hgd-heading text-base">{title}</h2>
          <button
            type="button"
            className="hgd-btn hgd-btn-ghost !min-h-[30px] !px-2"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            ✕
          </button>
        </div>
        <div className="text-[13px] leading-relaxed text-ink">{children}</div>
        {footer && <div className="mt-3 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Rise({ children, delay = 0, ...rest }: HTMLMotionProps<'div'> & { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
