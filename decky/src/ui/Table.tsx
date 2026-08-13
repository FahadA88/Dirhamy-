import { useEffect, useMemo, useRef, useState } from 'react';
import { actingPlayers, applyMove, createMatch, isTerminal, legalMoves, nextHand, redact } from '../engine/engine';
import { chooseMove } from '../bots/randomBot';
import { Card, GameDefinition, MatchState, Move } from '../engine/types';
import { SUIT_SYMBOLS } from '../engine/deck';
import { CardFace } from './Card';
import { useSettings } from '../settings/SettingsContext';
import { BOT_SPEED_MS } from '../settings/settings';
import { playSound } from './sound';

const HUMAN = 'P1';
const SUIT_ORDER: Record<string, number> = { S: 0, H: 1, C: 2, D: 3, JOKER: 4 };
const SHAPE_NAME: Record<number, string> = { 1: 'single', 2: 'pair', 3: 'triple', 4: 'four', 5: 'five' };

export function Table({ def, seats = 3 }: { def: GameDefinition; seats?: number }) {
  const { settings } = useSettings();
  const players = useMemo(() => Array.from({ length: seats }, (_, i) => `P${i + 1}`), [seats]);
  const [state, setState] = useState<MatchState>(() => createMatch(def, players, rngSeed()));
  const [selected, setSelected] = useState<string | null>(null);
  const [askRank, setAskRank] = useState<string | null>(null);
  const botSeed = useRef<number>(rngSeed());

  useEffect(() => {
    setState(createMatch(def, players, rngSeed()));
    botSeed.current = rngSeed();
    setSelected(null);
    setAskRank(null);
  }, [def, players]);

  const view = useMemo(() => redact(state, HUMAN), [state]);
  const myLegal = useMemo(() => (view.isYourTurn ? legalMoves(state, HUMAN) : []), [state, view.isYourTurn]);
  const isFish = view.mode === 'fish';
  // Climbing moves carry a card group rather than a single cardId; a one-card group is still
  // a plain tap-to-play, so fold those in alongside the normal cardId moves.
  const playableCardIds = useMemo(
    () => (isFish
      ? new Set(view.isYourTurn ? view.hand.map((c) => c.id) : [])
      : new Set([
          ...myLegal.filter((m) => m.cardId).map((m) => m.cardId!),
          ...myLegal.filter((m) => m.actionId === 'climbPlay' && m.cards?.length === 1).map((m) => m.cards![0]),
        ])),
    [myLegal, isFish, view.isYourTurn, view.hand],
  );
  const canDraw = myLegal.some((m) => m.actionId === 'drawCard');
  const canPass = myLegal.some((m) => m.actionId === 'climbPass');
  const canFishDraw = myLegal.some((m) => m.actionId === 'fishDraw');
  const canDrawStock = myLegal.some((m) => m.actionId === 'drawStock');
  const canDrawDiscard = myLegal.some((m) => m.actionId === 'drawDiscard');
  const isRummy = view.mode === 'rummy';
  const isWar = view.mode === 'war';
  const isClimb = view.mode === 'climb';
  // Groups of 2+ need a button — you can't express "these three cards" with one tap.
  const comboMoves = useMemo(
    () => myLegal.filter((m) => m.actionId === 'climbPlay' && (m.cards?.length ?? 1) > 1),
    [myLegal],
  );
  const bombMoves = useMemo(() => myLegal.filter((m) => m.actionId === 'climbBomb'), [myLegal]);
  const canDeclineBomb = myLegal.some((m) => m.actionId === 'climbNoBomb');
  const isInterrupt = isClimb && view.isYourTurn && !view.players.find((p) => p.id === HUMAN)?.isTurn;
  const rankOfId = (id: string) => view.hand.find((c) => c.id === id)?.rank ?? '?';
  const canFlip = myLegal.some((m) => m.actionId === 'warFlip');
  const myPile = view.players.find((p) => p.id === HUMAN)?.handCount ?? 0;
  const playActionId = view.needsPassChoice ? 'choosePass'
    : view.mode === 'trick' ? 'playToTrick' : view.mode === 'climb' ? 'climbPlay' : isRummy ? 'rummyDiscard' : 'playCard';

  // Bot loop, paced by the user's bot-speed setting. Usually one actor is waiting (whoever's
  // turn it is); a simultaneous pass can leave several bots waiting at once — this drives one
  // per tick, which naturally cascades through all of them.
  useEffect(() => {
    if (isTerminal(state)) return;
    const actor = actingPlayers(state).find((p) => p !== HUMAN);
    if (!actor) return;
    const timer = setTimeout(() => {
      const r = chooseMove(state, actor, botSeed.current, settings.botDiff);
      botSeed.current = r.botSeed;
      setState((s) => applyMove(s, actor, r.move));
    }, BOT_SPEED_MS[settings.botSpeed]);
    return () => clearTimeout(timer);
  }, [state, settings.botSpeed, settings.botDiff]);

  // Win sound.
  const prevPhase = useRef(state.phase);
  useEffect(() => {
    if (prevPhase.current !== 'roundOver' && state.phase === 'roundOver') playSound('win', settings.sound);
    prevPhase.current = state.phase;
  }, [state.phase, settings.sound]);

  function playNextHand() {
    setState((s) => nextHand(s, rngSeed()));
    setSelected(null);
    setAskRank(null);
  }

  function submit(move: Move) {
    if (!view.isYourTurn) return;
    if (move.actionId === 'playCard' || move.actionId === 'playToTrick' || move.actionId === 'climbPlay' || move.actionId === 'climbBomb') playSound('play', settings.sound);
    if (move.actionId === 'drawCard' || move.actionId === 'fishDraw') playSound('draw', settings.sound);
    if (move.actionId === 'ask') playSound('ui', settings.sound);
    setSelected(null);
    setAskRank(null);
    setState((s) => applyMove(s, HUMAN, move));
  }

  function clickCard(id: string) {
    if (!playableCardIds.has(id)) return;
    if (isFish) { const c = view.hand.find((x) => x.id === id); if (c) setAskRank(c.rank); playSound('ui', settings.sound); return; }
    if (settings.confirmPlays && selected !== id) { setSelected(id); playSound('ui', settings.sound); return; }
    if (playActionId === 'climbPlay') { submit({ actionId: 'climbPlay', cards: [id] }); return; }
    submit({ actionId: playActionId, cardId: id });
  }

  const hand = useMemo(() => sortHand(view.hand, def, settings.sort), [view.hand, def, settings.sort]);
  const top = view.zones.discard?.cards[0];
  const activeSuit = view.vars.activeSuit;
  const suitPickerOpen = !!state.pendingChoice && state.pendingChoice.player === HUMAN;
  const nameOf = (id: string) => (id === HUMAN ? settings.playerName : settings.botLabels ? `Bot ${id.slice(1)}` : id);
  const teamOf = (id: string): string | null => {
    if (!view.teams) return null;
    const i = view.teams.findIndex((t) => t.includes(id));
    return i >= 0 ? `Team ${i === 0 ? 'A' : 'B'}` : null;
  };
  const backCls = `card back style-${settings.cardBack}`;

  return (
    <div className="table">
      {view.matchTarget != null && (
        <div className="match-bar">
          <span className="match-hand">Hand {view.handNumber} · race to {view.matchTarget}{view.matchBust != null ? ` (bust at ${view.matchBust})` : ''}</span>
          <div className="match-chips">
            {view.players.map((p) => (
              <span key={p.id} className={`match-chip ${p.id === HUMAN ? 'you' : ''}`}>
                {nameOf(p.id)} <b>{view.matchScores?.[p.id] ?? 0}</b>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="opponents">
        {view.players.filter((p) => p.id !== HUMAN).map((p) => {
          const askable = isFish && view.isYourTurn && !!askRank && p.handCount > 0;
          return (
            <div key={p.id}
              className={`seat ${p.isTurn ? 'active' : ''} ${askable ? 'askable' : ''}`}
              onClick={() => { if (askable) submit({ actionId: 'ask', target: p.id, rank: askRank! }); }}>
              <div className="seat-name">{nameOf(p.id)}{p.isTurn ? ' ⏳' : ''}</div>
              <div className="fanned">
                {Array.from({ length: Math.min(p.handCount, 12) }).map((_, i) => (<div key={i} className={backCls} />))}
              </div>
              <div className="count">
                {p.handCount} cards{view.mode === 'trick' ? ` · ${view.tricksWon?.[p.id] ?? 0} tricks` : ''}
                {view.mode === 'trick' && view.bids?.[p.id] !== undefined ? ` · bid ${view.bids[p.id]}` : ''}
                {isFish ? ` · ${view.booksWon?.[p.id] ?? 0} books` : ''}
                {view.mode === 'climb' && view.finished?.includes(p.id) ? ` · out #${view.finished.indexOf(p.id) + 1}` : ''}
              </div>
              {teamOf(p.id) && <div className="team-tag">{teamOf(p.id)}</div>}
              {askable && <div className="ask-hint">Ask for {askRank}s</div>}
            </div>
          );
        })}
      </div>

      {view.mode === 'trick' && view.bidding ? (
        <div className="center bid-area">
          {view.isYourTurn ? (
            <div className="bid-panel">
              <div className="bid-title">How many tricks will you take?</div>
              <div className="bid-buttons">
                {Array.from({ length: view.hand.length + 1 }, (_, n) => (
                  <button key={n} className="bid-btn" onClick={() => submit({ actionId: 'bid', choice: String(n) })}>
                    {n === 0 ? 'Nil' : n}
                  </button>
                ))}
              </div>
            </div>
          ) : <div className="trick-empty">Bidding… waiting for other players</div>}
        </div>
      ) : view.mode === 'trick' ? (
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
      ) : isFish ? (
        <div className="center">
          <div className="pile">
            <div className={`${backCls} big`} />
            <div className="pile-label">Ocean · {view.oceanCount ?? 0}</div>
          </div>
          <div className="fish-prompt">
            {view.isYourTurn
              ? (askRank ? `Asking for ${askRank}s — tap an opponent above` : 'Tap one of your cards to pick a rank, then tap an opponent')
              : 'Waiting…'}
          </div>
        </div>
      ) : isWar ? (
        <div className="center war-center">
          {view.battle && view.battle.length > 0
            ? view.battle.map((c, i) => (
                <div key={c.id} className="trick-card">
                  <CardFace card={c} />
                  <div className="pile-label">{i % 2 === 0 ? nameOf(view.players[0].id) : nameOf(view.players[1].id)}</div>
                </div>
              ))
            : <div className="trick-empty">Tap Flip to reveal the top cards</div>}
        </div>
      ) : isRummy ? (
        <div className="center rummy-center">
          <div className="pile">
            <div className={`${backCls} big`} />
            <div className="pile-label">Stock · {view.zones.draw?.count ?? 0}</div>
          </div>
          <div className="pile">
            {top ? <CardFace card={top} /> : <div className="card big empty" />}
            <div className="pile-label">Discard</div>
          </div>
          {view.zones.melds && view.zones.melds.cards.length > 0 && (
            <div className="melds-box">
              <div className="pile-label">Melds</div>
              <div className="melds-row">
                {view.zones.melds.cards.map((c) => <div key={c.id} className="meld-mini"><CardFace card={c} /></div>)}
              </div>
            </div>
          )}
        </div>
      ) : isClimb ? (
        <div className="center">
          <div className="pile">
            {view.climbPile && view.climbPile.length > 0 ? (
              <div className="climb-group">
                {view.climbPile.map((c) => <CardFace key={c.id} card={c} />)}
              </div>
            ) : <div className="card big empty" />}
            <div className="pile-label">
              {!view.climbPile || view.climbPile.length === 0
                ? 'Empty — lead any shape'
                : `Pile to beat · ${SHAPE_NAME[view.climbPile.length] ?? `${view.climbPile.length} cards`}`}
            </div>
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
          <span>{settings.playerName === 'You' ? 'Your hand' : `${settings.playerName}’s hand`}{view.mode === 'trick' ? ` · ${view.tricksWon?.[HUMAN] ?? 0} tricks` : ''}{view.mode === 'trick' && view.bids?.[HUMAN] !== undefined ? ` · bid ${view.bids[HUMAN]}` : ''}{isFish ? ` · ${view.booksWon?.[HUMAN] ?? 0} books` : ''}{teamOf(HUMAN) ? ` · ${teamOf(HUMAN)}` : ''}</span>
          {view.needsPassChoice && (
            <span className="turn-badge">
              {view.passCount > 1
                ? `Pass ${view.passCount} ${view.passDirection} · ${view.passStaged.length}/${view.passCount} picked`
                : `Pick a card to pass ${view.passDirection}`}
            </span>
          )}
          {isInterrupt && <span className="bomb-badge">💣 You can bomb out of turn</span>}
          {!view.passDirection && view.isYourTurn && !suitPickerOpen && !isInterrupt && <span className="turn-badge">Your turn</span>}
          {!view.needsPassChoice && view.passDirection && <span className="waiting-badge">Waiting on {view.passWaitingOn} player{view.passWaitingOn === 1 ? '' : 's'}…</span>}
          {canDraw && <button className="draw-btn" onClick={() => submit({ actionId: 'drawCard' })}>Draw a card</button>}
          {canPass && <button className="draw-btn" onClick={() => submit({ actionId: 'climbPass' })}>Pass</button>}
          {canFishDraw && <button className="draw-btn" onClick={() => submit({ actionId: 'fishDraw' })}>Draw from ocean</button>}
          {canDrawStock && <button className="draw-btn" onClick={() => submit({ actionId: 'drawStock' })}>Draw stock</button>}
          {canDrawDiscard && <button className="draw-btn" onClick={() => submit({ actionId: 'drawDiscard' })}>Take discard</button>}
          {isRummy && view.rummyPhase === 'play' && view.meldMoves?.map((m, i) => (
            <button key={i} className="meld-btn" onClick={() => submit({ actionId: 'meld', cards: m.cards })}>Meld {m.label}</button>
          ))}
          {comboMoves.map((m, i) => (
            <button key={`combo${i}`} className="meld-btn" onClick={() => submit({ actionId: 'climbPlay', cards: m.cards })}>
              Play {SHAPE_NAME[m.cards!.length] ?? `${m.cards!.length}`} of {rankOfId(m.cards![0])}
            </button>
          ))}
          {bombMoves.map((m, i) => (
            <button key={`bomb${i}`} className="bomb-btn" onClick={() => submit({ actionId: 'climbBomb', cards: m.cards })}>
              💣 Bomb · {m.cards!.length}×{rankOfId(m.cards![0])}
            </button>
          ))}
          {canDeclineBomb && <button className="draw-btn" onClick={() => submit({ actionId: 'climbNoBomb' })}>Hold my bomb</button>}
          {isRummy && view.rummyPhase === 'play' && view.isYourTurn && <span className="rummy-hint">tap a card to discard</span>}
        </div>
        {isWar ? (
          <div className="war-controls">
            <span className="war-pile">Your pile · {myPile} cards</span>
            {canFlip && <button className="primary" onClick={() => submit({ actionId: 'warFlip' })}>⚔ Flip</button>}
          </div>
        ) : (
        <div className={`hand hl-${settings.highlight}`}>
          {hand.map((c) => {
            const playable = playableCardIds.has(c.id);
            const staged = view.passStaged.includes(c.id);
            return (
              <button
                key={c.id}
                className={`card-btn ${playable ? 'playable' : 'dim'} ${staged ? 'staged' : ''} ${(isFish ? c.rank === askRank : selected === c.id) ? 'selected' : ''}`}
                disabled={!playable}
                onClick={() => clickCard(c.id)}
                title={staged ? 'Picked to pass' : playable ? (isFish ? 'Pick this rank to ask for' : view.needsPassChoice ? 'Give this card away' : settings.confirmPlays && selected !== c.id ? 'Click to select' : 'Play this card') : 'Not a legal move right now'}
              >
                <CardFace card={c} />
              </button>
            );
          })}
          {hand.length === 0 && <div className="empty-hand">— empty —</div>}
        </div>
        )}
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

      {view.phase === 'roundOver' && !view.matchOver && (
        <div className="modal">
          <div className="modal-box">
            <h3>{view.winner === HUMAN ? '🎉 You win this hand!' : `${nameOf(view.winner || '')} wins this hand`}</h3>
            <p className="scores">
              {Object.entries(view.scores).map(([p, s]) => (<span key={p}>{nameOf(p)}: +{s}&nbsp;&nbsp;</span>))}
            </p>
            <div className="match-scoreboard">
              <div className="ms-title">Race to {view.matchTarget}</div>
              {view.players
                .slice()
                .sort((a, b) => (view.matchScores?.[b.id] ?? 0) - (view.matchScores?.[a.id] ?? 0))
                .map((p) => (
                  <div key={p.id} className="ms-row">
                    <span>{nameOf(p.id)}</span>
                    <b>{view.matchScores?.[p.id] ?? 0}</b>
                  </div>
                ))}
            </div>
            <button className="primary" onClick={playNextHand}>Next hand →</button>
          </div>
        </div>
      )}

      {view.phase === 'roundOver' && view.matchOver && (
        <div className="modal">
          <div className="modal-box">
            <h3>{view.matchWinner === HUMAN ? '🏆 You win the match!' : view.winner === HUMAN ? '🎉 You win!' : `${nameOf(view.matchWinner ?? view.winner ?? '')} wins${view.matchTarget != null ? ' the match' : ''}`}</h3>
            <p className="scores">
              {Object.entries(view.matchTarget != null ? (view.matchScores ?? view.scores) : view.scores).map(([p, s]) => (
                <span key={p}>{nameOf(p)}: {s} pts&nbsp;&nbsp;</span>
              ))}
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
