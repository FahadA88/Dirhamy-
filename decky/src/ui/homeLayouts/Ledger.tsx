import { useMemo } from 'react';
import { averageRating, complexityOf, kindLabel, playtimeOf } from '../../library/library';
import { HomeLayoutProps } from './types';

/** No tiles, no art — a dense, columned list built to scan a lot of names fast. Grouped by
 *  kind, sorted by name within each, with a hairline under every row. */
export function LedgerLayout({ games, onOpen, onPlay }: HomeLayoutProps) {
  const groups = useMemo(() => {
    const byKind = new Map<string, typeof games>();
    for (const g of games) {
      const label = kindLabel(g.definition);
      const list = byKind.get(label);
      if (list) list.push(g); else byKind.set(label, [g]);
    }
    return [...byKind.entries()]
      .map(([label, list]) => [label, list.slice().sort((a, b) => a.definition.meta.name.localeCompare(b.definition.meta.name))] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [games]);

  return (
    <div className="hl-ledger">
      {groups.map(([label, list]) => (
        <section key={label} className="hl-ledger-group">
          <h3 className="hl-ledger-head">{label} <span className="muted">{list.length}</span></h3>
          <ol className="hl-ledger-rows">
            {list.map((g) => {
              const rating = averageRating(g.stats);
              const p = g.definition.meta.players;
              return (
                <li key={g.id} className="hl-ledger-row">
                  <button className="hl-ledger-name" onClick={() => onOpen(g.id)}>{g.definition.meta.name}</button>
                  <span className="hl-ledger-author muted">{g.author}</span>
                  <span className="hl-ledger-cell">{p.min === p.max ? p.min : `${p.min}–${p.max}`}p</span>
                  <span className="hl-ledger-cell">{playtimeOf(g.definition)}m</span>
                  <span className="hl-ledger-cell">{'▮'.repeat(complexityOf(g.definition))}</span>
                  <span className="hl-ledger-cell">{rating !== null ? `★${rating.toFixed(1)}` : '—'}</span>
                  <button className="ghost sm hl-ledger-play" onClick={() => onPlay(g)} aria-label={`Play ${g.definition.meta.name}`}>▶</button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
