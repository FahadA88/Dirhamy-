import { useEffect, useRef, useState } from 'react';
import { GameDefinition, Move, RedactedState } from '../engine/types';
import { CardFace } from './Card';
import { TableDressing, TableRail } from './TableDressing';
import { DealMotion } from './DealMotion';
import { Confetti } from './Confetti';
import { useSettings } from '../settings/SettingsContext';
import { playSound } from './sound';
import { service } from '../server/local';
import { dailyStreak, recordDaily, todayKey } from '../social/daily';
import { findPuzzle } from '../library/puzzles';

const ME = 'P1';

// Patience has no opponents and no turns, so it gets its own board: foundations and cells along
// the top, columns fanned below. Interaction is pick-then-place, with a double-tap shortcut
// straight to the foundations — the move you make most.
//
// Like the multiplayer table, this holds a match id and a redacted view. Face-down cards stay
// face down on the service's side of the line: undo and hint are service calls, not local
// replays of a state this component was trusted with.
export function SolitaireTable({ def, daily = false, puzzle = false }: {
  def: GameDefinition; daily?: boolean;
  /** Item 41: a real deal, known ahead of time to have a short solve — see puzzles.ts. */
  puzzle?: boolean;
}) {
  const { settings } = useSettings();
  const [board, setBoard] = useState<{ matchId: string; view: RedactedState; puzzleMoves?: number }>(() => boot(def, daily, puzzle));
  const [dealing, setDealing] = useState(false);
  const [pick, setPick] = useState<{ zone: string; cardId: string } | null>(null);
  const [hint, setHint] = useState<Move | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // Records today's result exactly once, the moment this specific match ends — not on every
  // re-render while roundOver stays true, and not on a later reload of the same finished match.
  const recordedDaily = useRef(false);

  const { matchId, view } = board;
  const gameId = def.meta.id;
  const first = useRef(gameId);
  useEffect(() => {
    if (first.current === gameId) return;
    first.current = gameId;
    newDeal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    if (!daily || recordedDaily.current || view.phase !== 'roundOver') return;
    recordedDaily.current = true;
    recordDaily({ date: todayKey(), won: !!view.winner, moves: view.moveCount ?? 0 });
  }, [daily, view.phase, view.winner, view.moveCount]);

  const moves = view.solMoves ?? [];
  const cfg = def.solitaire!;

  function refresh(id: string) {
    setBoard((b) => ({ matchId: id, view: service.view(id, ME), puzzleMoves: b.puzzleMoves }));
    setCanUndo(service.canUndo(id));
    setCanRedo(service.canRedo(id));
  }

  function commit(m: Move) {
    setPick(null);
    setHint(null);
    const res = service.submit(matchId, ME, m);
    if (!res.ok) { playSound('ui', settings); return; }
    playSound(m.to?.startsWith('found') ? 'win' : 'play', settings);
    refresh(matchId);
  }

  function undo() {
    if (!service.undo(matchId, ME).ok) return;
    setPick(null);
    setHint(null);
    playSound('ui', settings);
    refresh(matchId);
  }

  // Worklist #55: "patience has no redo... which is most of what undo is for in patience" —
  // step back through a line of play with Undo, then step back into it with this rather than
  // replaying it by hand.
  function redo() {
    if (!service.redo(matchId, ME).ok) return;
    setPick(null);
    setHint(null);
    playSound('ui', settings);
    refresh(matchId);
  }

  function newDeal() {
    setPick(null);
    setHint(null);
    setCanUndo(false);
    setCanRedo(false);
    try { service.end(matchId); } catch { /* already gone */ }
    recordedDaily.current = false;
    setBoard(boot(def, daily, puzzle));
  }

  /**
   * The exact deal this table started from, dealt again from scratch — not a new shuffle.
   *
   * The one place this earns its keep more than anywhere else in the app: a patience deal is
   * either winnable or it is not, and right now the only way to find out is to remember the
   * layout yourself and hope you shuffle back into it, which nobody does. Not offered on Today's
   * Deal, which is already the one deal everybody is replaying together.
   */
  function replayDeal() {
    setPick(null);
    setHint(null);
    setCanUndo(false);
    setCanRedo(false);
    const nextId = service.replaySameDeal(matchId, def.meta.id).matchId;
    try { service.end(matchId); } catch { /* already gone */ }
    recordedDaily.current = false;
    setBoard((b) => ({ matchId: nextId, view: service.view(nextId, ME), puzzleMoves: b.puzzleMoves }));
  }

  function showHint() {
    setHint(service.hint(matchId, ME));
    playSound('ui', settings);
  }

  // Tapping a card: pick it up, or drop what you're holding onto it.
  function tapCard(zone: string, cardId: string) {
    if (pick) {
      const m = moves.find((x) => x.cardId === pick.cardId && x.from === pick.zone && x.to === zone);
      if (m) { commit(m); return; }
      if (pick.zone === zone && pick.cardId === cardId) { setPick(null); return; }
    }
    if (moves.some((x) => x.cardId === cardId && x.from === zone)) setPick({ zone, cardId });
    else setPick(null);
  }

  function tapZone(zone: string) {
    if (!pick) return;
    const m = moves.find((x) => x.cardId === pick.cardId && x.from === pick.zone && x.to === zone);
    if (m) commit(m);
    else setPick(null);
  }

  // A free cell, foundation, or empty tableau column has no card of its own to carry a button —
  // this is what lets Enter/Space complete a drop onto one from the keyboard, the same as
  // clicking it. Cards that ARE present already get their own <button>; this only has to cover
  // the zone itself.
  function zoneKeyDown(e: React.KeyboardEvent, zone: string) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapZone(zone); }
  }

  // Double-tap sends a card home if it can go.
  function sendHome(zone: string, cardId: string) {
    const m = moves.find((x) => x.cardId === cardId && x.from === zone && x.to?.startsWith('found'));
    if (m) commit(m);
  }

  const canMoveFrom = (zone: string, cardId: string) => moves.some((m) => m.cardId === cardId && m.from === zone);
  const isPicked = (zone: string, cardId: string) => pick?.zone === zone && pick.cardId === cardId;
  const isHinted = (zone: string, cardId: string) => hint?.from === zone && hint.cardId === cardId;
  const dropOk = (zone: string) => !!pick && moves.some((m) => m.cardId === pick.cardId && m.from === pick.zone && m.to === zone);

  const drawMove = moves.find((m) => m.actionId === 'solDraw');
  const redealMove = moves.find((m) => m.actionId === 'solRedeal');
  const dealMove = moves.find((m) => m.actionId === 'solDeal');
  const backCls = `card back style-${settings.cardBack}`;

  return (
    <div className="table-wrap">
      <div className="table" data-felt={settings.tableFelt}>
        <TableRail felt={settings.tableFelt} />
        <div className={`felt ${dealing ? 'dealing' : ''}`}>
          <TableDressing felt={settings.tableFelt} title={def.meta.name} />
          {/* Patience is dealt to columns, not to seats: one flick per column. */}
          <DealMotion seats={7} aim={['.sol-col']} round={matchId} onStart={() => setDealing(true)} onDone={() => setDealing(false)} />
          {/* The column count is needed to size the cards so the whole board fits a narrow
              screen, and custom properties only inherit downward — so it is set here rather
              than only on the tableau. */}
          <div className="felt-content sol" style={{ '--cols': cfg.columns } as React.CSSProperties}>

            <div className="sol-bar">
              <span className="sol-stat">{view.moveCount ?? 0} moves</span>
              {cfg.stock === 'waste' && (view.redealsLeft ?? -1) >= 0 && (
                <span className="sol-stat">{view.redealsLeft} redeals</span>
              )}
              {view.moveCapacity != null && (
                <span className="sol-stat" title="How many cards a single move can shift right now">
                  {view.moveCapacity} at once
                </span>
              )}
              <div className="sol-actions">
                <button className="ghost sm" onClick={undo} disabled={!canUndo}>Undo</button>
                <button className="ghost sm" onClick={redo} disabled={!canRedo}>Redo</button>
                <button className="ghost sm" onClick={showHint} disabled={moves.length === 0}>Hint</button>
                {/* Today's Deal is one deal, the same for everyone playing today — a "new deal"
                    button here would just be a way to quietly stop playing it. */}
                {daily
                  ? <span className="sol-stat" title="Today's Deal is the same for everyone">📅 Today's Deal</span>
                  : (
                    <>
                      {puzzle && (
                        board.puzzleMoves != null
                          ? <span className="sol-stat" title="A no-lookahead player found a real win from this exact deal">
                              🧩 Puzzle · solved in {board.puzzleMoves}
                            </span>
                          : <span className="sol-stat" title="No quick solve turned up in time — this is an ordinary deal instead">
                              🧩 No puzzle found — try again
                            </span>
                      )}
                      <button className="ghost sm" onClick={replayDeal} title="Deal this exact layout again">Replay</button>
                      <button className="ghost sm" onClick={newDeal}>{puzzle ? 'New puzzle' : 'New deal'}</button>
                    </>
                  )}
              </div>
            </div>

            <div className="sol-top">
              <div className="sol-group">
                {cfg.stock !== 'none' && (
                  <button className="sol-slot stock" onClick={() => { if (drawMove) commit(drawMove); else if (redealMove) commit(redealMove); else if (dealMove) commit(dealMove); }}
                    title={dealMove ? 'Deal a row' : drawMove ? 'Turn the stock' : redealMove ? 'Recycle' : 'Empty'}>
                    {(view.stockCount ?? 0) > 0
                      ? <div className={`${backCls} big`} />
                      : <div className={`sol-empty ${redealMove ? 'recycle' : ''}`}>{redealMove ? '↻' : ''}</div>}
                    <span className="sol-count">{view.stockCount ?? 0}</span>
                  </button>
                )}
                {cfg.stock === 'waste' && (
                  <div className="sol-slot waste">
                    {(view.wasteCards ?? []).length === 0 ? <div className="sol-empty" /> : (
                      <div className="waste-fan">
                        {(view.wasteCards ?? []).map((c, i, arr) => {
                          const top = i === arr.length - 1;
                          return (
                            <button key={c.id} className={`sol-card ${top && canMoveFrom('waste', c.id) ? 'live' : ''} ${isPicked('waste', c.id) ? 'picked' : ''} ${isHinted('waste', c.id) ? 'hinted' : ''}`}
                              disabled={!top}
                              onClick={() => tapCard('waste', c.id)}
                              onDoubleClick={() => sendHome('waste', c.id)}>
                              <CardFace card={c} />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {(view.freeCells ?? []).map((cell) => (
                  // Only needs to be a keyboard target while empty — an occupied cell's card
                  // already carries its own <button> for picking it up, and a free cell can
                  // never itself be a drop target once it holds a card. The role/tabIndex/keydown
                  // are real, just applied by the conditional spread below rather than statically,
                  // which is more than the linter's static check can see.
                  // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
                  <div key={cell.id} className={`sol-slot cell ${dropOk(cell.id) ? 'target' : ''}`} onClick={() => tapZone(cell.id)}
                    {...(!cell.card ? { role: 'button' as const, tabIndex: 0, 'aria-label': 'Free cell, empty', onKeyDown: (e: React.KeyboardEvent) => zoneKeyDown(e, cell.id) } : {})}>
                    {cell.card ? (
                      <button className={`sol-card ${canMoveFrom(cell.id, cell.card.id) ? 'live' : ''} ${isPicked(cell.id, cell.card.id) ? 'picked' : ''} ${isHinted(cell.id, cell.card.id) ? 'hinted' : ''}`}
                        onClick={(e) => { e.stopPropagation(); tapCard(cell.id, cell.card!.id); }}
                        onDoubleClick={() => sendHome(cell.id, cell.card!.id)}>
                        <CardFace card={cell.card} />
                      </button>
                    ) : <div className="sol-empty">·</div>}
                  </div>
                ))}
              </div>

              <div className="sol-group founds">
                {(view.foundations ?? []).map((f) => {
                  const top = f.cards[f.cards.length - 1];
                  return (
                    // The top card here is a plain CardFace, never a <button> — unlike a tableau
                    // column, a foundation has no per-card button to fall back on even when it
                    // holds cards, so this needs the keyboard treatment unconditionally.
                    <div key={f.id} className={`sol-slot found ${dropOk(f.id) ? 'target' : ''}`} onClick={() => tapZone(f.id)}
                      role="button" tabIndex={0}
                      aria-label={top ? `Foundation, ${top.rank} of ${top.suit} on top` : 'Foundation, empty'}
                      onKeyDown={(e) => zoneKeyDown(e, f.id)}>
                      {top ? <CardFace card={top} /> : <div className="sol-empty">♠</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="sol-tableau" style={{ '--cols': cfg.columns } as React.CSSProperties}>
              {(view.tableau ?? []).map((col) => (
                // Only needs to be a keyboard target while empty — every card already in the
                // column carries its own <button>, and clicking any one of them while holding a
                // picked card already drops onto the column, so an occupied column has a
                // keyboard path with no help from the div itself. Same conditional-spread shape
                // as the free cells above, and the same static-analysis blind spot.
                // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
                <div key={col.id} className={`sol-col ${dropOk(col.id) ? 'target' : ''}`} onClick={() => tapZone(col.id)}
                  {...(col.cards.length === 0 ? { role: 'button' as const, tabIndex: 0, 'aria-label': 'Column, empty', onKeyDown: (e: React.KeyboardEvent) => zoneKeyDown(e, col.id) } : {})}>
                  {col.cards.length === 0 && <div className="sol-empty col-empty" />}
                  {col.cards.map((c, i) => {
                    const down = i < col.faceDown;
                    return (
                      <button key={`${col.id}-${i}`}
                        className={`sol-card stacked ${down ? 'down' : ''} ${canMoveFrom(col.id, c.id) ? 'live' : ''} ${isPicked(col.id, c.id) ? 'picked' : ''} ${isHinted(col.id, c.id) ? 'hinted' : ''}`}
                        style={{ marginTop: i === 0 ? 0 : down ? 'calc(var(--ch) * -0.84)' : 'calc(var(--ch) * -0.72)' }}
                        disabled={down}
                        onClick={(e) => { e.stopPropagation(); tapCard(col.id, c.id); }}
                        onDoubleClick={(e) => { e.stopPropagation(); sendHome(col.id, c.id); }}>
                        {down ? <div className={backCls} style={{ width: 'var(--cw)', height: 'var(--ch)' }} /> : <CardFace card={c} />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>

      {view.phase === 'roundOver' && (
        <div className="modal">
          {view.winner && <Confetti pieces={64} spread="rain" />}
          <div className={`modal-box celebrate ${view.winner ? 'won' : ''}`}>
            {view.winner && <span className="cb-crown" aria-hidden="true">★</span>}
            <span className="cb-kicker">
              {daily ? "Today's Deal" : view.winner ? `${view.moveCount} moves` : 'Stuck'}
            </span>
            <h3>{view.winner ? 'Solved' : 'No moves left'}</h3>
            <p className="scores">
              {daily ? (
                <span>
                  {view.winner ? `Solved in ${view.moveCount} moves. ` : 'Not today. '}
                  {dailyStreak() > 1 && `${dailyStreak()} days running.`}
                </span>
              ) : (
                <span>{view.winner
                  ? 'Every card is home.'
                  : 'Blocked. Undo, or take a fresh deal.'}</span>
              )}
            </p>
            <div className="sol-end-actions">
              {!view.winner && <button className="ghost" onClick={undo} disabled={!canUndo}>Undo</button>}
              {/* Stuck is exactly when replaying the same deal matters most — proving it really
                  was unwinnable, or that it wasn't and you missed something. */}
              {!daily && !view.winner && <button className="ghost" onClick={replayDeal}>Replay this deal</button>}
              {/* Today's Deal offers no replacement deal — see the sol-actions bar above for why —
                  so undoing back into it is the only way to keep going; there is nothing to press
                  once you are actually done, the same as the daily deal it is modelled on. */}
              {!daily && <button className="primary" onClick={newDeal}>New deal</button>}
            </div>
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

function boot(def: GameDefinition, daily: boolean, puzzle = false): { matchId: string; view: RedactedState; puzzleMoves?: number } {
  // Today's Deal fixes BOTH seeds that feed deriveSeed() (fairness.ts) to strings built from
  // today's UTC date — the same commit-reveal shuffle math every match already uses, just with
  // its two random inputs replaced by public, reproducible ones. Anyone on Earth calling this
  // on the same UTC day gets byte-for-byte the same handSeed, and so the same shuffle.
  const key = todayKey();
  // A puzzle picks its own hand seed directly (see findPuzzle) rather than deriving one from a
  // client/server pair — the same forcedHandSeed escape hatch replaySameDeal already uses, for
  // the same reason: the whole point here is dealing a SPECIFIC, already-known-good layout. No
  // solvable seed turned up (rare, but a shallow greedy search isn't guaranteed one) falls back
  // to an ordinary deal rather than a broken table.
  const found = puzzle ? findPuzzle(def) : null;
  const m = daily
    ? service.create(def, `daily-${def.meta.id}-${key}`, [ME], `daily-client-${key}`, `daily-server-${key}`)
    : service.create(def, def.meta.id, [ME], undefined, undefined, found?.seed);
  return { matchId: m.matchId, view: service.view(m.matchId, ME), puzzleMoves: found?.moves };
}
