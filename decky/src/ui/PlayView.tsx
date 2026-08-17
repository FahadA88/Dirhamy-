import { useEffect, useState } from 'react';
import { catalog } from '../games/catalog';
import { Table } from './Table';
import { SolitaireTable } from './SolitaireTable';
import { ErrorBoundary } from './ErrorBoundary';
import { GameHelp } from './GameHelp';
import { resumableSession } from '../server/local';
import { GameDefinition } from '../engine/types';
import { useTilt } from './useTilt';
import { useSettings } from '../settings/SettingsContext';

// Discover + play the classics library (and, once wired, published community games).
export function PlayView() {
  const { settings } = useSettings();
  const [game, setGame] = useState<GameDefinition | null>(null);
  const [seats, setSeats] = useState(settings.defaultSeats);
  const [resumable, setResumable] = useState<{ gameId: string; name: string } | null>(null);
  const [helpFor, setHelpFor] = useState<GameDefinition | null>(null);

  // Offer to pick up an unfinished game rather than silently dropping it.
  useEffect(() => {
    const saved = resumableSession();
    if (!saved) return;
    const def = catalog.find((g) => g.meta.id === saved.gameId);
    if (def) setResumable({ gameId: saved.gameId, name: def.meta.name });
  }, []);

  if (game) {
    return (
      <div>
        <div className="crumbs">
          <button className="ghost" onClick={() => setGame(null)}>← All games</button>
          <span className="crumb-title">{game.meta.name}</span>
          <button className="ghost sm" onClick={() => setHelpFor(game)}>Rules</button>
          {!game.solitaire && (
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
          {game.solitaire ? <SolitaireTable def={game} /> : <Table def={game} seats={seats} />}
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
      <div className="section-head">
        <h2>Classics</h2>
        <span className="muted">Enforced, playable, and remixable — each one is pure data.</span>
      </div>
      <div className="cards-grid">
        {catalog.map((g) => (
          <GameCard key={g.meta.id} game={g} onPlay={() => { setSeats(Math.min(Math.max(settings.defaultSeats, g.meta.players.min), g.meta.players.max)); setGame(g); }} />
        ))}
      </div>
    </div>
  );
}

function GameCard({ game, onPlay }: { game: GameDefinition; onPlay: () => void }) {
  const { ref, onMouseMove, onMouseLeave } = useTilt(10);
  return (
    <div className="game-card glass" ref={ref} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
      <div className="game-card-glow" />
      <div className="game-card-head">
        <span className="fam-badge">{game.meta.family}</span>
      </div>
      <h3>{game.meta.name}</h3>
      <p>{game.meta.description}</p>
      <div className="game-card-foot">
        <span className="players">{game.meta.players.min}–{game.meta.players.max} players</span>
        <button className="primary sm" onClick={onPlay}>Play solo →</button>
      </div>
    </div>
  );
}
