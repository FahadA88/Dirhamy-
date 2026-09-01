import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameDefinition } from '../engine/types';
import {
  Collection, Filters, KINDS, PublishedGame, SortKey,
  allGames, averageRating, collections, creator, featuredSet, follows, fork,
  isFavourite, isFollowing, kindOf, myReview, review, reviewsFor,
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
import { Confirm } from './Confirm';
import { EmptyDeckMark, EmptyFriendsMark, Meta, ShelfCard, blurb } from './browseCommon';
import { PullToRefresh } from './PullToRefresh';
import { HOME_LAYOUTS_BY_ID } from './homeLayouts';
import { onRouteChange, pushRoute, readRoute } from './route';


// The shelf.
//
// Two things drive the shape of this screen. First, a shipped classic and a game somebody made
// this morning are the same kind of object, so they sit in the same grid and answer the same
// filters — there is no "official" section and "user-generated" ghetto. Second, filters are
// quiet: they sit in one line and stay out of the way until used, because browsing is the
// default activity here and searching is the exception.
//
// The front page is three things stacked: a carousel of what to play tonight, a row of tabs
// for the kind of game you are in the mood for, and shelves under that. "See all games" drops
// the lot into one dense grid for people who would rather scan than be curated at.

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'trending', label: 'Trending' },
  { key: 'newest', label: 'Newest' },
  { key: 'top-rated', label: 'Top rated' },
  { key: 'most-played', label: 'Most played' },
  { key: 'name', label: 'A–Z' },
];

export function BrowseView({ onPlay, onSetup, onOnline, onlineHostDown, onRemix }: {
  onPlay: (def: GameDefinition) => void;
  onSetup: (def: GameDefinition) => void;
  /** Play this one with other people. Absent when no host is running. */
  onOnline?: (def: GameDefinition) => void;
  /** True once we've checked and no host answered — distinct from onOnline simply being
   *  absent while that check is still in flight, so the detail page can explain rather than
   *  silently drop the option. */
  onlineHostDown?: boolean;
  onRemix?: (game: PublishedGame) => void;
}) {
  const { settings } = useSettings();
  const [tick, setTick] = useState(0);            // bumped whenever the shelf changes underneath
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortKey>('trending');
  const [browsing, setBrowsing] = useState(false); // false = the curated front page
  // Seeded from ?g, and written back to it. That is what makes a game linkable: send someone
  // ?g=hearts and they land on Hearts rather than on the front page. Back closes the detail
  // instead of leaving the site, because opening it added a history entry.
  const [detail, setDetailState] = useState<string | null>(() => readRoute().game ?? null);
  const setDetail = useCallback((id: string | null) => {
    setDetailState(id);
    pushRoute({ view: 'play', game: id ?? undefined });
  }, []);
  useEffect(() => onRouteChange((r) => setDetailState(r.game ?? null)), []);
  const [profile, setProfile] = useState<string | null>(null);

  const [kind, setKind] = useState('');            // the tab across the top of the front page

  // Now that a game has its own address, the tab and the history entry should say which game it
  // is. Restores the site title on the way out, so the front page never inherits a game's name.
  useEffect(() => {
    const name = detail ? allGames().find((g) => g.id === detail)?.definition.meta.name : undefined;
    document.title = name ? `${name} — Decky` : 'Decky — play & build card games';
  }, [detail]);

  // A blocked creator's games are gone from every shelf, not greyed out — the point of blocking
  // is not seeing them.
  //
  // tick isn't read inside this callback — it exists to force the recompute at all. allGames()
  // reads localStorage, which is mutable state React doesn't know how to watch; tick is the
  // signal that something under it changed. Every memo below this one that also lists tick is
  // redundant rather than wrong: games itself is a fresh array on every tick bump (.filter()
  // guarantees that), so their own "games changed" dependency already propagates the same
  // invalidation. This one is the one place the counter is actually load-bearing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const games = useMemo(() => allGames().filter((g) => !isBlocked(g.author)), [tick]);
  const inKind = useMemo(
    () => (kind ? games.filter((g) => kindOf(g.definition) === kind) : games),
    [games, kind],
  );
  const shelves = useMemo(() => collections(inKind), [inKind]);
  const spotlight = useMemo(() => featuredSet(inKind, 5), [inKind]);
  const results = useMemo(() => searchLibrary(games, filters, sort), [games, filters, sort]);

  // The sixteen alternate layouts don't share the front page's kind-tab state — each is its
  // own whole home screen — so they read the shelf and the featured set off the full library.
  const shelvesAll = useMemo(() => collections(games), [games]);
  const spotlightAll = useMemo(() => featuredSet(games, 5), [games]);

  const refresh = () => setTick((t) => t + 1);
  const searching = !!filters.query || !!filters.family || !!filters.players
    || !!filters.favouritesOnly || !!filters.maxComplexity;

  const shown = browsing || searching;

  // At phone widths the five filter controls used four stacked rows, and pushed every game below
  // the fold on a site whose whole job is showing games. They fold behind one button instead —
  // nobody narrows a catalogue they have not seen yet. Above 780px the CSS shows them all again
  // and this state stops mattering.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = [filters.family, filters.players, filters.maxComplexity,
    filters.favouritesOnly || undefined].filter((v) => v !== undefined).length;

  if (detail) {
    const game = games.find((g) => g.id === detail);
    if (game) {
      return (
        <GameDetail
          game={game} me={settings.playerName}
          onBack={() => setDetail(null)}
          onPlay={() => { onPlay(game.definition); }}
          onSetup={() => { onSetup(game.definition); }}
          onOnline={onOnline ? () => { onOnline(game.definition); } : undefined}
          onlineHostDown={onlineHostDown}
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

  if (settings.homeLayout !== 'grid') {
    const Layout = HOME_LAYOUTS_BY_ID[settings.homeLayout];
    return (
      <div className="browse">
        {/* Each of these is its own chunk now — see homeLayouts/index.tsx — so the first render
            of one a session hasn't picked before waits on a fetch. Same fallback CreateView
            already uses for the same reason. */}
        <Suspense fallback={<div className="view-loading muted">Loading…</div>}>
          <Layout
            games={games}
            shelves={shelvesAll}
            spotlight={spotlightAll}
            onOpen={setDetail}
            onPlay={(g) => onPlay(g.definition)}
            onChanged={refresh}
          />
        </Suspense>
      </div>
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
        <button
          className={`chip filters-toggle ${activeFilters ? 'on' : ''}`}
          aria-expanded={filtersOpen}
          aria-controls="filter-chips"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          Filters{activeFilters ? ` · ${activeFilters}` : ''}
        </button>
        <div className="filter-chips" id="filter-chips" data-open={filtersOpen ? 'yes' : 'no'}>
          {/* Only in Browse all. The front page has the kind tabs a few rows down, which do the
              same job in one tap and show counts; two controls over one dimension left it unclear
              which of them was in charge. */}
          {shown && (
            <select value={filters.family ?? ''} aria-label="Kind of game"
              onChange={(e) => setFilters((f) => ({ ...f, family: e.target.value || undefined }))}>
              <option value="">Any kind</option>
              {KINDS.filter((k) => k.id).map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          )}
          <select value={filters.players ?? ''} aria-label="Number of players"
            onChange={(e) => setFilters((f) => ({ ...f, players: e.target.value ? +e.target.value : undefined }))}>
            <option value="">Any players</option>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} player{n === 1 ? '' : 's'}</option>)}
          </select>
          <select value={filters.maxComplexity ?? ''} aria-label="Complexity"
            onChange={(e) => setFilters((f) => ({ ...f, maxComplexity: e.target.value ? +e.target.value : undefined }))}>
            <option value="">Any complexity</option>
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

      {/* Worklist: a pull-down at the very top of the page re-reads the library — the same
          setTick() a favourite or a rating already triggers, just reached by a gesture instead
          of waiting for one of those. See PullToRefresh.tsx for why this is touch, not pointer. */}
      <PullToRefresh onRefresh={refresh}>
      {!shown ? (
        <>
          {/* The front page never said what the site was. Everything above this line was chrome
              — a nav, a deal banner, a search box — and a visitor could reach the shelves without
              ever being told that the games are refereed or that they can write their own. */}
          <p className="promise">
            <strong>{games.length} card games, dealt honestly.</strong> Play against bots or
            people — or describe a game of your own and have it built.
          </p>

          <Featured games={spotlight} onOpen={setDetail} onPlay={(g) => onPlay(g.definition)} onChanged={refresh} />

          <KindTabs value={kind} onChange={setKind} games={games} />

          {shelves.length === 0 ? (
            <div className="empty-shelf">
              <EmptyDeckMark />
              <h3>Nothing of that kind yet</h3>
              <p>Pick another tab, or build one in Create.</p>
            </div>
          ) : shelves.map((c) => (
            <Shelf key={c.id} collection={c} onOpen={setDetail} onPlay={(g) => onPlay(g.definition)} onChanged={refresh} />
          ))}

          <div className="seeall-row">
            <button className="seeall" onClick={() => { setFilters(kind ? { family: kind } : {}); setBrowsing(true); }}>
              See all {inKind.length} game{inKind.length === 1 ? '' : 's'}
              <span aria-hidden="true"> →</span>
            </button>
          </div>
        </>
      ) : results.length === 0 ? (
        <div className="empty-shelf">
          <EmptyDeckMark />
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
      </PullToRefresh>
    </div>
  );
}

// ---------- the carousel ----------

/**
 * Tonight's table, turning. The slide either side is drawn behind and to the side of the live
 * one so the thing reads as a physical stack of boards being turned through rather than a
 * banner that swaps images. It advances on its own until you touch it, then stops — nothing is
 * more annoying than a page that moves while you are reading it.
 */
/**
 * The old carousel put one game in front of you and hid the other three behind an interval and
 * a set of dots — real engagement data on carousels this shape lands on slide one and nowhere
 * else, so three of the four staff picks were effectively unpublished. Everything here is shown
 * at once instead: the top pick gets the full hero treatment, the rest sit beside it as ordinary
 * shelf cards — smaller, but every one of them one click away rather than a timed reveal.
 */
function Featured({ games, onOpen, onPlay, onChanged }: {
  games: PublishedGame[];
  onOpen: (id: string) => void;
  onPlay: (g: PublishedGame) => void;
  onChanged: () => void;
}) {
  if (games.length === 0) return null;
  const [live, ...rest] = games;

  return (
    <div className="featured">
      <div className="hero">
        <div className="hero-body">
          <span className="hero-kicker">Tonight's table</span>
          <h2><button className="hero-title" onClick={() => onOpen(live.id)}>{live.definition.meta.name}</button></h2>
          <p className="hero-blurb">{blurb(live.definition.meta.description)}</p>
          <Meta game={live} />
          <div className="hero-actions">
            <button className="hero-cta" onClick={() => onPlay(live)}>Deal me in ▶</button>
            <button className="hero-more" onClick={() => onOpen(live.id)}>How it plays</button>
          </div>
        </div>
        <div className="hero-art">
          <GameArt def={live.definition} id={live.id} />
        </div>
      </div>

      {rest.length > 0 && (
        <div className="featured-alts" role="region" aria-label="Also worth a deal">
          {rest.map((g) => (
            <ShelfCard key={g.id} game={g} onOpen={() => onOpen(g.id)} onPlay={() => onPlay(g)} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- the kind tabs ----------

/** What sort of game are you in the mood for. Kinds with nothing in them are not offered. */
/**
 * A row that is wider than its container, saying so. It fades on whichever side still has
 * something past it and offers a button to get there; cut off hard at the container edge, a
 * half-visible card or tab reads as a broken layout rather than as an invitation to scroll.
 * Used by both the shelves and the kind tabs, which have the same problem.
 */
function EdgeScroller({ className, label, children }: {
  className: string; label: string; children: React.ReactNode;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });

  const measure = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    const slack = el.scrollWidth - el.clientWidth;
    setEdge({ left: el.scrollLeft > 4, right: slack > 4 && el.scrollLeft < slack - 4 });
  }, []);

  useEffect(() => {
    measure();
    const el = rail.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, children]);

  const nudge = (dir: 1 | -1) => {
    const el = rail.current;
    if (el) el.scrollBy({ left: dir * Math.max(232, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <div className={`rail-wrap ${edge.left ? 'has-left' : ''} ${edge.right ? 'has-right' : ''}`}>
      <div className={className} ref={rail} onScroll={measure}
        role={className === 'kindtabs' ? 'tablist' : undefined}
        aria-label={className === 'kindtabs' ? label : undefined}>
        {children}
      </div>
      {edge.left && (
        <button className="rail-nudge left" onClick={() => nudge(-1)} aria-label={`Scroll ${label} back`} title="Scroll back">&lsaquo;</button>
      )}
      {edge.right && (
        <button className="rail-nudge right" onClick={() => nudge(1)} aria-label={`Scroll ${label} on`} title="Scroll on">&rsaquo;</button>
      )}
    </div>
  );
}

function KindTabs({ value, onChange, games }: {
  value: string; onChange: (k: string) => void; games: PublishedGame[];
}) {
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const g of games) { const k = kindOf(g.definition); m[k] = (m[k] ?? 0) + 1; }
    return m;
  }, [games]);
  const tabs = KINDS.filter((k) => k.id === '' || (counts[k.id] ?? 0) > 0);
  return (
    <EdgeScroller className="kindtabs" label="Kind of game">
      {tabs.map((k) => (
        <button
          key={k.id || 'all'}
          role="tab"
          aria-selected={value === k.id}
          className={`kindtab ${value === k.id ? 'on' : ''}`}
          onClick={() => onChange(k.id)}
        >
          <span className="kt-mark" aria-hidden="true">{k.mark}</span>
          <span className="kt-label">{k.label}</span>
          <span className="kt-count">{k.id ? counts[k.id] : games.length}</span>
        </button>
      ))}
    </EdgeScroller>
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
        {collection.blurb && <p className="shelf-blurb">{collection.blurb}</p>}
      </div>
      <EdgeScroller className="shelf-rail" label={collection.title}>
        {collection.games.map((g) => (
          <ShelfCard key={g.id} game={g} onOpen={() => onOpen(g.id)} onPlay={() => onPlay(g)} onChanged={onChanged} />
        ))}
      </EdgeScroller>
    </section>
  );
}

// ---------- detail ----------

function GameDetail({ game, me, onBack, onPlay, onSetup, onOnline, onlineHostDown, onChanged, onProfile, onRemix }: {
  game: PublishedGame;
  me: string;
  onBack: () => void;
  onPlay: () => void;
  onSetup: () => void;
  onOnline?: () => void;
  onlineHostDown?: boolean;
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
  // Everyone, or only the people you follow (plus yourself — a board you are not on is odd).
  const [boardScope, setBoardScope] = useState<'all' | 'friends'>('all');
  const friendNames = useMemo(() => [...follows(), me], [me]);
  const board = leaderboard(game.id, boardScope === 'friends' ? friendNames : undefined).slice(0, 5);
  const fav = isFavourite(game.id);
  const rating = averageRating(game.stats);
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false);

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
          {/* Every shelf card sells the game with a picture of it dealt; the page you land on
              when you tap that card had none, and opened on a wall of text. */}
          <div className="gd-art"><GameArt def={game.definition} id={game.id} /></div>
          <div className="gd-head">
            <div>
              <h2>{game.definition.meta.name}</h2>
              <p className="gd-by">
                by <button className="linkish" onClick={() => onProfile(game.author)}>{game.author}</button>
                {game.forkedFrom && <span className="muted"> · remixed from {game.forkedFrom}</span>}
              </p>
              {/* Where the game came from, in its own words. A player is entitled to know a
                  game was written from a sentence rather than assembled by hand. */}
              {game.aiWritten && (
                <p className="gd-written">
                  <span className="ai-badge" aria-hidden="true">✎</span>
                  Written from a description
                  {game.prompt && <em>“{game.prompt}”</em>}
                </p>
              )}
            </div>
            {/* Favouriting and rating are two different things on the same screen — a ★ here,
                right above the actual ★-rating control below, made them look like one control. */}
            <button className={`star big ${fav ? 'on' : ''}`} aria-pressed={fav}
              aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
              title={fav ? 'Remove from favourites' : 'Add to favourites'}
              onClick={() => { toggleFavourite(game.id); onChanged(); }}>♥</button>
          </div>

          <Meta game={game} />
          <p className="gd-desc">{game.definition.meta.description}</p>

          <div className="gd-tags">
            {game.tags.map((t) => <span key={t} className="tag">{t}</span>)}
          </div>

          <div className="gd-actions">
            {/* Same action, same words, as the front-page hero's CTA for the identical thing —
                "Play solo" here and "Deal me in ▶" there used to name the same button two ways. */}
            <button className="primary" onClick={onPlay}>Deal me in ▶</button>
            {!game.definition.solitaire && <button className="ghost" onClick={onSetup}>Set up a table</button>}
            {!game.definition.solitaire && onOnline && (
              <button className="ghost" onClick={onOnline}>Play with people</button>
            )}
            {!game.definition.solitaire && !onOnline && onlineHostDown && (
              /*
                This used to say "Play with people — needs a host running" with the actual
                instruction hidden in a hover tooltip nobody was going to find. That is a dead
                end for the person it is talking to: `npm run host` means nothing without a
                terminal, and most people looking at this button do not have one open. "Set up a
                table" sits right next to this and plays with other people on THIS device right
                now, which is the answer for the person who came here to do that — so this says
                so directly instead of pointing at a wall.
              */
              <span className="gd-online-off">
                Playing over the network needs somebody to run a host —
                <code>npm run host</code>{' '}
                on a machine everyone here can reach. Until then, "Set up a table" plays with
                other people on this device, passed hand to hand.
              </span>
            )}
            {onRemix && (
              <button className="ghost" onClick={() => { const f = fork(game.id, me); onChanged(); if (f) onRemix(f); }}>
                Remix it
              </button>
            )}
            {!game.builtIn && (
              <button className="ghost danger" onClick={() => setConfirmingUnpublish(true)}>
                Unpublish
              </button>
            )}
          </div>

          {confirmingUnpublish && (
            <Confirm
              title={`Unpublish ${game.definition.meta.name}?`}
              body="This removes it from the shelf for everyone, along with its ratings and reviews. It can’t be undone — though anyone who forked it keeps their own copy."
              confirmLabel="Unpublish it"
              onConfirm={() => { unpublish(game.id); onChanged(); onBack(); }}
              onCancel={() => setConfirmingUnpublish(false)}
            />
          )}

          {!game.builtIn && (
            <div className="safety">
              {reporting ? (
                <div className="safety-form">
                  <span className="mini-label">What’s wrong with this game?</span>
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
                title={`Rate ${n} star${n === 1 ? '' : 's'}`}
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

          {(board.length > 0 || boardScope === 'friends') && (
            <>
              <h3 className="gd-sub">
                Leaderboard
                {/* Only worth offering once there is somebody to compare against. */}
                {follows().length > 0 && (
                  <span className="seg sm board-scope">
                    <button className={boardScope === 'all' ? 'on' : ''} onClick={() => setBoardScope('all')}>Everyone</button>
                    <button className={boardScope === 'friends' ? 'on' : ''} onClick={() => setBoardScope('friends')}>Following</button>
                  </span>
                )}
              </h3>
              {board.length === 0 && boardScope === 'friends' && (
                <div className="empty-inline">
                  <EmptyFriendsMark />
                  <p className="muted">Nobody you follow has finished this one yet.</p>
                </div>
              )}
              {board.length === 0 && boardScope === 'all' && (
                <p className="muted">Nobody has finished this one yet.</p>
              )}
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
