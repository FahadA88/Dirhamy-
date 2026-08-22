import { useEffect, useState } from 'react';
import { catalog } from '../games/catalog';
import { Table } from './Table';
import { SolitaireTable } from './SolitaireTable';
import { ErrorBoundary } from './ErrorBoundary';
import { GameHelp } from './GameHelp';
import { OpenGame, openGames, resumableSession } from '../server/local';
import { Seat } from '../server/matchService';
import { SeatSetup } from './SeatSetup';
import { GameDefinition } from '../engine/types';
import { useSettings } from '../settings/SettingsContext';
import { BrowseView } from './BrowseView';
import { OnlineTable, OnlineSession } from './OnlineTable';
import { hostInfo } from '../net/host';
import { recordPlay } from '../library/library';

// Discover + play the classics library (and, once wired, published community games).
export function PlayView() {
  const { settings } = useSettings();
  const [game, setGame] = useState<GameDefinition | null>(null);
  const [seats, setSeats] = useState(settings.defaultSeats);
  const [resumable, setResumable] = useState<{ gameId: string; name: string } | null>(null);
  const [helpFor, setHelpFor] = useState<GameDefinition | null>(null);
  const [plan, setPlan] = useState<Seat[] | null>(null);
  const [setupFor, setSetupFor] = useState<GameDefinition | null>(null);
  // A practice game is played but never counted. Chosen at the table, cleared when you leave it.
  const [practice, setPractice] = useState(false);
  // Playing with other people: which game is being set up, and the live session once joined.
  const [onlineFor, setOnlineFor] = useState<GameDefinition | null>(null);
  const [session, setSession] = useState<OnlineSession | null>(null);
  // Whether a host is even running. Until we know, the online button stays hidden rather than
  // appearing and then failing.
  const [hostUp, setHostUp] = useState(false);
  // Every table still in play, so a second game does not quietly abandon the first.
  const [inProgress, setInProgress] = useState<OpenGame[]>([]);
  // Which table to pick back up, when one was chosen from the list.
  const [resumeId, setResumeId] = useState<string | null>(null);

  useEffect(() => { void hostInfo().then((h) => setHostUp(h.up)); }, []);

  // Refreshed whenever we come back to the shelf, which is the only time it is on screen.
  useEffect(() => { if (!game && !setupFor && !onlineFor) setInProgress(openGames()); },
    [game, setupFor, onlineFor]);

  // Offer to pick up an unfinished game rather than silently dropping it.
  useEffect(() => {
    const saved = resumableSession();
    if (!saved) return;
    const def = catalog.find((g) => g.meta.id === saved.gameId);
    if (def) setResumable({ gameId: saved.gameId, name: def.meta.name });
  }, []);

  if (onlineFor && !session) {
    return (
      <OnlineTable
        def={onlineFor}
        onCancel={() => setOnlineFor(null)}
        onStart={(s) => { setSession(s); setGame(onlineFor); setOnlineFor(null); }}
      />
    );
  }

  if (setupFor) {
    return (
      <SeatSetup
        def={setupFor}
        defaultSeats={Math.min(Math.max(settings.defaultSeats, setupFor.meta.players.min), setupFor.meta.players.max)}
        defaultName={settings.playerName}
        onCancel={() => setSetupFor(null)}
        onStart={(seatPlan, isPractice) => {
          setPlan(seatPlan); setSeats(seatPlan.length); setPractice(isPractice);
          setGame(setupFor); setSetupFor(null);
        }}
      />
    );
  }

  if (game) {
    return (
      <div>
        <div className="crumbs">
          <button className="ghost" onClick={() => {
            session?.client.end();
            setSession(null); setGame(null); setPlan(null); setPractice(false); setResumeId(null);
          }}>← All games</button>
          <span className="crumb-title">{game.meta.name}</span>
          {practice && <span className="practice-badge" title="Nothing here is recorded">Practice</span>}
          {session && (
            <span className="table-code" title="Anyone with this code can join">
              Table <b>{session.code}</b>
            </span>
          )}
          <button className="ghost sm" onClick={() => setHelpFor(game)}>Rules</button>
          {!game.solitaire && !plan && !session && (
            <div className="seat-control">
              <span>Seats</span>
              {[2, 3, 4, 5, 6].map((n) => (
                <button key={n} className={`seg-btn ${seats === n ? 'on' : ''}`}
                  disabled={n < game.meta.players.min || n > game.meta.players.max}
                  onClick={() => setSeats(n)}>{n}</button>
              ))}
            </div>
          )}
        </div>
        <ErrorBoundary label={game.meta.name}>
          {game.solitaire
            ? <SolitaireTable def={game} />
            : <Table
                def={game}
                seats={session ? session.seats.length : seats}
                plan={session ? session.seats : (plan ?? undefined)}
                practice={practice}
                client={session?.client}
                mySeat={session?.seat}
                resumeMatchId={resumeId ?? undefined}
              />}
        </ErrorBoundary>
        {helpFor && <GameHelp def={helpFor} onClose={() => setHelpFor(null)} />}
      </div>
    );
  }

  return (
    <div className="library">
      {resumable && inProgress.length <= 1 && (
        <div className="resume glass" role="status">
          <span>You have an unfinished game of <b>{resumable.name}</b>.</span>
          <div className="resume-actions">
            <button className="ghost sm" onClick={() => setResumable(null)}>Dismiss</button>
            <button className="primary sm" onClick={() => {
              const def = catalog.find((g) => g.meta.id === resumable.gameId);
              // One game: the ordinary resume path in Table finds it. No id needed.
              if (def) { setResumeId(null); setGame(def); setResumable(null); }
            }}>Resume →</button>
          </div>
        </div>
      )}

      {/* More than one on the go. Whose turn each is waiting on is the whole point of the list. */}
      {inProgress.length > 1 && (
        <section className="inprogress glass">
          <h3>
            Games in progress
            {inProgress.some((g) => g.yourTurn) && (
              <span className="ip-count">{inProgress.filter((g) => g.yourTurn).length} waiting on you</span>
            )}
          </h3>
          <ul>
            {inProgress.map((g) => {
              const def = catalog.find((d) => d.meta.id === g.gameId);
              if (!def) return null;
              return (
                <li key={g.matchId} className={g.yourTurn ? 'mine' : ''}>
                  <span className="ip-name">{def.meta.name}</span>
                  <span className="ip-seats muted">{g.seats} seats</span>
                  <span className={`ip-turn ${g.yourTurn ? 'on' : ''}`}>
                    {g.yourTurn ? 'Your turn' : 'Waiting'}
                  </span>
                  <button className="primary sm" onClick={() => {
                    setResumeId(g.matchId);
                    setPlan(null); setPractice(false); setSeats(g.seats);
                    setGame(def); setResumable(null);
                  }}>Open</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <BrowseView
        onPlay={(def) => {
          recordPlay(def.meta.id);
          setPlan(null);
          setPractice(false);
          setResumeId(null);
          setSeats(Math.min(Math.max(settings.defaultSeats, def.meta.players.min), def.meta.players.max));
          setGame(def);
        }}
        onSetup={(def) => { recordPlay(def.meta.id); setSetupFor(def); }}
        onOnline={hostUp ? (def) => { recordPlay(def.meta.id); setOnlineFor(def); } : undefined}
      />
    </div>
  );
}
