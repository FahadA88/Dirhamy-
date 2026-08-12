import { useEffect, useMemo, useRef, useState } from 'react';
import { applyMove, createMatch, isTerminal, legalMoves, redact } from '../engine/engine';
import { chooseMove } from '../bots/randomBot';
import { GameDefinition, MatchState, Move } from '../engine/types';
import { SUIT_SYMBOLS } from '../engine/deck';
import { CardFace } from './Card';

const HUMAN = 'P1';

// A playable table for ANY definition, solo vs bots. This is a thin client: it holds full
// state locally for this offline slice but only ever renders the redacted (per-player) view,
// exactly as it would against an authoritative server.
export function Table({ def, seats = 3 }: { def: GameDefinition; seats?: number }) {
  const players = useMemo(
    () => Array.from({ length: seats }, (_, i) => `P${i + 1}`),
    [seats],
  );
  const [state, setState] = useState<MatchState>(() => createMatch(def, players, rngSeed()));
  const botSeed = useRef<number>(rngSeed());

  // Reset when the game definition or seat count changes.
  useEffect(() => {
    setState(createMatch(def, players, rngSeed()));
    botSeed.current = rngSeed();
  }, [def, players]);

  const view = useMemo(() => redact(state, HUMAN), [state]);
  const myLegal = useMemo(() => (view.isYourTurn ? legalMoves(state, HUMAN) : []), [state, view.isYourTurn]);
  const playableCardIds = useMemo(
    () => new Set(myLegal.filter((m) => m.actionId === 'playCard').map((m) => m.cardId)),
    [myLegal],
  );
  const canDraw = myLegal.some((m) => m.actionId === 'drawCard');

  useEffect(() => {
    if (isTerminal(state)) return;
    const current = state.pendingChoice ? state.pendingChoice.player : state.players[state.turnIndex];
    if (current === HUMAN) return;
    const timer = setTimeout(() => {
      const r = chooseMove(state, current, botSeed.current);
      botSeed.current = r.botSeed;
      setState((s) => applyMove(s, current, r.move));
    }, 600);
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
    <div className="table">
      <div className="opponents">
        {view.players.filter((p) => p.id !== HUMAN).map((p) => (
          <div key={p.id} className={`seat ${p.isTurn ? 'active' : ''}`}>
            <div className="seat-name">{p.id}{p.isTurn ? ' ⏳' : ''}</div>
            <div className="fanned">
              {Array.from({ length: Math.min(p.handCount, 12) }).map((_, i) => (
                <div key={i} className="card back" />
              ))}
            </div>
            <div className="count">{p.handCount} cards</div>
          </div>
        ))}
      </div>

      <div className="center">
        <div className="pile">
          <div className="card back big" />
          <div className="pile-label">Draw · {view.zones.draw?.count ?? 0}</div>
        </div>
        <div className="pile">
          {top ? <CardFace card={top} /> : <div className="card big empty" />}
          <div className="pile-label">Discard{activeSuit ? ` · suit ${SUIT_SYMBOLS[activeSuit] ?? activeSuit}` : ''}</div>
        </div>
      </div>

      <div className={`you ${view.isYourTurn ? 'your-turn' : ''}`}>
        <div className="you-head">
          <span>Your hand</span>
          {view.isYourTurn && !suitPickerOpen && <span className="turn-badge">Your turn</span>}
          {canDraw && <button className="draw-btn" onClick={() => submit({ actionId: 'drawCard' })}>Draw a card</button>}
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

      {suitPickerOpen && (
        <div className="modal">
          <div className="modal-box">
            <h3>Wild card — choose a suit</h3>
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

      {view.phase === 'roundOver' && (
        <div className="modal">
          <div className="modal-box">
            <h3>{view.winner === HUMAN ? '🎉 You win!' : `${view.winner} wins`}</h3>
            <p className="scores">
              {Object.entries(view.scores).map(([p, s]) => (<span key={p}>{p}: {s} pts&nbsp;&nbsp;</span>))}
            </p>
            <button className="primary" onClick={() => { setState(createMatch(def, players, rngSeed())); }}>Play again</button>
          </div>
        </div>
      )}

      <div className="log">
        <div className="log-head">Game log</div>
        {view.log.slice().reverse().map((e) => (<div key={e.t} className="log-row">{e.text}</div>))}
      </div>
    </div>
  );
}

function rngSeed(): number {
  return (Math.random() * 2 ** 31) | 0;
}
