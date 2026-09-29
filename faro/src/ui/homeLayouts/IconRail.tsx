import { useState } from 'react';
import { EmptyDeckMark, ShelfCard } from '../browseCommon';
import { HomeLayoutProps } from './types';
import { useKindGroups } from './shared';

/** `KindTabs`, turned into a narrow rail of icons with a tooltip standing in for the label —
 *  the same filter, in the width of a scrollbar rather than a whole row. */
export function IconRailLayout({ games, onOpen, onPlay, onChanged }: HomeLayoutProps) {
  const kinds = useKindGroups(games);
  const [kind, setKind] = useState('');
  const shown = kind ? (kinds.find((k) => k.id === kind)?.games ?? []) : games;

  return (
    <div className="hl-iconrail">
      <div className="hl-iconrail-rail" aria-label="Kind of game" role="tablist" aria-orientation="vertical">
        <button
          className={`hl-iconrail-btn ${kind === '' ? 'on' : ''}`}
          role="tab" aria-selected={kind === ''} title="Everything"
          onClick={() => setKind('')}
        >
          <span aria-hidden="true">🂠</span>
        </button>
        {kinds.map((k) => (
          <button
            key={k.id}
            className={`hl-iconrail-btn ${kind === k.id ? 'on' : ''}`}
            role="tab" aria-selected={kind === k.id} title={k.label}
            onClick={() => setKind(k.id)}
          >
            <span aria-hidden="true">{k.mark}</span>
          </button>
        ))}
      </div>
      <div className="hl-iconrail-content">
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
    </div>
  );
}
