import { useMemo, useState } from 'react';
import { GameDefinition } from '../engine/types';
import {
  Collection, Filters, PublishedGame, SortKey,
  allGames, averageRating, collections, complexityOf, creator, featured, fork,
  isFavourite, isFollowing, myReview, playtimeOf, review, reviewsFor,
  searchLibrary, toggleFavourite, toggleFollow, unpublish,
} from '../library/library';
import { explainGame } from '../authoring/explain';
import {
  REPORT_REASONS, ReportReason, checkText, hasReported, isBlocked, isMuted,
  report as fileReport, toggleBlock, toggleMute,
} from '../social/safety';
import { leaderboard } from '../social/records';
import { useSettings } from '../settings/SettingsContext';
import { GameArt } from './GameArt';


// The shelf.
//
// Two things drive the shape of this screen. First, a shipped classic and a game somebody made
// this morning are the same kind of object, so they sit in the same grid and answer the same
// filters — there is no "official" section and "user-generated" ghetto. Second, filters are
// quiet: they sit in one line and stay out of the way until used, because browsing is the
// default activity here and searching is the exception.

const FAMILIES = ['shedding', 'trick', 'climb', 'fish', 'rummy', 'war', 'solitaire'] as const;

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'trending', label: 'Trending' },
  { key: 'newest', label: 'Newest' },
  { key: 'top-rated', label: 'Top rated' },
  { key: 'most-played', label: 'Most played' },
  { key: 'name', label: 'A–Z' },
];

export function BrowseView({ onPlay, onSetup, onRemix }: {
  onPlay: (def: GameDefinition) => void;
  onSetup: (def: GameDefinition) => void;
  onRemix?: (game: PublishedGame) => void;
}) {
  const { settings } = useSettings();
  const [tick, setTick] = useState(0);            // bumped whenever the shelf changes underneath
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortKey>('trending');
  const [browsing, setBrowsing] = useState(false); // false = the curated front page
  const [detail, setDetail] = useState<string | null>(null);
  const [profile, setProfile] = useState<string | null>(null);

  // A blocked creator's games are gone from every shelf, not greyed out — the point of blocking
  // is not seeing them.
  const games = useMemo(() => allGames().filter((g) => !isBlocked(g.author)), [tick]);
  const shelves = useMemo(() => collections(games), [games, tick]);
  const hero = useMemo(() => featured(games), [games]);
  const results = useMemo(() => searchLibrary(games, filters, sort), [games, filters, sort, tick]);

  const refresh = () => setTick((t) => t + 1);
  const searching = !!filters.query || !!filters.family || !!filters.players
    || !!filters.favouritesOnly || !!filters.maxComplexity;

  const shown = browsing || searching;

  if (detail) {
    const game = games.find((g) => g.id === detail);
    if (game) {
      return (
        <GameDetail
          game={game} me={settings.playerName}
          onBack={() => setDetail(null)}
          onPlay={() => { onPlay(game.definition); }}
          onSetup={() => { onSetup(game.definition); }}
          onChanged={refresh}
          onProfile={(a) => { setDetail(null); setProfile(a); }}
          onRemix={onRemix}
        />
      );
    }
  }

  if (profile) {
    return (
      <CreatorProfile
        name={profile} games={games}
        onBack={() => setProfile(null)}
        onOpen={(id) => { setProfile(null); setDetail(id); }}
        onChanged={refresh}
      />
    );
  }

  return (
    <div className="browse">
      <div className="filterbar">
        <input
          className="searchbox"
          placeholder="Search games, creators, tags…"
          value={filters.query ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
          aria-label="Search games"
        />
        <div className="filter-chips">
          <select value={filters.family ?? ''} aria-label="Kind of game"
            onChange={(e) => setFilters((f) => ({ ...f, family: e.target.value || undefined }))}>
            <option value="">Any kind</option>
            {FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={filters.players ?? ''} aria-label="Number of players"
            onChange={(e) => setFilters((f) => ({ ...f, players: e.target.value ? +e.target.value : undefined }))}>
            <option value="">Any players</option>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} player{n === 1 ? '' : 's'}</option>)}
          </select>
          <select value={filters.maxComplexity ?? ''} aria-label="Complexity"
            onChange={(e) => setFilters((f) => ({ ...f, maxComplexity: e.target.value ? +e.target.value : undefined }))}>
            <option value="">Any weight</option>
            <option value="1">Very simple</option>
            <option value="2">Simple</option>
            <option value="3">Middling</option>
            <option value="4">Meaty</option>
          </select>
          <button className={`chip ${filters.favouritesOnly ? 'on' : ''}`}
            onClick={() => setFilters((f) => ({ ...f, favouritesOnly: !f.favouritesOnly }))}>
            ♥ Favourites
          </button>
          {shown && (
            <select value={sort} aria-label="Sort by" onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          )}
          <button className="chip" onClick={() => { setBrowsing(!browsing); setFilters({}); }}>
            {shown ? '← Front page' : 'Browse all'}
          </button>
        </div>
      </div>

      {!shown ? (
        <>
          {hero && (
            <button className="hero" onClick={() => setDetail(hero.id)}>
              <div className="hero-body">
                <span className="hero-kicker">Tonight's table</span>
                <h2>{hero.definition.meta.name}</h2>
                <Meta game={hero} />
                <span className="hero-cta">Deal me in ▶</span>
              </div>
              <div className="hero-art">
                <GameArt def={hero.definition} id={hero.id} />
              </div>
            </button>
          )}

          {shelves.map((c) => (
            <Shelf key={c.id} collection={c} onOpen={setDetail} onPlay={(g) => onPlay(g.definition)} onChanged={refresh} />
          ))}
        </>
      ) : results.length === 0 ? (
        <div className="empty-shelf">
          <div className="empty-mark">🂠</div>
          <h3>{filters.favouritesOnly ? 'No favourites yet' : 'Nothing here'}</h3>
          <p>{filters.favouritesOnly ? 'Tap ♥ on any game.' : 'Try fewer filters.'}</p>
          <button className="ghost" onClick={() => setFilters({})}>Clear</button>
        </div>
      ) : (
        <>
          <div className="section-head">
            <h2>{results.length} game{results.length === 1 ? '' : 's'}</h2>
          </div>
          <div className="shelf-grid">
            {results.map((g) => (
              <ShelfCard key={g.id} game={g} onOpen={() => setDetail(g.id)} onPlay={() => onPlay(g.definition)} onChanged={refresh} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- shelves ----------

function Shelf({ collection, onOpen, onPlay, onChanged }: {
  collection: Collection;
  onOpen: (id: string) => void;
  onPlay: (g: PublishedGame) => void;
  onChanged: () => void;
}) {
  return (
    <section className="shelf">
      <div className="section-head">
        <h2>{collection.title}</h2>
      </div>
      <div className="shelf-rail">
        {collection.games.map((g) => (
          <ShelfCard key={g.id} game={g} onOpen={() => onOpen(g.id)} onPlay={() => onPlay(g)} onChanged={onChanged} />
        ))}
      </div>
    </section>
  );
}

function ShelfCard({ game, onOpen, onPlay, onChanged }: {
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
      </button>
      <button className={`star ${fav ? 'on' : ''}`} aria-pressed={fav}
        aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
        onClick={() => { toggleFavourite(game.id); onChanged(); }}>♥</button>
      <button className="sc-play" onClick={onPlay} aria-label={`Play ${def.meta.name}`}>▶</button>
    </div>
  );
}

function Meta({ game }: { game: PublishedGame }) {
  const def = game.definition;
  const rating = averageRating(game.stats);
  const p = def.meta.players;
  const weight = complexityOf(def);
  return (
    <div className="sc-meta">
      <span title="Players">♟ {p.min === p.max ? p.min : `${p.min}–${p.max}`}</span>
      <span title="Typical length">◷ {playtimeOf(def)}m</span>
      <span title={`Weight ${weight} of 5`} className="sc-weight">
        {'▮'.repeat(weight)}<i>{'▮'.repeat(5 - weight)}</i>
      </span>
      {rating !== null && <span className="sc-rating" title="Rating">★ {rating.toFixed(1)}</span>}
    </div>
  );
}

// ---------- detail ----------

function GameDetail({ game, me, onBack, onPlay, onSetup, onChanged, onProfile, onRemix }: {
  game: PublishedGame;
  me: string;
  onBack: () => void;
  onPlay: () => void;
  onSetup: () => void;
  onChanged: () => void;
  onProfile: (author: string) => void;
  onRemix?: (g: PublishedGame) => void;
}) {
  const mine = myReview(game.id, me);
  const [stars, setStars] = useState(mine?.rating ?? 0);
  const [text, setText] = useState(mine?.text ?? '');
  const [saved, setSaved] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason>('broken');
  const [note, setNote] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const reviews = reviewsFor(game.id).filter((r) => !isMuted(r.author));
  const board = leaderboard(game.id).slice(0, 5);
  const fav = isFavourite(game.id);
  const rating = averageRating(game.stats);

  function submit() {
    if (stars < 1) return;
    const screen = checkText(text);
    if (!screen.ok) { setTextError(screen.reason ?? 'That review cannot be posted.'); return; }
    setTextError(null);
    review(game.id, me, stars, text);
    setSaved(true);
    onChanged();
  }

  return (
    <div className="gamedetail">
      <div className="crumbs">
        <button className="ghost" onClick={onBack}>← Browse</button>
        <span className="crumb-title">{game.definition.meta.name}</span>
      </div>

      <div className="gd-grid">
        <div className="panel glass">
          <div className="gd-head">
            <div>
              <h2>{game.definition.meta.name}</h2>
              <p className="gd-by">
                by <button className="linkish" onClick={() => onProfile(game.author)}>{game.author}</button>
                {game.forkedFrom && <span className="muted"> · remixed from {game.forkedFrom}</span>}
              </p>
            </div>
            <button className={`star big ${fav ? 'on' : ''}`} aria-pressed={fav}
              aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
              onClick={() => { toggleFavourite(game.id); onChanged(); }}>★</button>
          </div>

          <Meta game={game} />
          <p className="gd-desc">{game.definition.meta.description}</p>

          <div className="gd-tags">
            {game.tags.map((t) => <span key={t} className="tag">{t}</span>)}
          </div>

          <div className="gd-actions">
            <button className="primary" onClick={onPlay}>Play solo</button>
            {!game.definition.solitaire && <button className="ghost" onClick={onSetup}>Set up a table</button>}
            {onRemix && (
              <button className="ghost" onClick={() => { const f = fork(game.id, me); onChanged(); if (f) onRemix(f); }}>
                Remix it
              </button>
            )}
            {!game.builtIn && (
              <button className="ghost danger" onClick={() => { unpublish(game.id); onChanged(); onBack(); }}>
                Unpublish
              </button>
            )}
          </div>

          {!game.builtIn && (
            <div className="safety">
              {reporting ? (
                <div className="safety-form">
                  <span className="mini-label">What's wrong with this game?</span>
                  <select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)} aria-label="Reason">
                    {REPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <input value={note} placeholder="Anything else we should know (optional)"
                    onChange={(e) => setNote(e.target.value)} />
                  <div className="proposal-actions">
                    <button className="primary sm" onClick={() => { fileReport('game', game.id, reason, note); setReporting(false); onChanged(); }}>
                      Send report
                    </button>
                    <button className="ghost sm" onClick={() => setReporting(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="safety-row">
                  {hasReported(game.id)
                    ? <span className="muted">Reported. Thank you — we look at every one.</span>
                    : <button className="linkish" onClick={() => setReporting(true)}>Report this game</button>}
                  <button className="linkish" onClick={() => { toggleBlock(game.author); onChanged(); onBack(); }}>
                    Block {game.author}
                  </button>
                  <button className="linkish" onClick={() => { toggleMute(game.author); onChanged(); }}>
                    {isMuted(game.author) ? 'Unmute' : 'Mute'} their reviews
                  </button>
                </div>
              )}
            </div>
          )}

          <h3 className="gd-sub">How it plays</h3>
          <ul className="explain-list">
            {explainGame(game.definition).map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </div>

        <div className="panel glass">
          <h3 className="gd-sub">
            Ratings {rating !== null && <span className="gd-avg">★ {rating.toFixed(1)} · {game.stats.ratingCount}</span>}
          </h3>

          <div className="rate-row">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={`star ${stars >= n ? 'on' : ''}`}
                aria-label={`${n} star${n === 1 ? '' : 's'}`}
                onClick={() => { setStars(n); setSaved(false); }}>★</button>
            ))}
          </div>
          <textarea className="review-box" rows={3} placeholder="What did you think?"
            value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }} />
          <div className="proposal-actions">
            <button className="primary sm" onClick={submit} disabled={stars < 1}>
              {mine ? 'Update review' : 'Post review'}
            </button>
            {saved && <span className="muted">Saved.</span>}
          </div>
          {textError && <div className="issue error">{textError}</div>}

          {board.length > 0 && (
            <>
              <h3 className="gd-sub">Leaderboard</h3>
              <ol className="leaderboard">
                {board.map((row, i) => (
                  <li key={row.name}>
                    <span className="lb-rank">{i + 1}</span>
                    <span className="lb-name">{row.name}</span>
                    <span className="lb-stat">{Math.round(row.winRate * 100)}% of {row.played}</span>
                  </li>
                ))}
              </ol>
            </>
          )}

          <ul className="reviewlist">
            {reviews.length === 0 && <li className="muted">No reviews yet. Yours would be the first.</li>}
            {reviews.map((r) => (
              <li key={`${r.author}-${r.at}`}>
                <div className="rv-head">
                  <b>{r.author}</b>
                  <span className="rv-stars">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                </div>
                {r.text && <p>{r.text}</p>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---------- creator ----------

function CreatorProfile({ name, games, onBack, onOpen, onChanged }: {
  name: string;
  games: PublishedGame[];
  onBack: () => void;
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const c = creator(name, games);
  const following = isFollowing(name);
  return (
    <div className="creator">
      <div className="crumbs">
        <button className="ghost" onClick={onBack}>← Browse</button>
        <span className="crumb-title">{name}</span>
      </div>
      <div className="panel glass">
        <div className="gd-head">
          <div>
            <h2>{name}</h2>
            <p className="muted">
              {c.games.length} game{c.games.length === 1 ? '' : 's'} · {c.plays} plays
              {c.rating !== null ? ` · ★ ${c.rating.toFixed(1)} average` : ''}
            </p>
          </div>
          <button className={`chip ${following ? 'on' : ''}`}
            onClick={() => { toggleFollow(name); onChanged(); }}>
            {following ? 'Following' : 'Follow'}
          </button>
        </div>
        <div className="shelf-grid">
          {c.games.map((g) => (
            <ShelfCard key={g.id} game={g} onOpen={() => onOpen(g.id)} onPlay={() => onOpen(g.id)} onChanged={onChanged} />
          ))}
        </div>
      </div>
    </div>
  );
}
