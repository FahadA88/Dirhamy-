import { useState } from 'react';
import { GameArt } from '../GameArt';
import { Meta, blurb } from '../browseCommon';
import { HomeLayoutProps } from './types';
import { useKindGroups } from './shared';

/** Kinds expand into games the way a folder expands into files. Selecting one previews it on
 *  the right; the preview's own buttons are what actually play or open it. */
export function DocTreeLayout({ games, onOpen, onPlay }: HomeLayoutProps) {
  const kinds = useKindGroups(games);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(kinds.slice(0, 1).map((k) => k.id)));
  const [selected, setSelected] = useState<string | null>(null);
  const shown = games.find((g) => g.id === selected) ?? null;

  function toggle(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="hl-doctree">
      <nav className="hl-doctree-tree" aria-label="Games by kind">
        <ul>
          {kinds.map((k) => (
            <li key={k.id}>
              <button className="hl-doctree-folder" aria-expanded={expanded.has(k.id)} onClick={() => toggle(k.id)}>
                <span aria-hidden="true">{expanded.has(k.id) ? '▾' : '▸'}</span>
                <span aria-hidden="true">{k.mark}</span>
                {k.label}
                <span className="muted">{k.games.length}</span>
              </button>
              {expanded.has(k.id) && (
                <ul className="hl-doctree-files">
                  {k.games.map((g) => (
                    <li key={g.id}>
                      <button
                        className={`hl-doctree-file ${selected === g.id ? 'on' : ''}`}
                        aria-current={selected === g.id}
                        onClick={() => setSelected(g.id)}
                      >
                        {g.definition.meta.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <div className="hl-doctree-preview">
        {shown ? (
          <>
            <div className="hl-doctree-art"><GameArt def={shown.definition} id={shown.id} /></div>
            <h2>{shown.definition.meta.name}</h2>
            <Meta game={shown} />
            <p>{blurb(shown.definition.meta.description, 220)}</p>
            <div className="hl-doctree-actions">
              <button className="primary" onClick={() => onPlay(shown)}>Deal me in ▶</button>
              <button className="ghost" onClick={() => onOpen(shown.id)}>Full details</button>
            </div>
          </>
        ) : (
          <p className="muted">Expand a kind on the left and pick a game to preview it here.</p>
        )}
      </div>
    </div>
  );
}
