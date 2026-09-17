import { useMemo, useState } from 'react';
import { GameArt } from '../GameArt';
import { Meta, blurb } from '../browseCommon';
import { searchLibrary } from '../../library/library';
import { HomeLayoutProps } from './types';

/** A scannable list on the left; whichever row is hovered or focused previews live on the
 *  right, so browsing is a matter of moving down the list rather than opening and backing out
 *  of one game at a time. */
export function DualPaneLayout({ games, onOpen, onPlay }: HomeLayoutProps) {
  const [q, setQ] = useState('');
  const list = useMemo(() => searchLibrary(games, q.trim() ? { query: q } : {}, 'name'), [games, q]);
  const [active, setActive] = useState<string | null>(null);
  const shown = list.find((g) => g.id === active) ?? list[0] ?? null;

  return (
    <div className="hl-dual">
      <div className="hl-dual-list-pane">
        <input
          className="hl-dual-search"
          placeholder="Filter the list…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Filter games"
        />
        <ul className="hl-dual-list">
          {list.map((g) => (
            <li key={g.id}>
              <button
                className={`hl-dual-row ${shown?.id === g.id ? 'on' : ''}`}
                onMouseEnter={() => setActive(g.id)}
                onFocus={() => setActive(g.id)}
                onClick={() => onOpen(g.id)}
              >
                <span>{g.definition.meta.name}</span>
                <span className="muted">{g.author}</span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="muted hl-dual-empty">Nothing matches “{q}”.</li>}
        </ul>
      </div>
      <div className="hl-dual-preview">
        {shown ? (
          <>
            <div className="hl-dual-art"><GameArt def={shown.definition} id={shown.id} /></div>
            <h2>{shown.definition.meta.name}</h2>
            <Meta game={shown} />
            <p>{blurb(shown.definition.meta.description, 220)}</p>
            <div className="hl-dual-actions">
              <button className="primary" onClick={() => onPlay(shown)}>Deal me in ▶</button>
              <button className="ghost" onClick={() => onOpen(shown.id)}>Full details</button>
            </div>
          </>
        ) : (
          <p className="muted">Nothing to preview.</p>
        )}
      </div>
    </div>
  );
}
