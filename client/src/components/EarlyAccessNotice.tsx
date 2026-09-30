import { useCallback, useEffect, useState } from 'react';

/** Set once the notice has been dismissed, for the life of the browser tab. */
const SEEN_KEY = 'hgd:early-access-ack';

/**
 * `sessionStorage` is the right scope here: it survives a reload — so a mid-game
 * refresh is not interrupted — but a new tab or a returning visitor in a fresh
 * session sees the notice again. Storage can be unavailable (private windows,
 * blocked cookies), in which case we fall back to showing it.
 */
function hasBeenAcknowledged(): boolean {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberAcknowledgement(): void {
  try {
    window.sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Nothing to do — the notice simply reappears on the next load.
  }
}

/**
 * The early-access notice.
 *
 * The game is playable but unfinished, and a player who hits something broken
 * should know that before they conclude the site is simply broken. It shows on
 * the first page load of a session, on any route — landing, lobby, war, arena —
 * and any click anywhere, or a key press, dismisses it for that session.
 */
export function EarlyAccessNotice() {
  const [open, setOpen] = useState(() => !hasBeenAcknowledged());

  const close = useCallback(() => {
    setOpen(false);
    rememberAcknowledgement();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = () => close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex cursor-pointer items-center justify-center bg-[rgba(6,6,9,.84)] p-4 backdrop-blur-sm"
      // Clicking anywhere closes it, including on the card itself.
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Early access notice"
    >
      <div className="hgd-card hgd-rise w-full max-w-lg p-5 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-gold">Early Access · V.0.5</p>
        <h2 className="hgd-heading mt-2 text-[19px]">This is an early release</h2>

        <p className="mt-3 text-[13px] leading-relaxed text-ink">
          This party game and website are still in development. Things are changing week to week, so expect rough
          edges — some parts may look unfinished, behave oddly, or be broken altogether.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-ink">
          If you come across a bug, or anything at all that feels off, tell me through the{' '}
          <span className="font-bold text-gold">Contact page on the home screen</span> and I will work to fix it by the
          next update.
        </p>
        <p className="mt-3 text-[12px] text-muted">Thanks for playing it this early. — Abhinav</p>

        <p className="mt-4 border-t border-border pt-3 text-[10px] uppercase tracking-[0.2em] text-muted">
          click anywhere to close
        </p>
      </div>
    </div>
  );
}
