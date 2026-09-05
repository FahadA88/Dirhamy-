import { useState } from 'react';
import { GameDefinition } from '../engine/types';
import { Seat } from '../server/matchService';
import {
  Tournament, TournamentTable, activeTournament, createTournament, seatsForTable, yourTable,
} from '../social/tournament';

/** Item 38: the bracket for one game — every table shown, yours playable, everyone else's
 *  already decided the moment the round was built (see tournament.ts). */
export function TournamentView({ def, you, onPlayTable, onClose }: {
  def: GameDefinition;
  you: string;
  onPlayTable: (plan: Seat[], t: Tournament, table: TournamentTable) => void;
  onClose: () => void;
}) {
  const [t, setT] = useState<Tournament>(() => activeTournament(def.meta.id) ?? createTournament(def, you));

  const my = yourTable(t);
  const entrants = t.tables.filter((tb) => tb.round === 1).reduce((n, tb) => n + tb.seats.length, 0);

  return (
    <div className="tourney">
      <div className="crumbs">
        <button className="ghost" onClick={onClose}>← All games</button>
        <span className="crumb-title">{def.meta.name} · Tournament</span>
      </div>

      {t.champion && (
        <div className="tourney-banner glass" role="status">
          <span className="tb-mark" aria-hidden="true">🏆</span>
          <div>
            <b>{t.champion === you ? 'You won the tournament!' : `${t.champion} won the tournament.`}</b>
            <p className="muted">{entrants} entrants, {t.rounds} round{t.rounds === 1 ? '' : 's'}.</p>
          </div>
          <button className="primary sm" onClick={() => setT(createTournament(def, you))}>New tournament</button>
        </div>
      )}

      {!t.champion && my && (
        <div className="tourney-banner glass" role="status">
          <div>
            <b>Your table — round {my.round} of {t.rounds}</b>
            <p className="muted">{my.seats.join(' · ')}</p>
          </div>
          <button className="primary sm" onClick={() => onPlayTable(seatsForTable(my, you), t, my)}>Play →</button>
        </div>
      )}

      <div className="bracket">
        {Array.from({ length: t.rounds }, (_, i) => i + 1).map((round) => {
          const tables = t.tables.filter((tb) => tb.round === round).sort((a, b) => a.index - b.index);
          return (
            <div className="bracket-round" key={round}>
              <h4>{round === t.rounds ? 'Final' : `Round ${round}`}</h4>
              {tables.length === 0 && <p className="muted bracket-tbd">Not decided yet</p>}
              {tables.map((tb) => (
                <div className={`bracket-table ${tb.seats.includes(you) ? 'mine' : ''}`} key={tb.index}>
                  <ul>
                    {tb.seats.map((name) => (
                      <li key={name} className={tb.winner ? (tb.winner === name ? 'won' : 'lost') : ''}>
                        {name === you ? <b>{name}</b> : name}
                        {tb.winner === name && <span aria-hidden="true"> ★</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
