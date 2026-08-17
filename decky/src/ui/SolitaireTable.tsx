import { useEffect, useRef, useState } from 'react';
import { GameDefinition, Move, RedactedState } from '../engine/types';
import { CardFace } from './Card';
import { TableDressing, TableRail } from './TableDressing';
import { DealMotion } from './DealMotion';
import { useSettings } from '../settings/SettingsContext';
import { playSound } from './sound';
import { service } from '../server/local';

const ME = 'P1';

// Patience has no opponents and no turns, so it gets its own board: foundations and cells along
// the top, columns fanned below. Interaction is pick-then-place, with a double-tap shortcut
// straight to the foundations — the move you make most.
//
// Like the multiplayer table, this holds a match id and a redacted view. Face-down cards stay
// face down on the service's side of the line: undo and hint are service calls, not local
// replays of a state this component was trusted with.
export function SolitaireTable({ def }: { def: GameDefinition }) {
  const { settings } = useSettings();
  const [board, setBoard] = useState<{ matchId: string; view: RedactedState }>(() => boot(def));
  const [dealing, setDealing] = useState(false);
  const [pick, setPick] = useState<{ zone: string; cardId: string } | null>(null);
  const [hint, setHint] = useState<Move | null>(null);
  const [canUndo, setCanUndo] = useState(false);

  const { matchId, view } = board;
  const gameId = def.meta.id;
  const first = useRef(gameId);
  useEffect(() => {
    if (first.current === gameId) return;
    first.current = gameId;
    newDeal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const moves = view.solMoves ?? [];
  const cfg = def.solitaire!;

  function refresh(id: string) {
    setBoard({ matchId: id, view: service.view(id, ME) });
    setCanUndo(service.canUndo(id));
  }

  function commit(m: Move) {
    setPick(null);
    setHint(null);
    const res = service.submit(matchId, ME, m);
    if (!res.ok) { playSound('ui', settings.sound); return; }
    playSound(m.to?.startsWith('found') ? 'win' : 'play', settings.sound);
    refresh(matchId);
  }

  function undo() {
    if (!service.undo(matchId, ME).ok) return;
    setPick(null);
    setHint(null);
    playSound('ui', settings.sound);
    refresh(matchId);
  }

  function newDeal() {
    setPick(null);
    setHint(null);
    setCanUndo(false);
    try { service.end(matchId); } catch { /* already gone */ }
    setBoard(boot(def));
  }

  function showHint() {
    setHint(service.hint(matchId, ME));
    playSound('ui', settings.sound);
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
          <div className="felt-content sol">

            <div className="sol-bar">
              <span className="sol-stat">{view.moveCount ?? 0} moves</span>
              {cfg.stock === 'waste' && (view.redealsLeft ?? -1) >= 0 && (
                <span className="sol-stat">{view.redealsLeft} redeals</span>
              )}
              <div className="sol-actions">
                <button className="ghost sm" onClick={undo} disabled={!canUndo}>Undo</button>
                <button className="ghost sm" onClick={showHint} disabled={moves.length === 0}>Hint</button>
                <button className="ghost sm" onClick={newDeal}>New deal</button>
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
                  <div key={cell.id} className={`sol-slot cell ${dropOk(cell.id) ? 'target' : ''}`} onClick={() => tapZone(cell.id)}>
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
                    <div key={f.id} className={`sol-slot found ${dropOk(f.id) ? 'target' : ''}`} onClick={() => tapZone(f.id)}>
                      {top ? <CardFace card={top} /> : <div className="sol-empty">♠</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="sol-tableau" style={{ '--cols': cfg.columns } as React.CSSProperties}>
              {(view.tableau ?? []).map((col) => (
                <div key={col.id} className={`sol-col ${dropOk(col.id) ? 'target' : ''}`} onClick={() => tapZone(col.id)}>
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
          <div className="modal-box">
            <h3>{view.winner ? `🏆 Solved in ${view.moveCount} moves` : 'No moves left'}</h3>
            <p className="scores">
              {view.winner
                ? 'Every card is home.'
                : 'Blocked. Undo, or take a fresh deal.'}
            </p>
            <div className="sol-end-actions">
              {!view.winner && <button className="ghost" onClick={undo} disabled={!canUndo}>Undo</button>}
              <button className="primary" onClick={newDeal}>New deal</button>
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

function boot(def: GameDefinition): { matchId: string; view: RedactedState } {
  const m = service.create(def, def.meta.id, [ME]);
  return { matchId: m.matchId, view: service.view(m.matchId, ME) };
}
