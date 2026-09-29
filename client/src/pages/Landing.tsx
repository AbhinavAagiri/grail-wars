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
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <SiteNav />
      <SummoningCircle size={680} className="left-1/2 top-[-120px] -translate-x-1/2" />

      <div className="relative mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-10">
        <Rise className="text-center">
          <h1 className="hgd-heading text-[30px] leading-[1.1] sm:text-[42px]">
            GRAIL{' '}
            <br />
            WARS
          </h1>
          <p className="mt-3 font-body text-[14px] text-muted">Draft your heroes. Summon your fate.</p>
        </Rise>

        <Rise delay={0.05} className="hgd-card mt-8 p-4 sm:p-5">
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
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
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
            <div className="mt-4">
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
                    className="hgd-input !min-h-[56px] w-[52px] text-center font-display text-[24px] font-bold tracking-widest text-gold"
                  />
                ))}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button type="button" className="hgd-btn hgd-btn-primary w-full" onClick={handleJoin}>
                  Join
                </button>
                <button type="button" className="hgd-btn hgd-btn-ghost w-full" onClick={() => setJoining(false)}>
                  Back
                </button>
              </div>
            </div>
          )}

          <p className="mt-3 text-center text-[11px] text-muted">
            {LIMITS.MIN_PLAYERS}–{LIMITS.MAX_PLAYERS_DEFAULT} Masters per room, up to {LIMITS.MAX_PLAYERS_EXTENDED} in
            an Extended War.
          </p>
        </Rise>

        <Rise delay={0.1} className="mt-6 grid gap-2 text-[12px] text-muted sm:grid-cols-2">
          <div className="hgd-card p-3">
            <p className="mb-1 font-bold text-ink">⚔️ Web-Driven War</p>
            <p>Every Servant is researched and power-scaled, then a five-day war plays out one event at a time.</p>
          </div>
          <div className="hgd-card p-3 opacity-60">
            <p className="mb-1 font-bold text-ink">
              🗣️ Debate Arena{' '}
              <span className="text-[10px] font-black uppercase tracking-wider text-gold">Coming soon</span>
            </p>
            <p>Random 1v1 matchups. You argue your case in chat, everyone votes, winners advance.</p>
          </div>
        </Rise>
      </div>

      {/* Home-page only build stamp. */}
      <p className="pointer-events-none fixed bottom-2 right-3 z-30 font-body text-[10px] uppercase tracking-[0.18em] text-muted">
        Early Access V0.1
      </p>
    </div>
  );
}
