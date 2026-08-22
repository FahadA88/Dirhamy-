import { useEffect, useState } from 'react';
import { catalog } from '../games/catalog';
import { Table } from './Table';
import { SolitaireTable } from './SolitaireTable';
import { ErrorBoundary } from './ErrorBoundary';
import { GameHelp } from './GameHelp';
import { resumableSession } from '../server/local';
import { Seat } from '../server/matchService';
import { SeatSetup } from './SeatSetup';
import { GameDefinition } from '../engine/types';
import { useSettings } from '../settings/SettingsContext';
import { BrowseView } from './BrowseView';
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

  // Offer to pick up an unfinished game rather than silently dropping it.
  useEffect(() => {
    const saved = resumableSession();
    if (!saved) return;
    const def = catalog.find((g) => g.meta.id === saved.gameId);
    if (def) setResumable({ gameId: saved.gameId, name: def.meta.name });
  }, []);

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
          <button className="ghost" onClick={() => { setGame(null); setPlan(null); setPractice(false); }}>← All games</button>
          <span className="crumb-title">{game.meta.name}</span>
          {practice && <span className="practice-badge" title="Nothing here is recorded">Practice</span>}
          <button className="ghost sm" onClick={() => setHelpFor(game)}>Rules</button>
          {!game.solitaire && !plan && (
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
            : <Table def={game} seats={seats} plan={plan ?? undefined} practice={practice} />}
        </ErrorBoundary>
        {helpFor && <GameHelp def={helpFor} onClose={() => setHelpFor(null)} />}
      </div>
    );
  }

  return (
    <div className="library">
      {resumable && (
        <div className="resume glass" role="status">
          <span>You have an unfinished game of <b>{resumable.name}</b>.</span>
          <div className="resume-actions">
            <button className="ghost sm" onClick={() => setResumable(null)}>Dismiss</button>
            <button className="primary sm" onClick={() => {
              const def = catalog.find((g) => g.meta.id === resumable.gameId);
              if (def) { setGame(def); setResumable(null); }
            }}>Resume →</button>
          </div>
        </div>
      )}
      <BrowseView
        onPlay={(def) => {
          recordPlay(def.meta.id);
          setPlan(null);
          setPractice(false);
          setSeats(Math.min(Math.max(settings.defaultSeats, def.meta.players.min), def.meta.players.max));
          setGame(def);
        }}
        onSetup={(def) => { recordPlay(def.meta.id); setSetupFor(def); }}
      />
    </div>
  );
}
