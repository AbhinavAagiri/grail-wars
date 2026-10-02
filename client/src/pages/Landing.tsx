import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LIMITS, ROOM_CODE_LENGTH } from '@hgd/shared';
import { SummoningCircle, Rise } from '../components/ui';
import { SiteNav } from '../components/SiteNav';
import { loadNickname, saveNickname, useStore } from '../store';

export default function Landing({ presetCode }: { presetCode?: string }) {
  const navigate = useNavigate();
  const room = useStore((s) => s.room);
  const session = useStore((s) => s.session);
  const createRoom = useStore((s) => s.createRoom);
  const joinRoom = useStore((s) => s.joinRoom);
  const pushToast = useStore((s) => s.pushToast);

  const [nickname, setNickname] = useState(loadNickname());
  const [joining, setJoining] = useState(Boolean(presetCode));
  const [digits, setDigits] = useState<string[]>(() => {
    const initial = (presetCode ?? '').toUpperCase().slice(0, ROOM_CODE_LENGTH).split('');
    return Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => initial[i] ?? '');
  });
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // Once the server sends our room state, follow it.
  useEffect(() => {
    if (room && session) navigate(`/room/${room.code}`, { replace: true });
  }, [room, session, navigate]);

  const nicknameOk = nickname.trim().length >= 1;

  const requireNickname = (): boolean => {
    if (nicknameOk) return true;
    pushToast({ kind: 'warn', message: 'Pick a nickname first.' });
    return false;
  };

  const handleCreate = () => {
    if (!requireNickname()) return;
    saveNickname(nickname.trim());
    createRoom(nickname.trim());
  };

  const handleJoin = () => {
    const code = digits.join('').toUpperCase();
    if (code.length !== ROOM_CODE_LENGTH) {
      pushToast({ kind: 'warn', message: `Room codes are ${ROOM_CODE_LENGTH} letters.` });
      return;
    }
    if (!requireNickname()) return;
    saveNickname(nickname.trim());
    joinRoom(code, nickname.trim());
  };

  const setDigit = (index: number, value: string) => {
    const clean = value.replace(/[^a-zA-Z]/g, '').toUpperCase();
    setDigits((current) => {
      const next = [...current];
      if (clean.length > 1) {
        // Pasted a whole code.
        const chars = clean.slice(0, ROOM_CODE_LENGTH).split('');
        chars.forEach((c, i) => {
          next[i] = c;
        });
        return next;
      }
      next[index] = clean;
      return next;
    });
    if (clean && index < ROOM_CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  return (
    // One screen, no page scroll: the nav, the hero, the play controls and the
    // mode cards share the space between the menu bar and the footer.
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <SiteNav />
      <SummoningCircle size={680} className="left-1/2 top-[-120px] -translate-x-1/2" />

      {/* If a window is genuinely too short for the content, this column scrolls
          rather than silently clipping the play controls. */}
      <div className="hgd-scroll relative flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-2 sm:py-3">
        <div className="my-auto w-full">
          <Rise className="mx-auto w-full max-w-xl text-center">
            <h1 className="hgd-heading text-[clamp(24px,5vh,42px)] leading-[1.05]">
              GRAIL <br />
              WARS
            </h1>
            <p className="mt-1.5 font-body text-[13px] text-muted sm:mt-2 sm:text-[14px]">Draft your heroes. Summon your fate.</p>
          </Rise>

          <Rise delay={0.05} className="hgd-card mx-auto mt-3 w-full max-w-xl p-3 sm:mt-4 sm:p-4 lg:p-5">
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted" htmlFor="nickname">
              Your name (Master)
            </label>
            <input
              id="nickname"
              className="hgd-input"
              placeholder="e.g. Rin"
              maxLength={LIMITS.NAME_MAX}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (joining ? handleJoin() : handleCreate())}
            />

            {!joining ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" className="hgd-btn hgd-btn-primary w-full" onClick={handleCreate}>
                  Create Room
                </button>
                <button
                  type="button"
                  className="hgd-btn hgd-btn-secondary w-full"
                  onClick={() => {
                    setJoining(true);
                    setTimeout(() => inputs.current[0]?.focus(), 30);
                  }}
                >
                  Join Room
                </button>
              </div>
            ) : (
              <div className="mt-3">
                <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Room code</label>
                <div className="flex justify-center gap-2">
                  {digits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        inputs.current[i] = el;
                      }}
                      value={digit}
                      onChange={(e) => setDigit(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
                        if (e.key === 'Enter') handleJoin();
                      }}
                      onPaste={(e) => {
                        e.preventDefault();
                        setDigit(0, e.clipboardData.getData('text'));
                      }}
                      inputMode="text"
                      autoCapitalize="characters"
                      autoComplete="off"
                      maxLength={ROOM_CODE_LENGTH}
                      aria-label={`Room code character ${i + 1}`}
                      className="hgd-input !min-h-[44px] w-[46px] text-center font-display text-[22px] font-bold tracking-widest text-gold sm:w-[52px]"
                    />
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" className="hgd-btn hgd-btn-primary w-full" onClick={handleJoin}>
                    Join
                  </button>
                  <button type="button" className="hgd-btn hgd-btn-ghost w-full" onClick={() => setJoining(false)}>
                    Back
                  </button>
                </div>
              </div>
            )}

            <p className="mt-2.5 text-center text-[11px] text-muted">
              {LIMITS.MIN_PLAYERS}–{LIMITS.MAX_PLAYERS_DEFAULT} Masters per room, up to {LIMITS.MAX_PLAYERS_EXTENDED} in
              an Extended War.
            </p>
          </Rise>

          <Rise
            delay={0.1}
            className="mx-auto mt-3 grid w-full max-w-xl grid-cols-2 gap-2 text-[11.5px] leading-tight text-muted sm:mt-4 sm:text-[12px]"
          >
            <div className="hgd-card px-3 py-2.5 sm:p-3">
              <p className="mb-0.5 font-bold text-ink">⚔️ Web-Driven War</p>
              <p>Every Servant is researched and power-scaled, then a five-day war plays out one event at a time.</p>
            </div>
            <div className="hgd-card px-3 py-2.5 sm:p-3">
              <p className="mb-0.5 font-bold text-ink">
                🗣️ Debate Arena{' '}
                <span className="rounded bg-gold px-1.5 py-[2px] align-middle text-[9px] font-black uppercase leading-none text-[#1a1408]">
                  New
                </span>
              </p>
              <p>Random 1v1 matchups. Every Master argues their Servant, everyone votes, winners advance.</p>
            </div>
          </Rise>
        </div>
      </div>

      {/* Home-page only build stamp. */}
      <p className="pointer-events-none fixed bottom-2 right-3 z-30 font-body text-[10px] uppercase tracking-[0.18em] text-muted">
        Early Access V.0.5
      </p>
    </div>
  );
}
