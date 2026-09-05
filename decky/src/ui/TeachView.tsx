import { useEffect, useMemo, useRef, useState } from 'react';
import { GameDefinition, MatchState } from '../engine/types';
import { createMatch, applyMove, isTerminal, isMatchOver, actingPlayers, nextHand } from '../engine/engine';
import { positionKey } from '../bots/solitaireBot';
import { explainMove, pickTeachMove } from '../authoring/teach';

interface LogLine { n: number; seat: string; what: string; why: string; deal?: boolean; }

const SPEED_MS = 900;

/** Item 39: the game plays itself and narrates as it goes — see authoring/teach.ts for how
 *  each move gets its line. A fresh deal every time this opens; "Watch again" deals another. */
export function TeachView({ def, onClose }: { def: GameDefinition; onClose: () => void }) {
  const seats = useMemo(
    () => (def.solitaire ? ['P1'] : Array.from({ length: def.meta.players.min }, (_, i) => `P${i + 1}`)),
    [def],
  );
  const seatName = (id: string) => (def.solitaire ? 'The player' : `Seat ${seats.indexOf(id) + 1}`);

  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000));
  const [state, setState] = useState<MatchState>(() => createMatch(def, seats, seed));
  const [log, setLog] = useState<LogLine[]>([]);
  const [playing, setPlaying] = useState(true);
  const [done, setDone] = useState(false);
  const logRef = useRef<HTMLOListElement>(null);

  const stateRef = useRef(state);
  const botSeedRef = useRef(seed ^ 0x9e3779b9);
  const seenRef = useRef<Set<string>>(new Set());
  const nRef = useRef(0);

  function reset(newSeed: number) {
    const s = createMatch(def, seats, newSeed);
    stateRef.current = s;
    botSeedRef.current = newSeed ^ 0x9e3779b9;
    seenRef.current = new Set();
    nRef.current = 0;
    setState(s);
    setLog([]);
    setDone(false);
    setPlaying(true);
  }

  function step() {
    let s = stateRef.current;
    if (isTerminal(s)) {
      if (isMatchOver(s)) { setPlaying(false); setDone(true); return; }
      const handSeed = (Math.imul(seed + nRef.current + 1, 48271) + 12345) >>> 0;
      s = nextHand(s, handSeed);
      stateRef.current = s;
      setState(s);
      nRef.current += 1;
      setLog((l) => [...l.slice(-199), { n: nRef.current, seat: '', what: '', why: '', deal: true }]);
      return;
    }
    const actor = actingPlayers(s)[0];
    if (!actor) { setPlaying(false); setDone(true); return; }
    const { move, botSeed } = pickTeachMove(def, s, actor, botSeedRef.current, seenRef.current);
    botSeedRef.current = botSeed;
    if (!move) { setPlaying(false); setDone(true); return; }
    const { what, why } = explainMove(s, actor, move);
    const s2 = applyMove(s, actor, move);
    stateRef.current = s2;
    if (def.solitaire) seenRef.current.add(positionKey(s2));
    setState(s2);
    nRef.current += 1;
    setLog((l) => [...l.slice(-199), { n: nRef.current, seat: actor, what, why }]);
  }

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(step, SPEED_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  return (
    <div className="teach">
      <div className="crumbs">
        <button className="ghost" onClick={onClose}>← All games</button>
        <span className="crumb-title">{def.meta.name} · Teach mode</span>
      </div>

      <div className="tourney-banner glass" role="status">
        <div>
          <b>Watching {def.meta.name} play itself</b>
          <p className="muted">
            {done ? 'Match over.' : `Move ${nRef.current}${def.scoring.target != null ? ` · hand ${state.handNumber}` : ''}`}
          </p>
        </div>
        {!done && (
          <button className="ghost sm" onClick={() => setPlaying((p) => !p)}>{playing ? '⏸ Pause' : '▶ Play'}</button>
        )}
        {!done && !playing && <button className="ghost sm" onClick={step}>⏭ Next move</button>}
        <button className="primary sm" onClick={() => setSeed((s) => { const n = s + 1_618_033; reset(n); return n; })}>
          🔁 Watch again
        </button>
      </div>

      <ol className="movelist teach-log" ref={logRef}>
        {log.length === 0 && <li className="muted">Dealing…</li>}
        {log.map((l) => (
          l.deal
            ? <li key={l.n} className="muted teach-deal"><span className="ml-text">— deals the next hand —</span></li>
            : (
              <li key={l.n}>
                <span className="ml-n">{l.n}</span>
                <span className="ml-seat">{seatName(l.seat)}</span>
                <span className="ml-text">
                  <b>{l.what}</b>{l.why ? <span className="muted"> — {l.why}</span> : null}
                </span>
              </li>
            )
        ))}
        {done && <li className="muted teach-deal"><span className="ml-text">— match over —</span></li>}
      </ol>
    </div>
  );
}
