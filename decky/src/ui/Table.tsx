import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, GameDefinition, Move, RedactedState } from '../engine/types';
import { SUIT_SYMBOLS } from '../engine/deck';
import { CardFace } from './Card';
import { TableDressing, TableRail } from './TableDressing';
import { DealMotion } from './DealMotion';
import { ScorePad } from './ScorePad';
import { Confetti } from './Confetti';
import { useSettings } from '../settings/SettingsContext';
import { BOT_SPEED_MS } from '../settings/settings';
import { playSound } from './sound';
import { service, rememberSession, forgetSession, resumableSession } from '../server/local';
import { Seat, MoveRecord } from '../server/matchService';
import { recordResult } from '../social/records';

// This component holds a match id and a redacted view — never a MatchState. Every move it wants
// to make goes to the service as an intent; the service decides, and hands back the board as
// this player is allowed to see it. Opponents' hands are not in this file's reach, and a move
// the rules don't allow comes back refused with a reason rather than silently doing nothing.

const HUMAN = 'P1';
const SUIT_ORDER: Record<string, number> = { S: 0, H: 1, C: 2, D: 3, JOKER: 4 };
const SUIT_NAMES: Record<string, string> = { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades' };
const SHAPE_NAME: Record<number, string> = { 1: 'single', 2: 'pair', 3: 'triple', 4: 'four', 5: 'five' };

export function Table({ def, seats = 3, plan }: {
  def: GameDefinition;
  seats?: number;
  /** Who is sitting where. Omitted means the classic single human against bots. */
  plan?: Seat[];
}) {
  const { settings } = useSettings();
  const players = useMemo(
    () => plan ?? Array.from({ length: seats }, (_, i) => `P${i + 1}`),
    [seats, plan],
  );
  // Which local seat is looking at the screen. With one human this never changes; with
  // pass-and-play it follows whoever is owed a move, behind a hand-off screen so the next
  // player doesn't see the last one's cards.
  const localSeats = useMemo(
    () => (plan ? plan.filter((s) => s.kind === 'local').map((s) => s.id) : [HUMAN]),
    [plan],
  );
  const [me, setMe] = useState(localSeats[0] ?? HUMAN);
  const [handoff, setHandoff] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [history, setHistory] = useState<MoveRecord[]>([]);
  const [board, setBoard] = useState<Board>(() => boot(def, players, localSeats[0] ?? HUMAN, false));
  // One toast, two tones: a refusal is a red ✕, a status note is not.
  const [toast, setToast] = useState<{ text: string; tone: 'bad' | 'info' } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [askRank, setAskRank] = useState<string | null>(null);
  // True while the dealer's hands are working. The cards are already in the view by then —
  // this only holds them back on screen so they appear to arrive rather than to have been
  // there all along.
  const [dealing, setDealing] = useState(false);
  // bluff: which of your own cards are staged for the next claim, and what rank you'll claim
  // them as. Cleared on every submit and every fresh deal.
  const [bluffSelected, setBluffSelected] = useState<string[]>([]);
  const [bluffRank, setBluffRank] = useState<string | null>(null);
  // pit: the offer you're composing. No engine state backs this — it's just the form.
  const [pitGive, setPitGive] = useState<'C' | 'D' | 'H' | 'S'>('C');
  const [pitWant, setPitWant] = useState<'C' | 'D' | 'H' | 'S'>('D');
  const [pitCount, setPitCount] = useState(1);

  const { matchId, view } = board;
  const passAndPlay = localSeats.length > 1;
  const myLegal = board.legal;

  function deal(fresh: boolean) {
    setSelected(null);
    setAskRank(null);
    setToast(null);
    // Don't leave the abandoned match sitting in the store.
    if (fresh) { try { service.end(matchId); } catch { /* already gone */ } }
    setBoard(boot(def, players, localSeats[0] ?? HUMAN, fresh));
    setMe(localSeats[0] ?? HUMAN);
  }

  // Re-deal when the game or the seat count changes — but not on the first render, which the
  // lazy initializer above already handled.
  const bootKey = `${def.meta.id}:${players.length}`;
  const lastKey = useRef(bootKey);
  useEffect(() => {
    if (lastKey.current === bootKey) return;
    lastKey.current = bootKey;
    deal(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootKey]);

  // The pointer is only worth keeping while there is something to come back to.
  useEffect(() => {
    if (view.phase !== 'playing') forgetSession();
  }, [view.phase]);

  function restart() { deal(true); }
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
  const isBluff = view.mode === 'bluff';
  const isReflex = view.mode === 'reflex';
  const isPoker = view.mode === 'poker';
  const isPit = view.mode === 'pit';
  // Groups of 2+ need a button — you can't express "these three cards" with one tap.
  const comboMoves = useMemo(
    () => myLegal.filter((m) => m.actionId === 'climbPlay' && (m.cards?.length ?? 1) > 1),
    [myLegal],
  );
  const bombMoves = useMemo(() => myLegal.filter((m) => m.actionId === 'climbBomb'), [myLegal]);
  const canDeclineBomb = myLegal.some((m) => m.actionId === 'climbNoBomb');
  const isInterrupt = isClimb && view.isYourTurn && !view.players.find((p) => p.id === me)?.isTurn;
  const rankOfId = (id: string) => view.hand.find((c) => c.id === id)?.rank ?? '?';
  const auctionMoves = useMemo(
    () => myLegal.filter((m) => m.actionId === 'orderUp' || m.actionId === 'nameTrump'),
    [myLegal],
  );
  const canPassBid = myLegal.some((m) => m.actionId === 'passBid');
  const knockMoves = useMemo(() => myLegal.filter((m) => m.actionId === 'knock'), [myLegal]);
  const layOffMoves = useMemo(() => myLegal.filter((m) => m.actionId === 'layOff'), [myLegal]);
  const discardMoves = useMemo(() => myLegal.filter((m) => m.actionId === 'dealerDiscard'), [myLegal]);
  const canFlip = myLegal.some((m) => m.actionId === 'warFlip');
  const myPile = view.players.find((p) => p.id === me)?.handCount ?? 0;
  const playActionId = view.needsPassChoice ? 'choosePass'
    : discardMoves.length > 0 ? 'dealerDiscard'
    : view.mode === 'trick' ? 'playToTrick' : view.mode === 'climb' ? 'climbPlay' : isRummy ? 'rummyDiscard' : 'playCard';

  // Bot loop, paced by the user's bot-speed setting. Bots move inside the service — the client
  // asks it to advance one seat and gets back its own view, so a bot's hand never crosses the
  // boundary just to be played. A simultaneous pass can leave several bots waiting at once;
  // one per tick cascades through all of them.
  useEffect(() => {
    if (view.phase !== 'playing') return;
    const waiting = service.pending(matchId).some((p) => !localSeats.includes(p));
    if (!waiting) return;
    const timer = setTimeout(() => {
      const r = service.botStep(matchId, localSeats, settings.botDiff);
      if (r.moved) setBoard(read(matchId, me));
    }, BOT_SPEED_MS[settings.botSpeed]);
    return () => clearTimeout(timer);
  }, [board, matchId, me, localSeats, view.phase, settings.botSpeed, settings.botDiff]);

  // Pass-and-play: when the table is waiting on a different local seat, put a hand-off screen up
  // rather than swapping the cards under the person still looking at them.
  useEffect(() => {
    if (!passAndPlay || view.phase !== 'playing' || handoff) return;
    const waiting = service.pending(matchId).filter((p) => localSeats.includes(p));
    if (waiting.length === 0 || waiting.includes(me)) return;
    setHandoff(waiting[0]);
  }, [board, passAndPlay, view.phase, handoff, matchId, me, localSeats]);

  function takeSeat(seat: string) {
    setHandoff(null);
    setSelected(null);
    setAskRank(null);
    setMe(seat);
    setBoard(read(matchId, seat));
  }

  // A beginner hint asks the service what it would do. It is the same advisor the bots use, so
  // it can only suggest something this player is actually allowed to play.
  function showHint() {
    const m = service.hint(matchId, me);
    if (!m) { setToast({ text: 'No legal move to suggest right now.', tone: 'info' }); return; }
    setHint(m.cardId ?? m.cards?.[0] ?? null);
    setToast({ text: m.cardId || m.cards?.length ? 'Try the glowing card.' : `Try "${m.actionId}".`, tone: 'info' });
  }

  function openHistory() {
    setHistory(service.history(matchId));
    setShowHistory(true);
  }

  function askTakeback() {
    const req = service.requestTakeback(matchId, me);
    setBoard(read(matchId, me));
    setToast(req
      ? { text: `Asked the table to take that back — waiting on ${req.needed.length}.`, tone: 'info' }
      : { text: 'Move taken back.', tone: 'info' });
  }

  const takeback = view.phase === 'playing' ? service.pendingTakeback(matchId) : null;
  const nameOfSeat = (id: string) => plan?.find((s) => s.id === id)?.name ?? id;

  useEffect(() => { setHint(null); }, [board]);

  // Win sound, and the result that feeds the leaderboards.
  const prevPhase = useRef(view.phase);
  useEffect(() => {
    if (prevPhase.current !== 'roundOver' && view.phase === 'roundOver') {
      playSound('win', settings.sound);
      const scores = view.matchTarget != null ? (view.matchScores ?? view.scores) : view.scores;
      const highWins = view.matchTarget != null;
      const standings = view.players
        .map((p) => ({ name: nameOf(p.id), score: scores[p.id] ?? 0, isYou: localSeats.includes(p.id) }))
        .sort((a, b) => (highWins ? b.score - a.score : a.score - b.score));
      const winner = view.matchWinner ?? view.winner;
      recordResult({
        gameId: def.meta.id,
        gameName: def.meta.name,
        at: Date.now(),
        seats: view.players.length,
        standings,
        youWon: !!winner && localSeats.includes(winner),
      });
    }
    prevPhase.current = view.phase;
  }, [view.phase, settings.sound]);

  function playNextHand() {
    // Guarded because the button can be hit twice before the modal unmounts; the second call
    // finds the hand already dealt and would otherwise throw out of an event handler.
    try { service.nextHand(matchId); } catch { /* already dealt */ }
    setBoard(read(matchId, me));
    setSelected(null);
    setAskRank(null);
    setToast(null);
  }

  function submit(move: Move) {
    const res = service.submit(matchId, me, move);
    if (!res.ok) {
      // The rules said no. Say why, instead of letting the tap disappear.
      setToast({ text: res.reason ?? 'That move is not legal here.', tone: 'bad' });
      playSound('ui', settings.sound);
      setSelected(null);
      return;
    }
    if (move.actionId === 'playCard' || move.actionId === 'playToTrick' || move.actionId === 'climbPlay' || move.actionId === 'climbBomb') playSound('play', settings.sound);
    if (move.actionId === 'drawCard' || move.actionId === 'fishDraw') playSound('draw', settings.sound);
    if (move.actionId === 'ask') playSound('ui', settings.sound);
    if (move.actionId === 'bluffClaim' || move.actionId === 'bluffChallenge') playSound('play', settings.sound);
    if (move.actionId === 'reflexSlap') playSound('win', settings.sound);
    if (move.actionId === 'reflexFlip') playSound('play', settings.sound);
    setToast(null);
    setSelected(null);
    setAskRank(null);
    setBluffSelected([]);
    setBluffRank(null);
    setBoard(read(matchId, me));
  }

  // Bluff: clicking a card either starts a new group or, if it matches the real rank already
  // staged, adds to it (up to four) — a second click on an already-staged card removes it.
  // This is deliberately real-rank-only: the LIE lives entirely in the rank you claim next, not
  // in which physical cards you hand over, which is also the only shape the engine will accept.
  function toggleBluffCard(id: string) {
    const card = view.hand.find((c) => c.id === id);
    if (!card) return;
    if (bluffSelected.includes(id)) { setBluffSelected(bluffSelected.filter((x) => x !== id)); return; }
    const first = view.hand.find((c) => c.id === bluffSelected[0]);
    if (bluffSelected.length > 0 && first && first.rank !== card.rank) { setBluffSelected([id]); return; }
    if (bluffSelected.length >= 4) return;
    setBluffSelected([...bluffSelected, id]);
  }
  const bluffClaimMove = useMemo(
    () => myLegal.find((m) => m.actionId === 'bluffClaim' && m.claimedRank === bluffRank
      && m.cards?.length === bluffSelected.length && m.cards?.every((id) => bluffSelected.includes(id))),
    [myLegal, bluffRank, bluffSelected],
  );

  // A toast is a nudge, not a state to live in.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

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
  const suitPickerOpen = !!view.pendingChoice && view.pendingChoice.player === me;
  const nameOf = (id: string) => {
    const seat = plan?.find((s) => s.id === id);
    if (seat) return seat.id === me ? `${seat.name} (you)` : seat.name;
    return id === me ? settings.playerName : settings.botLabels ? `Bot ${id.slice(1)}` : id;
  };
  const teamOf = (id: string): string | null => {
    if (!view.teams) return null;
    const i = view.teams.findIndex((t) => t.includes(id));
    return i >= 0 ? `Team ${i === 0 ? 'A' : 'B'}` : null;
  };
  const backCls = `card back style-${settings.cardBack}`;

  return (
    <div className="table-wrap">
    <div className="table" data-felt={settings.tableFelt}>
      <TableRail felt={settings.tableFelt} />
      <div className={`felt ${dealing ? 'dealing' : ''}`}>
      <TableDressing felt={settings.tableFelt} title={def.meta.name} />
      <DealMotion
        seats={view.players.length}
        aim={['.opponents .seat', '.hand']}
        round={`${matchId}:${view.handNumber}`}
        onStart={() => setDealing(true)}
        onDone={() => setDealing(false)}
      />
      <div className="felt-content">
      {view.matchTarget != null && (
        <ScorePad view={view} me={me} nameOf={nameOf}
          lowWins={def.scoring.winner === 'lowestTotal'} />
      )}
      <div className="opponents">
        {view.players.filter((p) => p.id !== me).map((p) => {
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
                {p.handCount}{view.mode === 'trick' && (view.tricksWon?.[p.id] ?? 0) > 0 ? ` · ${view.tricksWon?.[p.id]} won` : ''}
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

      {view.mode === 'trick' && (view.auctionRound ?? 0) > 0 ? (
        <div className="center bid-area">
          {view.upcard && (
            <div className="pile">
              <CardFace card={view.upcard} />
              <div className="pile-label">Turned up</div>
            </div>
          )}
          {view.isYourTurn ? (
            <div className="bid-panel">
              <div className="bid-title">
                {view.auctionRound === 1
                  ? <>Trump {view.upcard ? SUIT_SYMBOLS[view.upcard.suit] : ''}?</>
                  : 'Name trump'}
              </div>
              <div className="bid-buttons">
                {auctionMoves.filter((m) => !m.alone).map((m, i) => (
                  <button key={`a${i}`} className={`bid-btn s-${m.choice}`} onClick={() => submit(m)}>
                    {m.actionId === 'orderUp' ? 'Order up' : SUIT_SYMBOLS[m.choice!] ?? m.choice}
                  </button>
                ))}
              </div>
              {auctionMoves.some((m) => m.alone) && (
                <div className="bid-buttons">
                  {auctionMoves.filter((m) => m.alone).map((m, i) => (
                    <button key={`s${i}`} className="bid-btn alone" onClick={() => submit(m)}>
                      Alone {m.actionId === 'orderUp' ? '' : SUIT_SYMBOLS[m.choice!] ?? m.choice}
                    </button>
                  ))}
                </div>
              )}
              {canPassBid
                ? <button className="draw-btn" onClick={() => submit({ actionId: 'passBid' })}>Pass</button>
                : <span className="mini-label">Dealer must call.</span>}
            </div>
          ) : <div className="trick-empty">Bidding…</div>}
        </div>
      ) : view.mode === 'trick' && view.bidding ? (
        <div className="center bid-area">
          {view.isYourTurn ? (
            <div className="bid-panel">
              <div className="bid-title">Your bid</div>
              <div className="bid-buttons">
                {Array.from({ length: view.hand.length + 1 }, (_, n) => (
                  <button key={n} className="bid-btn" onClick={() => submit({ actionId: 'bid', choice: String(n) })}>
                    {n === 0 ? 'Nil' : n}
                  </button>
                ))}
              </div>
            </div>
          ) : <div className="trick-empty">Bidding…</div>}
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
            : <div className="trick-empty">{view.isYourTurn ? 'Your lead' : '…'}</div>}
          <div className="trick-meta">
            Trump {view.trumpSuit && view.trumpSuit !== 'none' ? SUIT_SYMBOLS[view.trumpSuit] : '—'}
            {view.lead ? ` · led ${SUIT_SYMBOLS[view.lead]}` : ''}
            {view.maker ? ` · ${nameOf(view.maker)} called it${view.alone ? ' alone' : ''}` : ''}
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
              ? (askRank ? `Ask who for ${askRank}s?` : 'Pick a rank')
              : '…'}
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
            : <div className="trick-empty">Flip</div>}
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
                ? 'Lead anything'
                : SHAPE_NAME[view.climbPile.length] ?? `${view.climbPile.length} cards`}
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
          <span>{settings.playerName === 'You' ? 'Your hand' : `${settings.playerName}’s hand`}{view.mode === 'trick' && (view.tricksWon?.[me] ?? 0) > 0 ? ` · ${view.tricksWon?.[me]} won` : ''}{view.mode === 'trick' && view.bids?.[me] !== undefined ? ` · bid ${view.bids[HUMAN]}` : ''}{isFish ? ` · ${view.booksWon?.[me] ?? 0} books` : ''}{teamOf(me) ? ` · ${teamOf(me)}` : ''}</span>
          {view.needsPassChoice && (
            <span className="turn-badge">
              {view.passCount > 1
                ? `Pass ${view.passStaged.length}/${view.passCount} ${view.passDirection}`
                : `Pass ${view.passDirection}`}
            </span>
          )}
          {isInterrupt && <span className="bomb-badge">💣 Bomb?</span>}
          {discardMoves.length > 0 && <span className="turn-badge">Discard one</span>}
          {!view.passDirection && view.isYourTurn && !suitPickerOpen && !isInterrupt && <span className="turn-badge">Your turn</span>}
          {!view.needsPassChoice && view.passDirection && <span className="waiting-badge">Waiting on {view.passWaitingOn}…</span>}
          {canDraw && <button className="draw-btn" onClick={() => submit({ actionId: 'drawCard' })}>Draw</button>}
          {canPass && <button className="draw-btn" onClick={() => submit({ actionId: 'climbPass' })}>Pass</button>}
          {canFishDraw && <button className="draw-btn" onClick={() => submit({ actionId: 'fishDraw' })}>Draw</button>}
          {canDrawStock && <button className="draw-btn" onClick={() => submit({ actionId: 'drawStock' })}>Stock</button>}
          {canDrawDiscard && <button className="draw-btn" onClick={() => submit({ actionId: 'drawDiscard' })}>Take</button>}
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
          {canDeclineBomb && <button className="draw-btn" onClick={() => submit({ actionId: 'climbNoBomb' })}>Hold</button>}
          {layOffMoves.map((m, i) => (
            <button key={`lay${i}`} className="meld-btn" onClick={() => submit(m)}>
              Lay off {rankOfId(m.cardId!)}
            </button>
          ))}
          {view.deadwood != null && <span className="rummy-hint">deadwood {view.deadwood}</span>}
          {knockMoves.map((m, i) => (
            <button key={`knock${i}`} className="knock-btn" onClick={() => submit(m)}>
              Knock — throw {rankOfId(m.cardId!)}
            </button>
          ))}
          {isRummy && view.rummyPhase === 'play' && view.isYourTurn && <span className="rummy-hint">discard</span>}
          {view.isYourTurn && <button className="restart-btn" onClick={showHint} title="Suggest a move">Hint</button>}
          <button className="restart-btn" onClick={openHistory} title="Every move so far">History</button>
          {view.phase === 'playing' && !takeback && (
            <button className="restart-btn" onClick={askTakeback} title="Ask the table to take your last move back">Take back</button>
          )}
          <button className="restart-btn" onClick={restart} title="Deal a fresh game">Restart</button>
        </div>
        {isBluff ? (
          <div className="bluff-controls">
            <div className="bluff-info">
              <span className="bluff-pile">Center pile · {view.centerCount ?? 0} card{(view.centerCount ?? 0) === 1 ? '' : 's'}</span>
              {view.pendingClaim && (
                <span className={`bluff-claim ${view.pendingClaim.player === me ? 'mine' : ''}`}>
                  {nameOf(view.pendingClaim.player)} claim{view.pendingClaim.player === me ? '' : 's'} {view.pendingClaim.count}× {view.pendingClaim.claimedRank}
                </span>
              )}
            </div>
            {myLegal.some((m) => m.actionId === 'bluffChallenge') && (
              <button className="primary bluff-challenge" onClick={() => submit({ actionId: 'bluffChallenge' })}>
                🤨 Call bluff!
              </button>
            )}
            {myLegal.some((m) => m.actionId === 'bluffClaim') && (
              <>
                <div className={`hand hl-${settings.highlight}`}>
                  {hand.map((c) => (
                    <button key={c.id}
                      className={`card-btn ${bluffSelected.includes(c.id) ? 'selected' : 'playable'}`}
                      onClick={() => toggleBluffCard(c.id)}
                      title={bluffSelected.includes(c.id) ? 'Take this one back out' : 'Stage this card face down'}>
                      <CardFace card={c} />
                    </button>
                  ))}
                </div>
                <div className="bluff-rankpicker">
                  <span className="muted">Tap up to four of the same card, then claim them as whatever you like:</span>
                  <div className="seg wrap">
                    {def.deck.rankOrder.map((r) => (
                      <button key={r} className={bluffRank === r ? 'on' : ''} onClick={() => setBluffRank(r)}>{r}</button>
                    ))}
                  </div>
                  <button className="primary sm" disabled={!bluffClaimMove} onClick={() => bluffClaimMove && submit(bluffClaimMove)}>
                    Play {bluffSelected.length || ''} face down
                  </button>
                </div>
              </>
            )}
          </div>
        ) : isReflex ? (
          <div className="reflex-controls">
            <div className="reflex-pile">
              {view.pileTop ? <div className="pile-card"><CardFace card={view.pileTop} /></div> : <div className="empty-hand">— empty —</div>}
              <span className="muted">{view.zones.pile?.count ?? 0} on the pile</span>
            </div>
            <div className="reflex-actions">
              {myLegal.some((m) => m.actionId === 'reflexSlap') && (
                <button className="primary reflex-slap" onClick={() => submit({ actionId: 'reflexSlap' })}>✋ SLAP!</button>
              )}
              {myLegal.some((m) => m.actionId === 'reflexFlip') && (
                <button className="ghost" onClick={() => submit({ actionId: 'reflexFlip' })}>Flip</button>
              )}
            </div>
            <span className="muted">Your hand · {hand.length} card{hand.length === 1 ? '' : 's'}</span>
          </div>
        ) : isPoker ? (
          <div className="poker-controls">
            <div className="poker-info">
              <span className="chip">Pot · {view.pot ?? 0}</span>
              <span className="chip">Your chips · {view.chips?.[me] ?? 0}</span>
              {(view.currentBet ?? 0) > (view.committed?.[me] ?? 0) && (
                <span className="chip">To call · {(view.currentBet ?? 0) - (view.committed?.[me] ?? 0)}</span>
              )}
            </div>
            <div className="hand hl-off poker-hand">
              {hand.map((c) => (<div key={c.id} className="card-btn dim static"><CardFace card={c} /></div>))}
            </div>
            <div className="poker-actions">
              {myLegal.filter((m) => m.actionId?.startsWith('poker')).map((m, i) => (
                <button key={i} className={m.actionId === 'pokerFold' ? 'ghost danger' : 'primary'} onClick={() => submit(m)}>
                  {m.actionId === 'pokerCheck' ? 'Check'
                    : m.actionId === 'pokerCall' ? `Call ${(view.currentBet ?? 0) - (view.committed?.[me] ?? 0)}`
                    : m.actionId === 'pokerFold' ? 'Fold'
                    : `${m.actionId === 'pokerBet' ? 'Bet' : 'Raise to'} ${m.amount}`}
                </button>
              ))}
            </div>
          </div>
        ) : isPit ? (
          <div className="pit-controls">
            <div className="pit-hand-summary">
              {(['C', 'D', 'H', 'S'] as const).map((suit) => {
                const count = hand.filter((c) => c.suit === suit).length;
                return count > 0 ? <span key={suit} className="chip">{count}× {SUIT_SYMBOLS[suit]}</span> : null;
              })}
            </div>
            <div className="pit-market">
              {(view.market?.length ?? 0) === 0 && <span className="muted">No open offers.</span>}
              {view.market?.map((o) => (
                <div key={o.id} className={`pit-offer ${o.player === me ? 'mine' : ''}`}>
                  <span>{nameOf(o.player)} offers {o.count}× {SUIT_SYMBOLS[o.give]} for {SUIT_SYMBOLS[o.want]}</span>
                  {o.player === me
                    ? myLegal.some((m) => m.actionId === 'pitCancel' && m.offerId === o.id) && (
                        <button className="ghost sm" onClick={() => submit({ actionId: 'pitCancel', offerId: o.id })}>Cancel</button>
                      )
                    : myLegal.some((m) => m.actionId === 'pitAccept' && m.offerId === o.id) && (
                        <button className="primary sm" onClick={() => submit({ actionId: 'pitAccept', offerId: o.id })}>Accept</button>
                      )}
                </div>
              ))}
            </div>
            <div className="pit-offer-maker">
              <span className="muted">Offer</span>
              <select value={pitCount} onChange={(e) => setPitCount(+e.target.value)} aria-label="How many">
                {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <select value={pitGive} onChange={(e) => setPitGive(e.target.value as typeof pitGive)} aria-label="Give this suit">
                {(['C', 'D', 'H', 'S'] as const).map((sut) => <option key={sut} value={sut}>{SUIT_SYMBOLS[sut]} {SUIT_NAMES[sut]}</option>)}
              </select>
              <span className="muted">for</span>
              <select value={pitWant} onChange={(e) => setPitWant(e.target.value as typeof pitWant)} aria-label="Want this suit">
                {(['C', 'D', 'H', 'S'] as const).map((sut) => <option key={sut} value={sut}>{SUIT_SYMBOLS[sut]} {SUIT_NAMES[sut]}</option>)}
              </select>
              <button
                className="primary sm"
                disabled={!myLegal.some((m) => m.actionId === 'pitOffer' && m.give === pitGive && m.want === pitWant && m.cards?.[0] === String(pitCount))}
                onClick={() => submit({ actionId: 'pitOffer', give: pitGive, want: pitWant, cards: [String(pitCount)] })}
              >
                Offer
              </button>
            </div>
          </div>
        ) : isWar ? (
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
                className={`card-btn ${playable ? 'playable' : 'dim'} ${staged ? 'staged' : ''} ${hint === c.id ? 'hinted' : ''} ${(isFish ? c.rank === askRank : selected === c.id) ? 'selected' : ''}`}
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
          <div className="modal-box" role="dialog" aria-modal="true" aria-label="Choose a suit">
            <h3>Wild card — choose a suit</h3>
            <div className="suit-choices">
              {(['C', 'D', 'H', 'S'] as const).map((s) => (
                <button key={s} className={`suit-btn s-${s}`} aria-label={SUIT_NAMES[s]} onClick={() => submit({ actionId: 'resolveChoice', choice: s })}>{SUIT_SYMBOLS[s]}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {view.phase === 'roundOver' && !view.matchOver && (
        <div className="modal">
          {view.winner === me && <Confetti pieces={30} />}
          <div className={`modal-box celebrate ${view.winner === me ? 'won' : ''}`}>
            <span className="cb-kicker">Hand {view.handNumber}</span>
            <h3>{view.winner === me ? 'You take it' : `${nameOf(view.winner || '')} takes it`}</h3>
            <p className="scores">
              {Object.entries(view.scores).map(([p, s]) => (
                <span key={p} className={p === me ? 'mine' : ''}>{nameOf(p)} <b>+{s}</b></span>
              ))}
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

      {view.phase === 'roundOver' && view.matchOver && (() => {
        const iWon = view.matchWinner === me || (view.matchWinner == null && view.winner === me);
        const finals = Object.entries(view.matchTarget != null ? (view.matchScores ?? view.scores) : view.scores);
        const lowWins = def.scoring.winner === 'lowestTotal';
        const ranked = finals.slice().sort((a, b) => (lowWins ? a[1] - b[1] : b[1] - a[1]));
        return (
          <div className="modal">
            {iWon && <Confetti pieces={64} spread="rain" />}
            <div className={`modal-box celebrate final ${iWon ? 'won' : ''}`}>
              <span className="cb-crown" aria-hidden="true">{iWon ? '★' : '☆'}</span>
              <span className="cb-kicker">{view.matchTarget != null ? 'Match over' : 'Game over'}</span>
              <h3>{iWon ? 'You win' : `${nameOf(view.matchWinner ?? view.winner ?? '')} wins`}</h3>
              <ol className="podium">
                {ranked.map(([p, sc], i) => (
                  <li key={p} className={`${p === me ? 'mine' : ''} ${i === 0 ? 'first' : ''}`}>
                    <span className="pd-rank">{i + 1}</span>
                    <span className="pd-name">{nameOf(p)}</span>
                    <b className="pd-score">{sc}</b>
                  </li>
                ))}
              </ol>
              <button className="primary" onClick={restart}>Play again</button>
            </div>
          </div>
        );
      })()}

      </div>
      </div>
    </div>

      {handoff && (
        <div className="modal handoff">
          <div className="modal-box">
            <div className="handoff-mark">🃏</div>
            <h3>Pass the device to {nameOfSeat(handoff)}</h3>
            <p className="scores">Everyone else, look away.</p>
            <button className="primary" onClick={() => takeSeat(handoff)}>
              I'm {nameOfSeat(handoff)} — show my hand
            </button>
          </div>
        </div>
      )}

      {takeback && takeback.needed.includes(me) && (
        <div className="takeback-bar" role="alert">
          <span>{nameOfSeat(takeback.by)} wants to take their last move back.</span>
          <div className="tb-actions">
            <button className="ghost sm" onClick={() => { service.declineTakeback(matchId); setBoard(read(matchId, me)); }}>No</button>
            <button className="primary sm" onClick={() => { service.agreeTakeback(matchId, me); setBoard(read(matchId, me)); }}>
              Allow it ({takeback.agreed.length}/{takeback.needed.length})
            </button>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="modal" onClick={() => setShowHistory(false)}>
          <div className="modal-box wide" onClick={(e) => e.stopPropagation()}>
            <h3>Move history</h3>
            <ol className="movelist">
              {history.length === 0 && <li className="muted">Nothing has happened yet.</li>}
              {history.map((h) => (
                <li key={h.n}>
                  <span className="ml-n">{h.n}</span>
                  <span className="ml-seat">{nameOfSeat(h.seat)}</span>
                  <span className="ml-text">{h.text}</span>
                </li>
              ))}
            </ol>
            <button className="primary" onClick={() => setShowHistory(false)}>Close</button>
          </div>
        </div>
      )}

      {toast && (
        <div className={`refused ${toast.tone}`} role="alert">
          <span className="refused-mark">{toast.tone === 'bad' ? '✕' : 'i'}</span>{toast.text}
        </div>
      )}

      <div className="sr-only" role="status" aria-live="polite">
        {view.log.length > 0 ? view.log[view.log.length - 1].text : ''}
      </div>

      {settings.showLog && (
        <div className="log">
          <div className="log-head">Game log</div>
          {view.log.slice().reverse().map((e) => (<div key={e.t} className="log-row">{e.text}</div>))}
        </div>
      )}
    </div>
  );
}

// Everything the component knows about the match: an id, the board as this player may see it,
// and what the service says this player may do. Nothing hidden, nothing authoritative.
interface Board {
  matchId: string;
  view: RedactedState;
  legal: Move[];
}

function read(matchId: string, me: string): Board {
  const view = service.view(matchId, me);
  return { matchId, view, legal: view.isYourTurn ? service.legal(matchId, me) : [] };
}

function boot(def: GameDefinition, players: string[] | Seat[], me: string, fresh: boolean): Board {
  if (!fresh) {
    const resume = resumableSession();
    if (resume && resume.gameId === def.meta.id && resume.seats === players.length) {
      try { return read(resume.matchId, me); } catch { /* record went away; deal a new one */ }
    }
  }
  const m = service.create(def, def.meta.id, players);
  rememberSession(m.matchId, def.meta.id, players.length);
  return read(m.matchId, me);
}

function sortHand(hand: Card[], def: GameDefinition, mode: 'off' | 'rank' | 'suit'): Card[] {
  if (mode === 'off') return hand;
  const rankIdx = (r: string) => { const i = def.deck.rankOrder.indexOf(r as never); return i < 0 ? 99 : i; };
  const copy = hand.slice();
  if (mode === 'rank') copy.sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank) || SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]);
  else copy.sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || rankIdx(a.rank) - rankIdx(b.rank));
  return copy;
}
