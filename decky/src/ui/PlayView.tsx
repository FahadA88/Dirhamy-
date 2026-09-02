import { lazy, Suspense, useEffect, useState } from 'react';
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
import type { OnlineSession } from './OnlineTable';
import { hostInfo } from '../net/host';
import { recordPlay } from '../library/library';
import { dailyGame, dailyStreak, resultFor, todayKey } from '../social/daily';
import { WebSocketApi, joinRemoteTable } from '../net/wsClient';
import { HouseRules, applyHouseRules, decodeHouseRules } from '../library/houseRules';

// Worklist #98, continued: the websocket client, the remote-table protocol and the online
// lobby only matter to the fraction of sessions that ever click "Play with people" — most
// solo and pass-and-play games never touch any of it. Deferred the same way Create is.
const OnlineTable = lazy(() => import('./OnlineTable').then((m) => ({ default: m.OnlineTable })));


// The nearest seat count this game can actually be dealt in. A partnership game seats in pairs,
// so "three by default" has to become four rather than sliding to five and leaving somebody
// without a partner.
function seatsFor(def: GameDefinition, want: number): number {
  const { min, max, step = 1 } = def.meta.players;
  const clamped = Math.min(Math.max(want, min), max);
  return min + Math.floor((clamped - min) / step) * step;
}

// Item 84: which press of the nav's Daily button has already been acted on. Module-scoped, not
// component state, because App only mounts PlayView while the Play tab is open — pressing Daily
// from Create or You bumps the trigger and mounts a BRAND NEW PlayView with that bumped value
// already in place, so a ref seeded from props on mount would see "no change" and never fire.
// Starts at 0 to match App's own initial dailyTrigger state, so first mount is not a "press".
let lastDailyTrigger: number | undefined = 0;

function ordinal(n: number): string {
  const r = n % 100;
  if (r >= 11 && r <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

// Discover + play the classics library (and, once wired, published community games).
export function PlayView({ startDailyTrigger }: { startDailyTrigger?: number } = {}) {
  const { settings, set } = useSettings();
  const [game, setGame] = useState<GameDefinition | null>(null);
  const [seats, setSeats] = useState(settings.defaultSeats);
  const [resumable, setResumable] = useState<
    { gameId: string; name: string; matchId: string; seats: number } | null>(null);
  const [helpFor, setHelpFor] = useState<GameDefinition | null>(null);
  const [plan, setPlan] = useState<Seat[] | null>(null);
  const [setupFor, setSetupFor] = useState<GameDefinition | null>(null);
  // A house rule somebody shared as a link (items 19-20) — pre-filled once Setup opens for the
  // same game the link named. Cleared the moment Setup closes, same as everything else it holds.
  const [houseRulesFor, setHouseRulesFor] = useState<({ gameId: string } & HouseRules) | null>(null);
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
  // Today's Deal: the same Klondike seed for everyone playing today (see social/daily.ts).
  const [dailyMode, setDailyMode] = useState(false);
  // Item 60 of the audit pass: the invite-link "Copy link" button built a ?table=CODE URL that,
  // until now, did nothing special when opened — it just landed on the ordinary shelf. This is
  // what makes that link actually join the table it points at.
  const [joiningLink, setJoiningLink] = useState<'idle' | 'joining' | 'error'>('idle');
  const [joinLinkError, setJoinLinkError] = useState('');

  useEffect(() => { void hostInfo().then((h) => setHostUp(h.up)).finally(() => setHostChecked(true)); }, []);

  // Item 84: the nav's Daily button bumps startDailyTrigger from any tab. Only an actual
  // increment over the last one we acted on should jump the shelf straight into today's deal —
  // see lastDailyTrigger above for why this can't be a plain mount-seeded ref.
  useEffect(() => {
    if (startDailyTrigger !== undefined && startDailyTrigger !== lastDailyTrigger) {
      lastDailyTrigger = startDailyTrigger;
      setDailyMode(true);
      setGame(dailyGame());
    }
  }, [startDailyTrigger]);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('table');
    if (!code) return;
    // Strip it from the address bar immediately — reloading, or coming back later via browser
    // history, should land on the ordinary shelf, not try to rejoin a table that may be over.
    const url = new URL(window.location.href);
    url.searchParams.delete('table');
    window.history.replaceState(null, '', url.toString());

    let cancelled = false;
    setJoiningLink('joining');
    void (async () => {
      const info = await hostInfo();
      if (cancelled) return;
      if (!info.up) { setJoinLinkError('No host is running — this link needs one to join.'); setJoiningLink('error'); return; }
      const r = await joinRemoteTable(info.base, code, settings.playerName);
      if (cancelled) return;
      if ('error' in r) { setJoinLinkError(r.error); setJoiningLink('error'); return; }
      const def = catalog.find((g) => g.meta.id === r.gameId);
      if (!def) { setJoinLinkError('This host is playing a game this app does not have.'); setJoiningLink('error'); return; }
      try {
        const { connectSession } = await import('./OnlineTable');
        const api = new WebSocketApi(info.ws);
        const session = await connectSession(api, r.matchId, r.seat, r.token, code);
        if (cancelled) { api.close(); return; }
        setSession(session);
        setGame(def);
        setJoiningLink('idle');
      } catch (e) {
        if (!cancelled) { setJoinLinkError(e instanceof Error ? e.message : 'Could not join that table.'); setJoiningLink('error'); }
      }
    })();
    return () => { cancelled = true; };
    // Deliberately runs once, reading the URL directly — re-running on every settings.playerName
    // change would try to rejoin the same link's table over and over. settings.playerName is
    // read from the synchronous initial load (see SettingsContext.tsx), so the value this
    // closure captures on mount is already the real one, not a placeholder waiting to update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('house');
    if (!code) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('house');
    window.history.replaceState(null, '', url.toString());
    const decoded = decodeHouseRules(code);
    if (!decoded) return;
    const def = catalog.find((g) => g.meta.id === decoded.gameId);
    if (!def) return;
    setHouseRulesFor(decoded);
    setSetupFor(def);
    // Deliberately runs once — the effect body only reads globals (the URL, the catalog) and
    // calls setters, neither of which react-hooks/exhaustive-deps ever asks for in the array.
  }, []);

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

  if (joiningLink === 'joining') {
    return <div className="view-loading muted">Joining the table from your link…</div>;
  }
  if (joiningLink === 'error') {
    return (
      <div className="online-error" role="alert">
        <b>That link didn’t work.</b>
        <p className="muted">{joinLinkError}</p>
        <button className="ghost sm" onClick={() => setJoiningLink('idle')}>Go to the shelf instead</button>
      </div>
    );
  }

  if (onlineFor && !session) {
    return (
      <Suspense fallback={<div className="view-loading muted">Connecting…</div>}>
        <OnlineTable
          def={onlineFor}
          onCancel={() => setOnlineFor(null)}
          onStart={(s) => { setSession(s); setGame(onlineFor); setOnlineFor(null); }}
        />
      </Suspense>
    );
  }

  if (setupFor) {
    return (
      <SeatSetup
        def={setupFor}
        // Item 90 of the audit pass: this used settings.defaultSeats alone, so a seat count
        // remembered for this specific game (see perGameSeats below, and the quick-Play path
        // a few screens over which already reads it) was silently ignored the moment a player
        // went through Setup instead — the one path where you'd expect that memory the most,
        // since Setup is exactly where seat count actually gets chosen.
        defaultSeats={seatsFor(setupFor, settings.perGameSeats[setupFor.meta.id] ?? settings.defaultSeats)}
        defaultName={settings.playerName}
        initialHouseRules={setupFor.meta.id === houseRulesFor?.gameId ? houseRulesFor : undefined}
        onCancel={() => { setSetupFor(null); setHouseRulesFor(null); }}
        onStart={(seatPlan, isPractice, houseRules) => {
          setPlan(seatPlan); setSeats(seatPlan.length); setPractice(isPractice);
          setGame(applyHouseRules(setupFor, houseRules)); setSetupFor(null); setHouseRulesFor(null);
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
            setSession(null); setGame(null); setPlan(null); setPractice(false); setResumeId(null); setDailyMode(false);
          }}>← All games</button>
          <span className="crumb-title">{dailyMode ? "Today's Deal" : game.meta.name}</span>
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
                  onClick={() => {
                    setSeats(n);
                    // Remembered per game — see Settings.perGameSeats — so the NEXT time this
                    // same game is opened, this is the count already selected.
                    set('perGameSeats', { ...settings.perGameSeats, [game.meta.id]: n });
                  }}>{n}</button>
              ))}
            </div>
          )}
        </div>
        <ErrorBoundary label={game.meta.name}>
          {game.solitaire
            ? <SolitaireTable def={game} daily={dailyMode} />
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

  const todaysDaily = resultFor(todayKey());
  const streak = dailyStreak();

  return (
    <div className="library">
      {/* Worklist #78: "the single highest-value thing on this list for bringing anybody back
          tomorrow." One seeded Klondike deal, the same for everyone playing today (see
          social/daily.ts for what "ranked" honestly means without a server behind it). */}
      <div className="daily glass" role="status">
        <div className="daily-info">
          <span className="daily-mark" aria-hidden="true">📅</span>
          <div>
            <b>Today's Deal</b>
            <p className="muted">
              {todaysDaily
                ? todaysDaily.won ? `Solved in ${todaysDaily.moves} moves.` : 'Not today — back tomorrow for a new one.'
                : `One ${dailyGame().meta.name} deal, the same for everyone playing today.`}
              {streak > 1 && ` ${streak} days running.`}
            </p>
          </div>
        </div>
        {!todaysDaily && (
          <button className="primary sm" onClick={() => { setDailyMode(true); setGame(dailyGame()); }}>
            Play →
          </button>
        )}
      </div>

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
              // Where you stand, not just what you're playing — the thing that actually decides
              // whether a half-finished game is worth picking back up right now.
              const standing = Object.values(g.matchScores ?? {});
              const mine = g.matchScores?.['P1'] ?? 0;
              const rank = standing.length > 1
                ? 1 + standing.filter((v) => (def.scoring.winner === 'lowestTotal' ? v < mine : v > mine)).length
                : null;
              return (
                <li key={g.matchId} className={g.yourTurn ? 'mine' : ''}>
                  <span className="ip-name">{def.meta.name}</span>
                  <span className="ip-seats muted">{g.seats} seats</span>
                  {standing.some((v) => v !== 0) && (
                    <span className="ip-score muted">
                      {mine}{rank ? ` · ${ordinal(rank)}` : ''}
                    </span>
                  )}
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
          setSeats(seatsFor(def, settings.perGameSeats[def.meta.id] ?? settings.defaultSeats));
          setGame(def);
        }}
        onSetup={(def) => { recordPlay(def.meta.id); setSetupFor(def); }}
        onOnline={hostUp ? (def) => { recordPlay(def.meta.id); setOnlineFor(def); } : undefined}
        onlineHostDown={hostChecked && !hostUp}
      />
    </div>
  );
}
