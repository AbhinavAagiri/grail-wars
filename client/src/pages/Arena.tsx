import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { roundName } from '@hgd/shared';
import { StickyHeader, TopBanner } from '../components/ui';
import { BracketView } from '../components/BracketView';
import { ChatPanel } from '../components/ChatPanel';
import { VotePanel } from '../components/VotePanel';
import { useStore } from '../store';

function useCountdown(endsAt?: number): number {
  const skew = useStore((s) => s.serverSkewMs);
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!endsAt) {
      setRemaining(0);
      return;
    }
    const tick = () => setRemaining(Math.max(0, endsAt - (Date.now() + skew)));
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [endsAt, skew]);
  return remaining;
}

const PHASE_LABEL: Record<string, string> = {
  INTRO: 'Matchup',
  ARGUE: 'Arguing',
  VOTE: 'Voting',
  REVEAL: 'Result',
  CHAMPION: 'Champion',
  IDLE: 'Waiting',
};

export default function Arena() {
  const navigate = useNavigate();
  const room = useStore((s) => s.room)!;
  const playerId = useStore((s) => s.playerId);
  const arenaMatch = useStore((s) => s.arenaMatch);
  const arenaPhaseInfo = useStore((s) => s.arenaPhaseInfo);
  const arenaVotes = useStore((s) => s.arenaVotes);
  const arenaResult = useStore((s) => s.arenaResult);
  const championId = useStore((s) => s.championId);
  const chat = useStore((s) => s.chat);
  const sendChat = useStore((s) => s.sendChat);
  const vote = useStore((s) => s.vote);
  const arenaSkip = useStore((s) => s.arenaSkip);
  const arenaTiebreak = useStore((s) => s.arenaTiebreak);

  const [showChat, setShowChat] = useState(false);

  const arena = room.arena;
  const servants = room.servants ?? [];
  const isHost = room.hostId === playerId;
  const phase = arenaPhaseInfo?.phase ?? arena?.phase ?? 'IDLE';
  const endsAt = arenaPhaseInfo?.endsAt ?? arena?.endsAt;
  const remaining = useCountdown(endsAt);

  const match = arenaResult?.match ?? arenaMatch;
  const current = match && (!arenaMatch || arenaMatch.id === match.id) ? match : arenaMatch;

  useEffect(() => {
    if (phase === 'VOTE') setMyVote(undefined);
  }, [phase, current?.id]);

  // The server flips the phase to RESULTS once a champion exists.
  useEffect(() => {
    if (room.phase === 'RESULTS') navigate(`/room/${room.code}`, { replace: true });
  }, [room.phase, room.code, navigate]);

  const meInMatch = current ? servants.find((s) => s.id === current.a || s.id === current.b)?.playerId === playerId : false;
  const canVote = Boolean(current) && !(meInMatch && !room.settings.debate.ownersVote) && !room.players.find((p) => p.id === playerId)?.isSpectator;

  const openingStatements = phase === 'ARGUE' && remaining > Math.max(0, (room.settings.debate.argueSec - 20) * 1000);
  const canSpeak = !openingStatements || meInMatch;

  const champion = championId ? servants.find((s) => s.id === championId) : undefined;

  return (
    <div className="min-h-screen">
      <TopBanner title="Debate Arena" subtitle="Argue. Vote. Advance." />
      <StickyHeader
        right={
          phase !== 'IDLE' && phase !== 'CHAMPION' ? (
            <span className="text-[11px] text-gold">
              {PHASE_LABEL[phase] ?? phase}
              {remaining > 0 ? ` · ${Math.ceil(remaining / 1000)}s` : ''}
            </span>
          ) : null
        }
      />

      <div className="mx-auto max-w-6xl px-3 py-4">
        <section className="hgd-card p-3">
          <h2 className="hgd-heading mb-2 text-[13px] uppercase tracking-wide">Bracket</h2>
          <BracketView
            bracket={arena?.bracket ?? []}
            servants={servants}
            currentMatchId={arena?.currentMatchId}
            totalRounds={totalRounds}
            canPick={isHost && pendingTie}
            onPick={arenaTiebreak}
          />
        </section>

        {champion && (
          <section className="hgd-card mt-4 p-6 text-center">
            <p className="text-[11px] uppercase tracking-[0.25em] text-muted">Champion</p>
            <img
              src={champion.character.imageUrl}
              alt={`Portrait of ${champion.character.name}`}
              className="mx-auto mt-3 h-32 w-32 rounded object-cover"
              style={{ border: '3px solid var(--gold)', boxShadow: '0 0 40px rgba(201,164,92,.45)' }}
            />
            <h2 className="hgd-heading mt-3 text-2xl">{champion.character.name}</h2>
            <p className="text-[12px] text-muted">
              Master: <span className="text-gold">{champion.masterName}</span>
            </p>
          </section>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <section className="hgd-card p-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="hgd-heading text-[13px] uppercase tracking-wide">
                {currentRound
                  ? `Round ${currentRound}${totalRounds ? ` of ${totalRounds} · ${roundName(currentRound, totalRounds)}` : ''}`
                  : 'Waiting for the bracket'}
              </h2>
              {isHost && (
                <button type="button" className="hgd-btn hgd-btn-ghost !min-h-[32px] !px-3 !text-[11px]" onClick={arenaSkip}>
                  Skip phase
                </button>
              )}
            </div>

            {roundByes.length > 0 && (
              <p className="mb-3 rounded border border-border bg-surface-2 px-2 py-1.5 text-[11.5px] text-muted">
                <span className="text-gold">{roundByes.map((m) => nameOf(m.bye)).join(', ')}</span>{' '}
                {roundByes.length === 1 ? 'draws' : 'draw'} a bye into the next round.
              </p>
            )}

            {current ? (
              <VotePanel
                match={current}
                servants={servants}
                phase={phase}
                myVote={myVote}
                myPlayerId={playerId}
                canVote={canVote}
                reveal={arenaResult ? arenaResult.counts : undefined}
                onVote={(choice) => {
                  setMyVote(choice);
                  vote(choice);
                }}
              />
            ) : (
              <p className="text-[13px] text-muted">Waiting for the next matchup…</p>
            )}

            {phase === 'VOTE' && (
              <p className="mt-3 text-center text-[12px] text-muted">
                {arenaVotes ? `${arenaVotes.votedCount} / ${arenaVotes.eligibleCount} voted` : 'Votes are hidden until the reveal.'}
              </p>
            )}
            {arenaVotes?.tie && isHost && (
              <p className="mt-2 text-center text-[12px] text-gold">
                It's a tie — pick the winner from the bracket above.
              </p>
            )}
            {arenaResult && current?.winner && (
              <p className="mt-3 text-center text-[13px] text-gold">
                {servants.find((s) => s.id === current.winner)?.character.name} advances.
                {current.tieBroken && ` (tie-break: ${current.tieBroken})`}
              </p>
            )}
          </section>

          <section className="min-h-[320px]">
            <ChatPanel
              messages={chat}
              onSend={sendChat}
              openingStatements={openingStatements}
              canSpeak={canSpeak}
              disabled={phase === 'CHAMPION'}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
