import { useState } from 'react';
import { EmptyDeckMark, ShelfCard } from '../browseCommon';
import { HomeLayoutProps } from './types';
import { useKindGroups } from './shared';

/** A tall header that opens into a full menu of kinds, rather than a permanent scroll section
 *  under it — the browse-by-kind moment is one press away instead of always on screen. */
export function MegaHeaderLayout({ games, onOpen, onPlay, onChanged }: HomeLayoutProps) {
  const kinds = useKindGroups(games);
  const [kind, setKind] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const shown = kind ? (kinds.find((k) => k.id === kind)?.games ?? []) : games;
  const activeLabel = kind ? kinds.find((k) => k.id === kind)?.label : 'Everything';

  return (
    <div className="hl-megaheader">
      <header className="hl-megaheader-bar">
        <h1>The shelf</h1>
        <p>{games.length} games, sorted the way you like them.</p>
        <button className="chip hl-megaheader-toggle" aria-expanded={menuOpen} aria-controls="hl-megaheader-menu"
          onClick={() => setMenuOpen((v) => !v)}>
          Browse by kind — {activeLabel} <span aria-hidden="true">{menuOpen ? '▴' : '▾'}</span>
        </button>
      </header>

      {menuOpen && (
        <div className="hl-megaheader-menu" id="hl-megaheader-menu">
          <button className={`hl-megaheader-tile ${kind === '' ? 'on' : ''}`} onClick={() => { setKind(''); setMenuOpen(false); }}>
            <span aria-hidden="true">🂠</span>
            <em>Everything</em>
            <span className="muted">{games.length}</span>
          </button>
          {kinds.map((k) => (
            <button key={k.id} className={`hl-megaheader-tile ${kind === k.id ? 'on' : ''}`}
              onClick={() => { setKind(k.id); setMenuOpen(false); }}>
              <span aria-hidden="true">{k.mark}</span>
              <em>{k.label}</em>
              <span className="muted">{k.games.length}</span>
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty-shelf">
          <EmptyDeckMark />
          <h3>Nothing of that kind yet</h3>
        </div>
      ) : (
        <div className="shelf-grid">
          {shown.map((g) => (
            <ShelfCard key={g.id} game={g} onOpen={() => onOpen(g.id)} onPlay={() => onPlay(g)} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  );
}
