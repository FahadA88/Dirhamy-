import { useEffect, useState } from 'react';
import { GameArt } from '../GameArt';
import { Meta, blurb } from '../browseCommon';
import { HomeLayoutProps } from './types';

/** One game fills the screen; arrows, dots, or the arrow keys step to the next. No auto-advance
 *  — a pager you page through yourself, not a carousel that moves on its own. */
export function PagerLayout({ games, onOpen, onPlay }: HomeLayoutProps) {
  const [i, setI] = useState(0);
  const n = games.length;
  const at = n === 0 ? 0 : ((i % n) + n) % n;
  const game = games[at];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') setI((k) => k - 1);
      if (e.key === 'ArrowRight') setI((k) => k + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!game) return <p className="muted">Nothing to page through yet.</p>;

  return (
    <div className="hl-pager" role="group" aria-roledescription="pager" aria-label="Games, one at a time">
      <button className="hl-pager-arrow left" aria-label="Previous game" onClick={() => setI((k) => k - 1)}>‹</button>
      <div className="hl-pager-slide" key={game.id}>
        <div className="hl-pager-art"><GameArt def={game.definition} id={game.id} /></div>
        <div className="hl-pager-body">
          <span className="hl-pager-count">{at + 1} of {n}</span>
          <h2>{game.definition.meta.name}</h2>
          <Meta game={game} />
          <p>{blurb(game.definition.meta.description)}</p>
          <div className="hl-pager-actions">
            <button className="primary" onClick={() => onPlay(game)}>Deal me in ▶</button>
            <button className="ghost" onClick={() => onOpen(game.id)}>How it plays</button>
          </div>
        </div>
      </div>
      <button className="hl-pager-arrow right" aria-label="Next game" onClick={() => setI((k) => k + 1)}>›</button>
      <div className="hl-pager-dots">
        {games.map((g, k) => (
          <button key={g.id} className={`hl-pager-dot ${k === at ? 'on' : ''}`}
            aria-label={g.definition.meta.name} aria-current={k === at} onClick={() => setI(k)} />
        ))}
      </div>
    </div>
  );
}
