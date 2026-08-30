import { useMemo } from 'react';
import { GameArt } from '../GameArt';
import { blurb } from '../browseCommon';
import { PublishedGame } from '../../library/library';
import { HomeLayoutProps } from './types';
import { timeAgo } from './shared';

interface FeedItem {
  key: string;
  game: PublishedGame;
  kicker: string;
  at?: number;
}

/** A chronological read of the same shelf: what you left off on, what the staff likes, and
 *  what actually changed recently — no fabricated "friend activity", only real timestamps and
 *  real flags the library already tracks. */
export function FeedLayout({ games, shelves, onOpen, onPlay }: HomeLayoutProps) {
  const items = useMemo(() => {
    const out: FeedItem[] = [];
    const continueShelf = shelves.find((c) => c.id === 'continue');
    for (const g of continueShelf?.games ?? []) {
      out.push({ key: `continue-${g.id}`, game: g, kicker: 'Picking back up' });
    }
    const recent = games.filter((g) => !g.builtIn).sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
    for (const g of recent) out.push({ key: `new-${g.id}`, game: g, kicker: 'New on the shelf', at: g.createdAt });
    const updated = games
      .filter((g) => !g.builtIn && g.updatedAt !== g.createdAt)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 6);
    for (const g of updated) out.push({ key: `updated-${g.id}`, game: g, kicker: g.forkedFrom ? 'Remixed' : 'Updated', at: g.updatedAt });
    const staff = shelves.find((c) => c.id === 'staff');
    for (const g of staff?.games ?? []) out.push({ key: `staff-${g.id}`, game: g, kicker: 'Staff pick' });
    return out.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  }, [games, shelves]);

  if (items.length === 0) {
    return <p className="muted hl-feed-empty">Nothing to show yet — play or publish something and it'll show up here.</p>;
  }

  return (
    <ol className="hl-feed">
      {items.map((it) => (
        <li key={it.key} className="hl-feed-item">
          <div className="hl-feed-art"><GameArt def={it.game.definition} id={it.game.id} /></div>
          <div className="hl-feed-body">
            <span className="hl-feed-kicker">
              {it.kicker}{it.at ? ` · ${timeAgo(it.at)}` : ''}
            </span>
            <h3><button className="linkish" onClick={() => onOpen(it.game.id)}>{it.game.definition.meta.name}</button></h3>
            <p>{blurb(it.game.definition.meta.description, 130)}</p>
            <div className="hl-feed-actions">
              <button className="primary sm" onClick={() => onPlay(it.game)}>Deal me in ▶</button>
              <button className="ghost sm" onClick={() => onOpen(it.game.id)}>How it plays</button>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
