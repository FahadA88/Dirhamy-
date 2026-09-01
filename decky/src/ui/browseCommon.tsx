import { PublishedGame } from '../library/library';
import { averageRating, complexityOf, isFavourite, kindLabel, playtimeOf, toggleFavourite } from '../library/library';
import { GameArt } from './GameArt';

// Bits the shelf-and-carousel front page and the sixteen alternate home layouts both need:
// the same card, the same meta line, the same empty state. Kept in one place so every layout
// reads a game's rating, weight and playtime the same way rather than each re-deriving it.

/**
 * As much of a description as fits, ending on a full stop.
 *
 * The banner clamps to three lines, which cut Hearts off at "Whoever holds t…" — a sentence
 * chopped mid-word reads like the page failed to load rather than like a summary. Take whole
 * sentences up to roughly a banner's worth and stop there.
 */
export function blurb(text: string, limit = 165): string {
  const sentences = text.split(/(?<=\.)\s+/);
  let out = '';
  for (const sentence of sentences) {
    if (out && (out + ' ' + sentence).length > limit) break;
    out = out ? `${out} ${sentence}` : sentence;
  }
  return out || text.slice(0, limit);
}

/** A shelf with nothing on it, drawn rather than typed — two empty card outlines fanned the way
 *  a real hand would be, so "nothing here" reads as a place rather than a glyph off the font. */
export function EmptyDeckMark() {
  return (
    <svg className="empty-mark" width="56" height="56" viewBox="0 0 56 56" fill="none"
      stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="10" y="12" width="24" height="34" rx="3" transform="rotate(-8 22 29)" />
      <rect x="22" y="10" width="24" height="34" rx="3" transform="rotate(8 34 27)" />
    </svg>
  );
}

/** Nobody you follow has shown up here yet — two figures rather than one, since "follow someone"
 *  is the whole ask, drawn in the same currentColor line-art as the empty shelf above. */
export function EmptyFriendsMark() {
  return (
    <svg className="empty-mark" width="56" height="56" viewBox="0 0 56 56" fill="none"
      stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="20" cy="20" r="7" />
      <path d="M8 46c0-8 5.4-13 12-13s12 5 12 13" />
      <circle cx="38" cy="24" r="6" opacity=".55" />
      <path d="M30 46c.6-6.4 4.6-10.4 10-10.4S49 40 49.6 46" opacity=".55" />
    </svg>
  );
}

/** No table has your name on it right now — an empty seat at an empty table, rather than the
 *  full hand the shelf's own mark draws. */
export function EmptyMatchesMark() {
  return (
    <svg className="empty-mark" width="56" height="56" viewBox="0 0 56 56" fill="none"
      stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <ellipse cx="28" cy="30" rx="21" ry="13" />
      <path d="M28 17v-6M18 44l-3 6M38 44l3 6" strokeLinecap="round" />
    </svg>
  );
}

export function Meta({ game }: { game: PublishedGame }) {
  const def = game.definition;
  const rating = averageRating(game.stats);
  const p = def.meta.players;
  const weight = complexityOf(def);
  return (
    <div className="sc-meta">
      <span className="sc-kind" title="Kind of game">{kindLabel(def)}</span>
      <span title="Players">♟ {p.min === p.max ? p.min : `${p.min}–${p.max}`}</span>
      <span title="Typical length">◷ {playtimeOf(def)}m</span>
      <span
        title={`Complexity ${weight} of 5 — more rules to learn, not more time to play`}
        aria-label={`Complexity ${weight} of 5`}
        className="sc-weight"
      >
        ⚖ {'▮'.repeat(weight)}<i aria-hidden="true">{'▮'.repeat(5 - weight)}</i>
      </span>
      {rating !== null && <span className="sc-rating" title="Rating">★ {rating.toFixed(1)}</span>}
    </div>
  );
}

export function ShelfCard({ game, onOpen, onPlay, onChanged }: {
  game: PublishedGame; onOpen: () => void; onPlay: () => void; onChanged: () => void;
}) {
  const def = game.definition;
  const fav = isFavourite(game.id);
  return (
    <div className="shelfcard">
      <button className="sc-main" onClick={onOpen}>
        <GameArt def={def} id={game.id} />
        <div className="sc-body">
          <h3>{def.meta.name}</h3>
          <Meta game={game} />
        </div>
        {game.staffPick && <span className="pick-badge" title="Staff pick">★</span>}
        {game.aiWritten && <span className="ai-badge" title="Written from a description">✎</span>}
      </button>
      <button className={`star ${fav ? 'on' : ''}`} aria-pressed={fav}
        aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
        onClick={() => { toggleFavourite(game.id); onChanged(); }}>♥</button>
      <button className="sc-play" onClick={onPlay} aria-label={`Play ${def.meta.name}`}>▶</button>
    </div>
  );
}
