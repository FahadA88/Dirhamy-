import { useMemo } from 'react';
import { GameDefinition } from '../engine/types';
import { createMatch, redact } from '../engine/engine';
import { validate } from '../engine/validator';
import { CardFace } from './Card';
import { explainGame } from '../authoring/explain';

// A real deal of the game being built, redrawn every time a knob moves.
//
// It runs the actual engine on the actual definition — not a mock — so if a change breaks the
// deal, it breaks here, in front of the author, a second after they made it. Deliberately a
// single dealt position rather than an animated game: this is a shape-check, and the Playtest
// button next to it is the thing that plays.

const SEED = 20250817;   // fixed, so a knob change is the only thing that changes the picture

export function MiniTable({ def, seats }: { def: GameDefinition; seats: number }) {
  const preview = useMemo(() => {
    const v = validate(def);
    if (!v.ok) return { error: v.issues.find((i) => i.level === 'error')?.message ?? 'This game cannot be dealt yet.' };
    try {
      const n = def.solitaire ? 1 : Math.min(Math.max(seats, def.meta.players.min), def.meta.players.max);
      const players = Array.from({ length: n }, (_, i) => `P${i + 1}`);
      return { view: redact(createMatch(def, players, SEED), 'P1') };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [def, seats]);

  if ('error' in preview) {
    return (
      <div className="mini-table broken">
        <div className="mini-broken-mark">⚠</div>
        <p>{preview.error}</p>
      </div>
    );
  }

  const view = preview.view!;
  const sentences = explainGame(def);

  return (
    <div className="mini-table">
      <div className="mini-felt">
        {view.mode === 'solitaire' ? (
          <div className="mini-sol">
            {(view.tableau ?? []).slice(0, 10).map((col) => (
              <div key={col.id} className="mini-col">
                {col.cards.length === 0 && <div className="mini-slot" />}
                {col.cards.slice(-3).map((c, i) => (
                  <div key={`${col.id}-${i}`} className="mini-card"
                    style={{ marginTop: i === 0 ? 0 : -14 }}>
                    {String(c.rank) === '?' ? <div className="mini-back" /> : <CardFace card={c} />}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="mini-seats">
              {view.players.filter((p) => p.id !== 'P1').map((p) => (
                <div key={p.id} className="mini-seat">
                  <div className="mini-fan">
                    {Array.from({ length: Math.min(p.handCount, 7) }).map((_, i) => (
                      <div key={i} className="mini-back" />
                    ))}
                  </div>
                  <span className="mini-count">{p.handCount}</span>
                </div>
              ))}
            </div>
            <div className="mini-centre">
              {view.zones.draw && <div className="mini-back big" />}
              {view.zones.discard?.cards[0] && <div className="mini-card"><CardFace card={view.zones.discard.cards[0]} /></div>}
              {view.mode === 'trick' && <span className="mini-note">first trick</span>}
            </div>
            <div className="mini-hand">
              {view.hand.slice(0, 13).map((c) => (
                <div key={c.id} className="mini-card"><CardFace card={c} /></div>
              ))}
              {view.hand.length === 0 && <span className="mini-note">no cards dealt</span>}
            </div>
          </>
        )}
      </div>

      <div className="mini-rules">
        <div className="mini-rules-head">How it plays</div>
        <ul>{sentences.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </div>
    </div>
  );
}
