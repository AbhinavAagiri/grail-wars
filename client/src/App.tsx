import { useEffect } from 'react';
import { clsx } from 'clsx';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useStore } from './store';
import { SiteFooter, Toasts } from './components/ui';
import { EarlyAccessNotice } from './components/EarlyAccessNotice';
import Landing from './pages/Landing';
import Credits from './pages/Credits';
import Contact from './pages/Contact';
import Lobby from './pages/Lobby';
import Draft from './pages/Draft';
import Summon from './pages/Summon';
import Research from './pages/Research';
import War from './pages/War';
import Arena from './pages/Arena';
import Results from './pages/Results';

/** Renders whichever screen the server's phase calls for. */
function RoomRouter() {
  const { code } = useParams<{ code: string }>();
  const room = useStore((s) => s.room);
  const session = useStore((s) => s.session);

  // Someone opening a shared link still has to join with a nickname.
  if (!session || session.code !== code?.toUpperCase()) {
    return <Landing presetCode={code?.toUpperCase()} />;
  }
  if (!room) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        <p className="hgd-rise">Rejoining the war…</p>
      </div>
    );
  }

  switch (room.phase) {
    case 'LOBBY':
      return <Lobby />;
    case 'DRAFT':
      return <Draft />;
    case 'SUMMON':
      return <Summon />;
    case 'RESEARCH':
      return <Research />;
    case 'REVIEW':
      return <Research review />;
    case 'WAR':
      return <War />;
    case 'ARENA':
      return <Arena />;
    case 'RESULTS':
      return <Results />;
    default:
      return <Lobby />;
  }
}

export default function App() {
  const connected = useStore((s) => s.connected);
  const pushToast = useStore((s) => s.pushToast);
  const { pathname } = useLocation();
  // The landing screen is a single screen — nav, hero, play controls and footer
  // share one viewport with no page scroll. Every other route is a normal
  // scrolling document.
  const singleScreen = pathname === '/';

  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => undefined, 30000);
    return () => clearInterval(id);
  }, [connected]);

  useEffect(() => {
    const onOffline = () => pushToast({ kind: 'warn', message: 'Connection lost — retrying…' });
    const onOnline = () => pushToast({ kind: 'success', message: 'Reconnected.' });
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [pushToast]);

  return (
    <>
      {!connected && (
        <div className="fixed inset-x-0 top-0 z-50 bg-crimson px-4 py-2 text-center text-sm font-bold text-white">
          Reconnecting to the Grail…
        </div>
      )}
      {/* A viewport-height column so the footer is part of the screen rather than
          something below it. The landing screen gets a *fixed* height (so its
          content shrinks to fit instead of growing the page); every other route
          keeps a minimum height and scrolls normally. */}
      <div className={clsx('flex flex-col', singleScreen ? 'h-dvh overflow-hidden' : 'min-h-dvh')}>
        <div className="flex min-h-0 flex-1 flex-col">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/credits" element={<Credits />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/room/:code" element={<RoomRouter />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        {/* Attribution sits under every screen — landing, lobby, draft, war, arena. */}
        <SiteFooter compact={singleScreen} />
      </div>
      <Toasts />
      {/* Shown once per page load, on every route: the game is an early release. */}
      <EarlyAccessNotice />
    </>
  );
}
