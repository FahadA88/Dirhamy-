import { useState } from 'react';
import { catalog } from '../games/catalog';
import { Table } from './Table';
import { GameDefinition } from '../engine/types';

// Discover + play the classics library (and, once wired, published community games).
export function PlayView() {
  const [game, setGame] = useState<GameDefinition | null>(null);

  if (game) {
    return (
      <div>
        <div className="crumbs">
          <button className="ghost" onClick={() => setGame(null)}>← All games</button>
          <span className="crumb-title">{game.meta.name}</span>
        </div>
        <Table def={game} seats={3} />
      </div>
    );
  }

  return (
    <div className="library">
      <h2>Classics</h2>
      <div className="cards-grid">
        {catalog.map((g) => (
          <div key={g.meta.id} className="game-card">
            <div className="game-card-head">
              <span className="fam-badge">{g.meta.family}</span>
              <h3>{g.meta.name}</h3>
            </div>
            <p>{g.meta.description}</p>
            <div className="game-card-foot">
              <span className="players">{g.meta.players.min}–{g.meta.players.max} players</span>
              <button className="primary sm" onClick={() => setGame(g)}>Play solo</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
