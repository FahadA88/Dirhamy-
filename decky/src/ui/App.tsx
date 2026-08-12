import { useEffect, useMemo, useRef, useState } from 'react';
import { crazyEights } from '../games/crazyEights';
import {
  applyMove, createMatch, isTerminal, legalMoves, redact,
} from '../engine/engine';
import { chooseMove } from '../bots/randomBot';
import { Card, MatchState, Move } from '../engine/types';
import { SUIT_SYMBOLS } from '../engine/deck';

const HUMAN = 'P1';
const SEATS = ['P1', 'P2', 'P3'];

function newGame(): MatchState {
  return createMatch(crazyEights, SEATS, (Math.random() * 2 ** 31) | 0);
}

export function App() {
  const [state, setState] = useState<MatchState>(() => newGame());
  const botSeed = useRef<number>((Math.random() * 2 ** 31) | 0);

  const view = useMemo(() => redact(state, HUMAN), [state]);
  const myLegal = useMemo(
    () => (view.isYourTurn ? legalMoves(state, HUMAN) : []),
    [state, view.isYourTurn],
  );
  const playableCardIds = useMemo(
    () => new Set(myLegal.filter((m) => m.actionId === 'playCard').map((m) => m.cardId)),
    [myLegal],
  );
  const canDraw = myLegal.some((m) => m.actionId === 'drawCard');

  // Drive the bots: whenever it's a bot's turn (or a bot must resolve a choice), auto-play.
  useEffect(() => {
    if (isTerminal(state)) return;
    const current = state.pendingChoice ? state.pendingChoice.player : state.players[state.turnIndex];
    if (current === HUMAN) return;
    const timer = setTimeout(() => {
      const r = chooseMove(state, current, botSeed.current);
      botSeed.current = r.botSeed;
      setState((s) => applyMove(s, current, r.move));
    }, 650);
    return () => clearTimeout(timer);
  }, [state]);

  function submit(move: Move) {
    if (!view.isYourTurn) return;
    setState((s) => applyMove(s, HUMAN, move));
  }

  const top = view.zones.discard?.cards[0];
  const activeSuit = view.vars.activeSuit;
  const suitPickerOpen = !!state.pendingChoice && state.pendingChoice.player === HUMAN;

  return (
    <div className="app">
      <header>
        <h1>♠ Decky</h1>
        <div className="sub">{view.gameName} · you are {HUMAN} · solo vs bots</div>
        <button className="ghost" onClick={() => { setState(newGame()); }}>New game</button>
      </header>

      <section className="table">
        {/* Opponents */}
        <div className="opponents">
          {view.players.filter((p) => p.id !== HUMAN).map((p) => (
            <div key={p.id} className={`seat ${p.isTurn ? 'active' : ''}`}>
              <div className="seat-name">{p.id}{p.isTurn ? ' ⏳' : ''}</div>
              <div className="fanned">
                {Array.from({ length: p.handCount }).map((_, i) => (
                  <div key={i} className="card back" />
                ))}
              </div>
              <div className="count">{p.handCount} cards</div>
            </div>
          ))}
        </div>

        {/* Center: draw + discard */}
        <div className="center">
          <div className="pile">
            <div className="card back big" />
            <div className="pile-label">Draw · {view.zones.draw?.count ?? 0}</div>
          </div>
          <div className="pile">
            {top ? <CardFace card={top} /> : <div className="card big empty" />}
            <div className="pile-label">
              Discard{activeSuit ? ` · suit ${SUIT_SYMBOLS[activeSuit]}` : ''}
            </div>
          </div>
        </div>

        {/* Your hand */}
        <div className={`you ${view.isYourTurn ? 'your-turn' : ''}`}>
          <div className="you-head">
            <span>Your hand</span>
            {view.isYourTurn && !suitPickerOpen && <span className="turn-badge">Your turn</span>}
            {canDraw && (
              <button className="draw-btn" onClick={() => submit({ actionId: 'drawCard' })}>
                Draw a card
              </button>
            )}
          </div>
          <div className="hand">
            {view.hand.map((c) => {
              const playable = playableCardIds.has(c.id);
              return (
                <button
                  key={c.id}
                  className={`card-btn ${playable ? 'playable' : 'dim'}`}
                  disabled={!playable}
                  onClick={() => submit({ actionId: 'playCard', cardId: c.id })}
                  title={playable ? 'Play this card' : 'Not a legal move right now'}
                >
                  <CardFace card={c} />
                </button>
              );
            })}
            {view.hand.length === 0 && <div className="empty-hand">— empty —</div>}
          </div>
        </div>
      </section>

      {/* Suit picker for wild 8s */}
      {suitPickerOpen && (
        <div className="modal">
          <div className="modal-box">
            <h3>You played a wild 8 — choose a suit</h3>
            <div className="suit-choices">
              {(['C', 'D', 'H', 'S'] as const).map((s) => (
                <button key={s} className={`suit-btn s-${s}`} onClick={() => submit({ actionId: 'resolveChoice', choice: s })}>
                  {SUIT_SYMBOLS[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Winner banner */}
      {view.phase === 'roundOver' && (
        <div className="modal">
          <div className="modal-box">
            <h3>{view.winner === HUMAN ? '🎉 You win!' : `${view.winner} wins`}</h3>
            <p className="scores">
              {Object.entries(view.scores).map(([p, s]) => (
                <span key={p}>{p}: {s} pts&nbsp;&nbsp;</span>
              ))}
            </p>
            <button className="primary" onClick={() => setState(newGame())}>Play again</button>
          </div>
        </div>
      )}

      {/* Event log */}
      <aside className="log">
        <div className="log-head">Game log</div>
        {view.log.slice().reverse().map((e) => (
          <div key={e.t} className="log-row">{e.text}</div>
        ))}
      </aside>
    </div>
  );
}

function CardFace({ card }: { card: Card }) {
  const red = card.suit === 'H' || card.suit === 'D';
  const sym = SUIT_SYMBOLS[card.suit];
  return (
    <div className={`card face ${red ? 'red' : 'black'}`}>
      <div className="corner tl">{card.rank}<span>{sym}</span></div>
      <div className="pip">{sym}</div>
      <div className="corner br">{card.rank}<span>{sym}</span></div>
    </div>
  );
}
