import { useMemo } from 'react';
import { GameArt } from '../GameArt';
import { Meta, ShelfCard, blurb } from '../browseCommon';
import { averageRating, favourites } from '../../library/library';
import { HomeLayoutProps } from './types';

/** One big featured tile, a scatter of small real-number tiles around it, and the ordinary
 *  grid filling out the rest — mixed sizes doing the work a hierarchy of headings usually does. */
export function BentoLayout({ games, shelves, spotlight, onOpen, onPlay, onChanged }: HomeLayoutProps) {
  const feature = shelves.find((c) => c.id === 'continue')?.games[0] ?? spotlight[0] ?? games[0];
  const rest = games.filter((g) => g.id !== feature?.id);

  const stats = useMemo(() => {
    const plays = games.reduce((t, g) => t + g.stats.plays, 0);
    const rated = games.map((g) => averageRating(g.stats)).filter((r): r is number => r !== null);
    const avg = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;
    return {
      total: games.length,
      plays,
      staffPicks: games.filter((g) => g.staffPick).length,
      favourites: favourites().length,
      avg,
    };
  }, [games]);

  if (!feature) return <p className="muted">Nothing on the shelf yet.</p>;

  return (
    <div className="hl-bento">
      <article className="hl-bento-feature">
        <div className="hl-bento-feature-art"><GameArt def={feature.definition} id={feature.id} /></div>
        <div className="hl-bento-feature-body">
          <span className="hl-bento-kicker">
            {shelves.find((c) => c.id === 'continue')?.games[0]?.id === feature.id ? 'Pick up where you left off' : 'Featured'}
          </span>
          <h2><button className="linkish" onClick={() => onOpen(feature.id)}>{feature.definition.meta.name}</button></h2>
          <p>{blurb(feature.definition.meta.description, 160)}</p>
          <Meta game={feature} />
          <button className="primary" onClick={() => onPlay(feature)}>Deal me in ▶</button>
        </div>
      </article>

      <div className="hl-bento-stat">
        <span className="hl-bento-stat-n">{stats.total}</span>
        <span className="hl-bento-stat-l">games on the shelf</span>
      </div>
      <div className="hl-bento-stat">
        <span className="hl-bento-stat-n">{stats.plays}</span>
        <span className="hl-bento-stat-l">hands dealt here</span>
      </div>
      <div className="hl-bento-stat">
        <span className="hl-bento-stat-n">{stats.staffPicks}</span>
        <span className="hl-bento-stat-l">staff picks</span>
      </div>
      <div className="hl-bento-stat">
        <span className="hl-bento-stat-n">{stats.avg !== null ? stats.avg.toFixed(1) : '—'}</span>
        <span className="hl-bento-stat-l">average rating</span>
      </div>

      <div className="hl-bento-grid">
        {rest.map((g) => (
          <ShelfCard key={g.id} game={g} onOpen={() => onOpen(g.id)} onPlay={() => onPlay(g)} onChanged={onChanged} />
        ))}
      </div>
    </div>
  );
}
