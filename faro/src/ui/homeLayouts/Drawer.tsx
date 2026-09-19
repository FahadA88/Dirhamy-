import { useState } from 'react';
import { EmptyDeckMark, ShelfCard } from '../browseCommon';
import { useDismissable } from '../useEscape';
import { HomeLayoutProps } from './types';
import { useKindGroups } from './shared';

/** The kind filter lives in a drawer that only shows up when asked for, so the shelf gets the
 *  full width by default instead of giving a permanent row over to a filter most visits don't
 *  touch. */
export function DrawerLayout({ games, onOpen, onPlay, onChanged }: HomeLayoutProps) {
  const kinds = useKindGroups(games);
  const [kind, setKind] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useDismissable(open, () => setOpen(false));
  const shown = kind ? (kinds.find((k) => k.id === kind)?.games ?? []) : games;
  const activeLabel = kind ? kinds.find((k) => k.id === kind)?.label : 'Everything';

  return (
    <div className="hl-drawer-wrap">
      <div className="hl-drawer-toolbar">
        <button className="chip" onClick={() => setOpen(true)}>
          ☰ {activeLabel} <span aria-hidden="true">▾</span>
        </button>
        <span className="muted">{shown.length} game{shown.length === 1 ? '' : 's'}</span>
      </div>

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

      {open && (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
        <div className="hl-drawer-scrim" onClick={() => setOpen(false)}>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
          <div className="hl-drawer" ref={ref} role="dialog" aria-modal="true" aria-label="Kind of game"
            onClick={(e) => e.stopPropagation()}>
            <header className="hl-drawer-head">
              <h3>Browse by kind</h3>
              <button className="ghost sm" onClick={() => setOpen(false)}>Close</button>
            </header>
            <ul className="hl-drawer-list">
              <li>
                <button className={kind === '' ? 'on' : ''} onClick={() => { setKind(''); setOpen(false); }}>
                  🂠 Everything <span className="muted">{games.length}</span>
                </button>
              </li>
              {kinds.map((k) => (
                <li key={k.id}>
                  <button className={kind === k.id ? 'on' : ''} onClick={() => { setKind(k.id); setOpen(false); }}>
                    <span aria-hidden="true">{k.mark}</span> {k.label} <span className="muted">{k.games.length}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
