import { useEffect, useMemo, useRef, useState } from 'react';
import { applyMove, createMatch, isTerminal, legalMoves, redact } from '../engine/engine';
import { chooseMove } from '../bots/randomBot';
import { Card, GameDefinition, MatchState, Move } from '../engine/types';
import { SUIT_SYMBOLS } from '../engine/deck';
import { CardFace } from './Card';
import { useSettings } from '../settings/SettingsContext';
import { BOT_SPEED_MS } from '../settings/settings';
import { playSound } from './sound';

const HUMAN = 'P1';
const SUIT_ORDER: Record<string, number> = { S: 0, H: 1, C: 2, D: 3, JOKER: 4 };

export function Table({ def, seats = 3 }: { def: GameDefinition; seats?: number }) {
  const { settings } = useSettings();
  const players = useMemo(() => Array.from({ length: seats }, (_, i) => `P${i + 1}`), [seats]);
  const [state, setState] = useState<MatchState>(() => createMatch(def, players, rngSeed()));
  const [selected, setSelected] = useState<string | null>(null);
  const botSeed = useRef<number>(rngSeed());

  useEffect(() => {
    setState(createMatch(def, players, rngSeed()));
    botSeed.current = rngSeed();
    setSelected(null);
  }, [def, players]);

  const view = useMemo(() => redact(state, HUMAN), [state]);
  const myLegal = useMemo(() => (view.isYourTurn ? legalMoves(state, HUMAN) : []), [state, view.isYourTurn]);
  const playableCardIds = useMemo(
    () => new Set(myLegal.filter((m) => m.cardId).map((m) => m.cardId)),
    [myLegal],
  );
  const canDraw = myLegal.some((m) => m.actionId === 'drawCard');
  const playActionId = view.mode === 'trick' ? 'playToTrick' : 'playCard';

  // Bot loop, paced by the user's bot-speed setting.
  useEffect(() => {
    if (isTerminal(state)) return;
    const current = state.pendingChoice ? state.pendingChoice.player : state.players[state.turnIndex];
    if (current === HUMAN) return;
    const timer = setTimeout(() => {
      const r = chooseMove(state, current, botSeed.current, settings.botDiff);
      botSeed.current = r.botSeed;
      setState((s) => applyMove(s, current, r.move));
    }, BOT_SPEED_MS[settings.botSpeed]);
    return () => clearTimeout(timer);
  }, [state, settings.botSpeed, settings.botDiff]);

  // Win sound.
  const prevPhase = useRef(state.phase);
  useEffect(() => {
    if (prevPhase.current !== 'roundOver' && state.phase === 'roundOver') playSound('win', settings.sound);
    prevPhase.current = state.phase;
  }, [state.phase, settings.sound]);

  function submit(move: Move) {
    if (!view.isYourTurn) return;
    if (move.actionId === 'playCard' || move.actionId === 'playToTrick') playSound('play', settings.sound);
    if (move.actionId === 'drawCard') playSound('draw', settings.sound);
    setSelected(null);
    setState((s) => applyMove(s, HUMAN, move));
  }

  function clickCard(id: string) {
    if (!playableCardIds.has(id)) return;
    if (settings.confirmPlays && selected !== id) { setSelected(id); playSound('ui', settings.sound); return; }
    submit({ actionId: playActionId, cardId: id });
  }

  const hand = useMemo(() => sortHand(view.hand, def, settings.sort), [view.hand, def, settings.sort]);
  const top = view.zones.discard?.cards[0];
  const activeSuit = view.vars.activeSuit;
  const suitPickerOpen = !!state.pendingChoice && state.pendingChoice.player === HUMAN;
  const nameOf = (id: string) => (id === HUMAN ? settings.playerName : settings.botLabels ? `Bot ${id.slice(1)}` : id);
  const backCls = `card back style-${settings.cardBack}`;

  return (
    <div className="table">
      <div className="opponents">
        {view.players.filter((p) => p.id !== HUMAN).map((p) => (
          <div key={p.id} className={`seat ${p.isTurn ? 'active' : ''}`}>
            <div className="seat-name">{nameOf(p.id)}{p.isTurn ? ' ⏳' : ''}</div>
            <div className="fanned">
              {Array.from({ length: Math.min(p.handCount, 12) }).map((_, i) => (<div key={i} className={backCls} />))}
            </div>
            <div className="count">
              {p.handCount} cards{view.mode === 'trick' ? ` · ${view.tricksWon?.[p.id] ?? 0} tricks` : ''}
            </div>
          </div>
        ))}
      </div>

      {view.mode === 'trick' ? (
        <div className="center trick-area">
          {view.trick && view.trick.length > 0
            ? view.trick.map((t) => (
                <div key={t.player} className="trick-card">
                  <CardFace card={t.card} />
                  <div className="pile-label">{nameOf(t.player)}</div>
                </div>
              ))
            : <div className="trick-empty">Trick is empty — {view.isYourTurn ? 'your lead' : 'waiting…'}</div>}
          <div className="trick-meta">
            Trump {SUIT_SYMBOLS[state.definition.trick!.trump] ?? '—'}
            {view.lead ? ` · led ${SUIT_SYMBOLS[view.lead]}` : ''}
          </div>
        </div>
      ) : (
        <div className="center">
          <div className="pile">
            <div className={`${backCls} big`} />
            <div className="pile-label">Draw · {view.zones.draw?.count ?? 0}</div>
          </div>
          <div className="pile">
            {top ? <CardFace card={top} /> : <div className="card big empty" />}
            <div className="pile-label">Discard{activeSuit ? ` · suit ${SUIT_SYMBOLS[activeSuit] ?? activeSuit}` : ''}</div>
          </div>
        </div>
      )}

      <div className={`you ${view.isYourTurn ? 'your-turn' : ''}`}>
        <div className="you-head">
          <span>{settings.playerName === 'You' ? 'Your hand' : `${settings.playerName}’s hand`}{view.mode === 'trick' ? ` · ${view.tricksWon?.[HUMAN] ?? 0} tricks` : ''}</span>
          {view.isYourTurn && !suitPickerOpen && <span className="turn-badge">Your turn</span>}
          {canDraw && <button className="draw-btn" onClick={() => submit({ actionId: 'drawCard' })}>Draw a card</button>}
        </div>
        <div className={`hand hl-${settings.highlight}`}>
          {hand.map((c) => {
            const playable = playableCardIds.has(c.id);
            return (
              <button
                key={c.id}
                className={`card-btn ${playable ? 'playable' : 'dim'} ${selected === c.id ? 'selected' : ''}`}
                disabled={!playable}
                onClick={() => clickCard(c.id)}
                title={playable ? (settings.confirmPlays && selected !== c.id ? 'Click to select' : 'Play this card') : 'Not a legal move right now'}
              >
                <CardFace card={c} />
              </button>
            );
          })}
          {hand.length === 0 && <div className="empty-hand">— empty —</div>}
        </div>
      </div>

      {suitPickerOpen && (
        <div className="modal">
          <div className="modal-box">
            <h3>Wild card — choose a suit</h3>
            <div className="suit-choices">
              {(['C', 'D', 'H', 'S'] as const).map((s) => (
                <button key={s} className={`suit-btn s-${s}`} onClick={() => submit({ actionId: 'resolveChoice', choice: s })}>{SUIT_SYMBOLS[s]}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {view.phase === 'roundOver' && (
        <div className="modal">
          <div className="modal-box">
            <h3>{view.winner === HUMAN ? '🎉 You win!' : `${nameOf(view.winner || '')} wins`}</h3>
            <p className="scores">
              {Object.entries(view.scores).map(([p, s]) => (<span key={p}>{nameOf(p)}: {s} pts&nbsp;&nbsp;</span>))}
            </p>
            <button className="primary" onClick={() => { setState(createMatch(def, players, rngSeed())); }}>Play again</button>
          </div>
        </div>
      )}

      {settings.showLog && (
        <div className="log">
          <div className="log-head">Game log</div>
          {view.log.slice().reverse().map((e) => (<div key={e.t} className="log-row">{e.text}</div>))}
        </div>
      )}
    </div>
  );
}

function sortHand(hand: Card[], def: GameDefinition, mode: 'off' | 'rank' | 'suit'): Card[] {
  if (mode === 'off') return hand;
  const rankIdx = (r: string) => { const i = def.deck.rankOrder.indexOf(r as never); return i < 0 ? 99 : i; };
  const copy = hand.slice();
  if (mode === 'rank') copy.sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank) || SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]);
  else copy.sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || rankIdx(a.rank) - rankIdx(b.rank));
  return copy;
}

function rngSeed(): number { return (Math.random() * 2 ** 31) | 0; }
