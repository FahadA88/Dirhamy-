import { useMemo, useRef, useState } from 'react';
import { Meta } from '../browseCommon';
import { searchLibrary } from '../../library/library';
import { HomeLayoutProps } from './types';

/** The search box IS the browser. Typing filters the real library live; the arrow keys move a
 *  highlight through the real results; Enter opens whichever one is lit. */
export function CommandPaletteLayout({ games, onOpen, onPlay }: HomeLayoutProps) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(
    () => (q.trim() ? searchLibrary(games, { query: q }, 'trending') : searchLibrary(games, {}, 'trending')).slice(0, 12),
    [games, q],
  );
  const at = results.length === 0 ? -1 : ((hi % results.length) + results.length) % results.length;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => h + 1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => h - 1); }
    if (e.key === 'Enter' && at >= 0) { e.preventDefault(); onOpen(results[at].id); }
    if (e.key === 'Escape') { setQ(''); inputRef.current?.focus(); }
  }

  return (
    <div className="hl-command">
      <div className="hl-command-box">
        <span className="hl-command-glyph" aria-hidden="true">⌘K</span>
        <input
          ref={inputRef}
          className="hl-command-input"
          placeholder="Search games, creators, tags — Enter opens the top match…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setHi(0); }}
          onKeyDown={onKeyDown}
          aria-label="Search the library"
          aria-activedescendant={at >= 0 ? `hl-command-${results[at].id}` : undefined}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="hl-command-listbox"
          autoComplete="off"
        />
      </div>
      <ul className="hl-command-results" id="hl-command-listbox" role="listbox" aria-label="Matching games">
        {results.length === 0 && <li className="muted hl-command-empty">Nothing matches “{q}”.</li>}
        {results.map((g, i) => (
          <li key={g.id} role="option" id={`hl-command-${g.id}`} aria-selected={i === at}>
            <button
              className={`hl-command-row ${i === at ? 'on' : ''}`}
              onMouseEnter={() => setHi(i)}
              onClick={() => onOpen(g.id)}
            >
              <span className="hl-command-name">{g.definition.meta.name}</span>
              <Meta game={g} />
            </button>
            <button className="ghost sm hl-command-play" onClick={() => onPlay(g)} aria-label={`Play ${g.definition.meta.name}`}>▶</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
