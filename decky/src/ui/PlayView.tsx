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


// The nearest seat count this game can actually be dealt in. A partnership game seats in pairs,
// so "three by default" has to become four rather than sliding to five and leaving somebody
// without a partner.
function seatsFor(def: GameDefinition, want: number): number {
  const { min, max, step = 1 } = def.meta.players;
  const clamped = Math.min(Math.max(want, min), max);
  return min + Math.floor((clamped - min) / step) * step;
}

// Discover + play the classics library (and, once wired, published community games).
export function PlayView() {
  const { settings } = useSettings();
  const [game, setGame] = useState<GameDefinition | null>(null);
  const [seats, setSeats] = useState(settings.defaultSeats);
  const [resumable, setResumable] = useState<
    { gameId: string; name: string; matchId: string; seats: number } | null>(null);
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
  // Distinct from hostUp itself: true once we've actually heard back, so "no host" can be
  // said outright instead of guessed at during the moment the check is still in flight.
  const [hostChecked, setHostChecked] = useState(false);
  // Every table still in play, so a second game does not quietly abandon the first.
  const [inProgress, setInProgress] = useState<OpenGame[]>([]);
  // Which table to pick back up, when one was chosen from the list.
  const [resumeId, setResumeId] = useState<string | null>(null);

  useEffect(() => { void hostInfo().then((h) => setHostUp(h.up)).finally(() => setHostChecked(true)); }, []);

  // Refreshed whenever we come back to the shelf, which is the only time it is on screen.
  useEffect(() => { if (!game && !setupFor && !onlineFor) setInProgress(openGames()); },
    [game, setupFor, onlineFor]);

  // Offer to pick up an unfinished game rather than silently dropping it.
  useEffect(() => {
    const saved = resumableSession();
    if (!saved) return;
    const def = catalog.find((g) => g.meta.id === saved.gameId);
    if (def) setResumable({ gameId: saved.gameId, name: def.meta.name, matchId: saved.matchId, seats: saved.seats });
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
        defaultSeats={seatsFor(setupFor, settings.defaultSeats)}
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
          {/* The range comes from the game. Hard-coded 2..6, this offered seats Spades cannot
              use and — worse — never offered the seventh and eighth that Showdown Poker and
              Pit both declare, so the top of their range was unreachable. */}
          {!game.solitaire && !plan && !session && (
            <div className="seat-control">
              <span>Seats</span>
              {Array.from(
                { length: game.meta.players.max - game.meta.players.min + 1 },
                (_, i) => game.meta.players.min + i,
              ).filter((n) => (n - game.meta.players.min) % (game.meta.players.step ?? 1) === 0).map((n) => (
                <button key={n} className={`seg-btn ${seats === n ? 'on' : ''}`}
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
              // Name the table. Leaving it to Table's own lookup dealt a brand new hand
              // whenever the seat count on screen differed from the saved one — which it did
              // for every game whose table is bigger or smaller than the default, so Spades,
              // Hearts, Euchre and War all "resumed" into a fresh three-handed deal.
              if (def) {
                setSeats(seatsFor(def, resumable.seats));
                setPlan(null); setPractice(false);
                setResumeId(resumable.matchId); setGame(def); setResumable(null);
              }
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
          setSeats(seatsFor(def, settings.defaultSeats));
          setGame(def);
        }}
        onSetup={(def) => { recordPlay(def.meta.id); setSetupFor(def); }}
        onOnline={hostUp ? (def) => { recordPlay(def.meta.id); setOnlineFor(def); } : undefined}
        onlineHostDown={hostChecked && !hostUp}
      />
    </div>
  );
}
