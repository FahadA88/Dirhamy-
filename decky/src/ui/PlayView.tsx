import { useState } from 'react';
import { catalog } from '../games/catalog';
import { Table } from './Table';
import { GameDefinition } from '../engine/types';
import { useTilt } from './useTilt';

// Discover + play the classics library (and, once wired, published community games).
export function PlayView() {
  const [game, setGame] = useState<GameDefinition | null>(null);
  const [seats, setSeats] = useState(3);

  if (game) {
    return (
      <div>
        <div className="crumbs">
          <button className="ghost" onClick={() => setGame(null)}>← All games</button>
          <span className="crumb-title">{game.meta.name}</span>
          <div className="seat-control">
            <span>Seats</span>
            {[2, 3, 4, 5, 6].map((n) => (
              <button key={n} className={`seg-btn ${seats === n ? 'on' : ''}`}
                disabled={n < game.meta.players.min || n > game.meta.players.max}
                onClick={() => setSeats(n)}>{n}</button>
            ))}
          </div>
        </div>
        <Table def={game} seats={seats} />
      </div>
    );
  }

  return (
    <div className="library">
      <div className="section-head">
        <h2>Classics</h2>
        <span className="muted">Enforced, playable, and remixable — each one is pure data.</span>
      </div>
      <div className="cards-grid">
        {catalog.map((g) => (
          <GameCard key={g.meta.id} game={g} onPlay={() => { setSeats(Math.min(3, g.meta.players.max)); setGame(g); }} />
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
