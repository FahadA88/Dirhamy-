import { useMemo, useState } from 'react';
import { PublishedGame } from '../../library/library';
import { HomeLayoutProps } from './types';
import { KindGroup, useKindGroups } from './shared';

interface Spoke { id: string; label: string; mark?: string; game?: PublishedGame }

function Wheel({ spokes, radius, onPick, center }: {
  spokes: Spoke[];
  radius: number;
  onPick: (s: Spoke) => void;
  center: React.ReactNode;
}) {
  const n = Math.max(1, spokes.length);
  return (
    <div className="hl-radial-wheel">
      <div className="hl-radial-hub">{center}</div>
      {spokes.map((s, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        return (
          <button
            key={s.id}
            className="hl-radial-spoke"
            style={{ transform: `translate(${x}px, ${y}px)` }}
            onClick={() => onPick(s)}
            title={s.label}
          >
            {s.mark && <span className="hl-radial-mark" aria-hidden="true">{s.mark}</span>}
            <span className="hl-radial-label">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A hub of kinds, spun out into a hub of games once you pick one — tapping a spoke either
 *  drills in or, at the game ring, opens the real detail page. */
export function RadialLayout({ games, onOpen }: HomeLayoutProps) {
  const kinds = useKindGroups(games);
  const [active, setActive] = useState<KindGroup | null>(null);

  const spokes: Spoke[] = useMemo(() => {
    if (!active) return kinds.map((k) => ({ id: k.id, label: k.label, mark: k.mark }));
    return active.games.map((g) => ({ id: g.id, label: g.definition.meta.name, game: g }));
  }, [active, kinds]);

  return (
    <div className="hl-radial">
      <div className="hl-radial-stage">
        <Wheel
          spokes={spokes}
          radius={active ? Math.min(200, 96 + spokes.length * 10) : 170}
          onPick={(s) => (s.game ? onOpen(s.game.id) : setActive(kinds.find((k) => k.id === s.id) ?? null))}
          center={
            active ? (
              <button className="hl-radial-back" onClick={() => setActive(null)}>
                <span aria-hidden="true">←</span>
                <em>{active.label}</em>
              </button>
            ) : (
              <span className="hl-radial-hub-label">Pick a kind</span>
            )
          }
        />
      </div>
      <p className="hl-radial-hint muted">
        {active ? `${active.games.length} game${active.games.length === 1 ? '' : 's'} — pick one to open it.` : 'Pick a kind, then a game.'}
      </p>
    </div>
  );
}
