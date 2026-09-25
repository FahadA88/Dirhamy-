import { useMemo, useRef, useState } from 'react';
import { HomeLayoutProps } from './types';
import { useKindGroups } from './shared';

interface Node { id: string; x: number; y: number; label: string; game: true }
interface ClusterNode { id: string; x: number; y: number; label: string; mark: string }

const GOLDEN = 137.508 * (Math.PI / 180);

/** Games as nodes on a pannable board, clustered by kind and lightly wired to their cluster —
 *  drag the background to pan, the wheel to zoom, click a node to open it. */
export function CanvasLayout({ games, onOpen }: HomeLayoutProps) {
  const kinds = useKindGroups(games);

  const { clusters, nodes, links } = useMemo(() => {
    const clusters: ClusterNode[] = [];
    const nodes: Node[] = [];
    const links: { x1: number; y1: number; x2: number; y2: number }[] = [];
    kinds.forEach((k, i) => {
      const m = k.games.length;
      // A ring has to grow with how many games sit on it, or a big kind like Trick-taking
      // piles its pills on top of each other — the node is ~92px wide, so the ring's own
      // circumference needs roughly that much room per game.
      const nr = Math.max(70, (m * 96) / (2 * Math.PI));
      const cr = 160 * Math.sqrt(i + 1) + nr;
      const ca = i * GOLDEN;
      const cx = Math.cos(ca) * cr;
      const cy = Math.sin(ca) * cr;
      clusters.push({ id: k.id, x: cx, y: cy, label: k.label, mark: k.mark });
      k.games.forEach((g, j) => {
        const na = (2 * Math.PI * j) / m;
        const x = cx + Math.cos(na) * nr;
        const y = cy + Math.sin(na) * nr;
        nodes.push({ id: g.id, x, y, label: g.definition.meta.name, game: true });
        links.push({ x1: cx, y1: cy, x2: x, y2: y });
      });
    });
    return { clusters, nodes, links };
  }, [kinds]);

  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [scale, setScale] = useState(1);
  const drag = useRef<{ x: number; y: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (e.target !== e.currentTarget) return;
    drag.current = { x: e.clientX - tx, y: e.clientY - ty };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setTx(e.clientX - drag.current.x);
    setTy(e.clientY - drag.current.y);
  }
  function onPointerUp() { drag.current = null; }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setScale((s) => Math.min(2, Math.max(0.5, s - e.deltaY * 0.001)));
  }

  const reset = () => { setTx(0); setTy(0); setScale(1); };

  return (
    <div className="hl-canvas">
      <div className="hl-canvas-toolbar">
        <p className="muted">Drag to pan, scroll to zoom. {games.length} games, clustered by kind.</p>
        <button className="ghost sm" onClick={reset}>Recenter</button>
      </div>
      <div
        className="hl-canvas-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      >
        <div className="hl-canvas-plane" style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}>
          <svg className="hl-canvas-links" aria-hidden="true">
            {links.map((l, i) => (
              <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
            ))}
          </svg>
          {clusters.map((c) => (
            <div key={c.id} className="hl-canvas-cluster" style={{ transform: `translate(${c.x}px, ${c.y}px)` }}>
              <span aria-hidden="true">{c.mark}</span> {c.label}
            </div>
          ))}
          {nodes.map((n) => (
            <button
              key={n.id}
              className="hl-canvas-node"
              style={{ transform: `translate(${n.x}px, ${n.y}px)` }}
              onClick={() => onOpen(n.id)}
            >
              {n.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
