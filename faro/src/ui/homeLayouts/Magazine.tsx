import { GameArt } from '../GameArt';
import { Meta, blurb } from '../browseCommon';
import { HomeLayoutProps } from './types';

/** A cover story for one staff pick, everything else set as a reading list under it — text
 *  first, tiles second. */
export function MagazineLayout({ games, spotlight, onOpen, onPlay }: HomeLayoutProps) {
  const cover = spotlight[0] ?? games[0];
  const rest = games.filter((g) => g.id !== cover?.id);

  if (!cover) return <p className="muted">Nothing on the shelf yet.</p>;

  return (
    <div className="hl-magazine">
      <article className="hl-magazine-cover">
        <div className="hl-magazine-art"><GameArt def={cover.definition} id={cover.id} /></div>
        <div className="hl-magazine-story">
          <span className="hl-magazine-kicker">This week's deal</span>
          <h2 className="hl-magazine-headline">
            <button className="linkish" onClick={() => onOpen(cover.id)}>{cover.definition.meta.name}</button>
          </h2>
          <p className="hl-magazine-dek">{blurb(cover.definition.meta.description, 220)}</p>
          <Meta game={cover} />
          <div className="hl-magazine-actions">
            <button className="primary" onClick={() => onPlay(cover)}>Deal me in ▶</button>
            <button className="ghost" onClick={() => onOpen(cover.id)}>Read on</button>
          </div>
        </div>
      </article>

      <h3 className="hl-magazine-listhead">In this issue</h3>
      <ol className="hl-magazine-list">
        {rest.map((g, i) => (
          <li key={g.id} className="hl-magazine-row">
            <span className="hl-magazine-num">{String(i + 1).padStart(2, '0')}</span>
            <div className="hl-magazine-row-body">
              <h4><button className="linkish" onClick={() => onOpen(g.id)}>{g.definition.meta.name}</button></h4>
              <p>{blurb(g.definition.meta.description, 110)}</p>
            </div>
            <button className="ghost sm" onClick={() => onPlay(g)}>Play</button>
          </li>
        ))}
      </ol>
    </div>
  );
}
