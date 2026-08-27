import { GameDefinition } from '../engine/types';
import { Knobs } from '../authoring/knobs';
import { migrate } from '../engine/migrate';
import { catalog } from '../games/catalog';

// The shelf: games people published, and what this device knows about them.
//
// Everything here is local. There is no server behind it yet, and the code is written so that
// swapping the storage for one is a matter of replacing readAll/writeAll — the shape of a
// published game, the stats, and the search are all transport-agnostic on purpose.
//
// Honest about what "community" means today: these are YOUR published games and your own
// ratings and play counts. Nothing is fetched from anyone else. The moment there is a backend,
// this file gains a fetch and loses nothing else.

export interface PublishedGame {
  id: string;
  definition: GameDefinition;
  /** The builder state, so the author — or anyone forking — can re-open it rather than read JSON. */
  knobs?: Knobs;
  author: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  tags: string[];
  forkedFrom?: string;
  stats: GameStats;
  /** Shipped with the app. Can be played, favourited, rated and forked; cannot be deleted. */
  builtIn?: boolean;
  staffPick?: boolean;
  /**
   * Written by the game writer from a description, rather than assembled in the editor. Worth
   * recording honestly: it is how somebody finds out what the writer is capable of, and it is
   * information a player is entitled to before they play.
   */
  aiWritten?: boolean;
  /** The sentence that produced it, when it was written from one. */
  prompt?: string;
}

export interface GameStats {
  plays: number;
  favourites: number;
  ratingSum: number;
  ratingCount: number;
}

export interface Review {
  gameId: string;
  author: string;
  rating: number;       // 1-5
  text: string;
  at: number;
}

const GAMES = 'decky.library.v1';
const REVIEWS = 'decky.reviews.v1';
const FAVS = 'decky.favourites.v1';
const PLAYS = 'decky.playhistory.v1';
const FOLLOWS = 'decky.follows.v1';
const BUILTIN_STATS = 'decky.builtinstats.v1';

// ---------- storage plumbing ----------

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota; not worth breaking play */ }
}

// ---------- games ----------

export function allPublished(): PublishedGame[] {
  const raw = read<PublishedGame[]>(GAMES, []);
  // A game stored by an older build still has to open. Migration runs on read, not on write,
  // so an upgrade never has to rewrite the whole shelf at once.
  return raw.flatMap((g) => {
    try {
      return [{ ...g, definition: migrate(g.definition).definition }];
    } catch {
      return [];   // a definition from a future version this build cannot read
    }
  });
}

export function getPublished(id: string): PublishedGame | undefined {
  return allGames().find((g) => g.id === id);
}

/**
 * The classics, presented on the same shelf as everything else.
 *
 * They are not a separate concept: a shipped game and a published one differ only in who wrote
 * it and whether it can be deleted. Making them the same type means search, filters, ratings,
 * favourites and remixing all work on both without a single special case.
 */
export function builtIns(): PublishedGame[] {
  const stats = read<Record<string, GameStats>>(BUILTIN_STATS, {});
  const staff = new Set(['classic-hearts', 'classic-klondike', 'classic-crazy-eights', 'classic-gin-rummy']);
  return catalog.map((def, i) => ({
    id: def.meta.id,
    definition: def,
    author: 'Decky',
    createdAt: 1_700_000_000_000 + i * 1000,
    updatedAt: 1_700_000_000_000 + i * 1000,
    version: 1,
    tags: [kindLabel(def), 'classic'],
    stats: stats[def.meta.id] ?? { plays: 0, favourites: 0, ratingSum: 0, ratingCount: 0 },
    builtIn: true,
    staffPick: staff.has(def.meta.id),
  }));
}

/** Everything on the shelf: what shipped, plus what has been published here. */
export function allGames(): PublishedGame[] {
  return [...builtIns(), ...allPublished()];
}

export interface PublishInput {
  definition: GameDefinition;
  knobs?: Knobs;
  author: string;
  tags?: string[];
  forkedFrom?: string;
  /** Publishing over an existing id updates it in place and bumps the version. */
  id?: string;
  aiWritten?: boolean;
  prompt?: string;
}

export function publish(input: PublishInput): PublishedGame {
  const games = read<PublishedGame[]>(GAMES, []);
  const now = Date.now();
  const id = input.id ?? slugId(input.definition.meta.name, games);
  const existing = games.find((g) => g.id === id);

  const definition: GameDefinition = {
    ...JSON.parse(JSON.stringify(input.definition)),
    meta: { ...input.definition.meta, id },
  };

  const game: PublishedGame = {
    id,
    definition,
    knobs: input.knobs,
    author: input.author,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    version: (existing?.version ?? 0) + 1,
    tags: dedupe([...(input.tags ?? []), kindLabel(definition)]),
    forkedFrom: input.forkedFrom ?? existing?.forkedFrom,
    stats: existing?.stats ?? { plays: 0, favourites: 0, ratingSum: 0, ratingCount: 0 },
    // Provenance survives a re-publish: editing a written game does not make it hand-made.
    aiWritten: input.aiWritten ?? existing?.aiWritten,
    prompt: input.prompt ?? existing?.prompt,
  };

  const next = existing ? games.map((g) => (g.id === id ? game : g)) : [...games, game];
  write(GAMES, next);
  return game;
}

export function unpublish(id: string): void {
  write(GAMES, read<PublishedGame[]>(GAMES, []).filter((g) => g.id !== id));
}

/** A copy of somebody's game, credited, that the forker can edit freely. */
export function fork(id: string, author: string): PublishedGame | undefined {
  const src = getPublished(id);
  if (!src) return undefined;
  const definition = JSON.parse(JSON.stringify(src.definition)) as GameDefinition;
  definition.meta.name = `${src.definition.meta.name} (remix)`;
  return publish({
    definition,
    knobs: src.knobs,
    author,
    tags: src.tags,
    forkedFrom: src.id,
  });
}

// ---------- stats ----------

function mutate(id: string, fn: (g: PublishedGame) => void): void {
  const games = read<PublishedGame[]>(GAMES, []);
  const g = games.find((x) => x.id === id);
  if (g) { fn(g); write(GAMES, games); return; }

  // A built-in's definition is code, but the counts people generate about it are not, so they
  // live in their own bucket rather than being lost.
  if (!catalog.some((d) => d.meta.id === id)) return;
  const stats = read<Record<string, GameStats>>(BUILTIN_STATS, {});
  const shell = { stats: stats[id] ?? { plays: 0, favourites: 0, ratingSum: 0, ratingCount: 0 } } as PublishedGame;
  fn(shell);
  stats[id] = shell.stats;
  write(BUILTIN_STATS, stats);
}

export function recordPlay(id: string): void {
  mutate(id, (g) => { g.stats.plays += 1; });
  const hist = read<Record<string, number>>(PLAYS, {});
  hist[id] = Date.now();
  write(PLAYS, hist);
}

export function lastPlayed(id: string): number | undefined {
  return read<Record<string, number>>(PLAYS, {})[id];
}

export function favourites(): string[] { return read<string[]>(FAVS, []); }
export function isFavourite(id: string): boolean { return favourites().includes(id); }

export function toggleFavourite(id: string): boolean {
  const favs = favourites();
  const on = favs.includes(id);
  const next = on ? favs.filter((x) => x !== id) : [...favs, id];
  write(FAVS, next);
  mutate(id, (g) => { g.stats.favourites = Math.max(0, g.stats.favourites + (on ? -1 : 1)); });
  return !on;
}

// ---------- reviews ----------

export function reviewsFor(id: string): Review[] {
  return read<Review[]>(REVIEWS, []).filter((r) => r.gameId === id).sort((a, b) => b.at - a.at);
}

export function myReview(id: string, author: string): Review | undefined {
  return read<Review[]>(REVIEWS, []).find((r) => r.gameId === id && r.author === author);
}

/** One review per person per game — rating again replaces the old one rather than stacking. */
export function review(gameId: string, author: string, rating: number, text: string): void {
  const clamped = Math.min(5, Math.max(1, Math.round(rating)));
  const all = read<Review[]>(REVIEWS, []);
  const prev = all.find((r) => r.gameId === gameId && r.author === author);
  const next: Review = { gameId, author, rating: clamped, text: text.trim(), at: Date.now() };
  write(REVIEWS, prev ? all.map((r) => (r === prev ? next : r)) : [...all, next]);

  mutate(gameId, (g) => {
    if (prev) {
      g.stats.ratingSum += clamped - prev.rating;
    } else {
      g.stats.ratingSum += clamped;
      g.stats.ratingCount += 1;
    }
  });
}

export function averageRating(stats: GameStats): number | null {
  return stats.ratingCount > 0 ? stats.ratingSum / stats.ratingCount : null;
}

// ---------- creators ----------

export function follows(): string[] { return read<string[]>(FOLLOWS, []); }
export function isFollowing(author: string): boolean { return follows().includes(author); }

export function toggleFollow(author: string): boolean {
  const cur = follows();
  const on = cur.includes(author);
  write(FOLLOWS, on ? cur.filter((a) => a !== author) : [...cur, author]);
  return !on;
}

export interface Creator {
  name: string;
  games: PublishedGame[];
  plays: number;
  rating: number | null;
}

export function creator(name: string, games: PublishedGame[]): Creator {
  const mine = games.filter((g) => g.author === name);
  const sum = mine.reduce((t, g) => t + g.stats.ratingSum, 0);
  const count = mine.reduce((t, g) => t + g.stats.ratingCount, 0);
  return {
    name,
    games: mine,
    plays: mine.reduce((t, g) => t + g.stats.plays, 0),
    rating: count > 0 ? sum / count : null,
  };
}

export function creators(games: PublishedGame[]): Creator[] {
  return dedupe(games.map((g) => g.author)).map((a) => creator(a, games))
    .sort((a, b) => b.games.length - a.games.length);
}

// ---------- collections ----------

export interface Collection {
  id: string;
  title: string;
  blurb: string;
  games: PublishedGame[];
}

/**
 * The shelves on the front page. Derived rather than curated by hand, so they are never stale
 * and never empty for the wrong reason — a shelf with nothing in it is simply not shown.
 */
export function collections(games: PublishedGame[]): Collection[] {
  const played = read<Record<string, number>>(PLAYS, {});
  const favs = favourites();
  const out: Collection[] = [
    {
      id: 'continue', title: 'Pick up where you left off',
      blurb: 'Games you have played recently.',
      games: games.filter((g) => played[g.id]).sort((a, b) => played[b.id] - played[a.id]).slice(0, 6),
    },
    {
      id: 'staff', title: 'Staff picks',
      blurb: 'A good place to start.',
      games: games.filter((g) => g.staffPick),
    },
    {
      id: 'written', title: 'Written from a description',
      blurb: 'Games the writer built from a sentence. Every one was playtested before it appeared.',
      games: games.filter((g) => g.aiWritten).slice(0, 8),
    },
    {
      id: 'favourites', title: 'Your favourites',
      blurb: 'Everything you starred.',
      games: games.filter((g) => favs.includes(g.id)),
    },
    {
      id: 'quick', title: 'Quick games',
      blurb: 'Under ten minutes.',
      games: games.filter((g) => playtimeOf(g.definition) <= 10).slice(0, 8),
    },
    {
      id: 'solo', title: 'On your own',
      blurb: 'One player, one deck.',
      games: games.filter((g) => g.definition.meta.players.max === 1),
    },
    {
      id: 'community', title: 'Built here',
      blurb: 'Games people made in the builder.',
      games: games.filter((g) => !g.builtIn).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8),
    },
  ];
  /*
    The shelves are filters over the same library, so without this a game lands on every
    shelf it happens to satisfy: Solitaire is a staff pick, it is under ten minutes, and it
    is a one-player game, so it appeared three times on one screen and the front page looked
    broken. Each game is claimed by whichever shelf says the most about it — being the only
    thing you can play alone is more particular than being short — and the shelves are still
    shown in the order set out above.

    The two personal shelves are simply absent from the list below, so they are never
    filtered: "your favourites" and "pick up where you left off" are answers to a question
    you asked, and a game belongs on them however else it happens to be filed.
  */
  const BY_SPECIFICITY = ['solo', 'community', 'written', 'staff', 'quick'];
  const claimed = new Set<string>();
  for (const id of BY_SPECIFICITY) {
    const shelf = out.find((c) => c.id === id);
    if (!shelf) continue;
    shelf.games = shelf.games.filter((g) => !claimed.has(g.id));
    for (const g of shelf.games) claimed.add(g.id);
  }

  // Whatever no shelf above happened to describe. Without this the front page quietly showed
  // eight of twenty-one games and the rest existed only behind the search box.
  out.push({
    id: 'rest', title: 'The rest of the shelf',
    blurb: 'Everything else, in one place.',
    games: games.filter((g) => !claimed.has(g.id)),
  });

  return out.filter((c) => c.games.length > 0);
}

/** The one game to put at the top today. Rotates daily so the front page isn't frozen. */
export function featured(games: PublishedGame[]): PublishedGame | undefined {
  return featuredSet(games, 1)[0];
}

/**
 * The games the carousel turns through. Same daily rotation as `featured`, so slide one is
 * today's pick and the rest follow it — the carousel is the feature, widened, not a second
 * unrelated shortlist.
 */
export function featuredSet(games: PublishedGame[], n: number): PublishedGame[] {
  const pool = games.filter((g) => g.staffPick || (averageRating(g.stats) ?? 0) >= 4);
  const list = pool.length > 0 ? pool : games;
  if (list.length === 0) return [];
  const day = Math.floor(Date.now() / 86400000);
  const out: PublishedGame[] = [];
  for (let i = 0; i < Math.min(n, list.length); i++) out.push(list[(day + i) % list.length]);
  return out;
}

/** The kinds of game, as a player would name them rather than as the engine names them. */
export const KINDS: { id: string; label: string; mark: string }[] = [
  { id: '', label: 'Everything', mark: '🂠' },
  { id: 'shedding', label: 'Shedding', mark: '🂡' },
  { id: 'trick', label: 'Trick-taking', mark: '🂭' },
  { id: 'climb', label: 'Climbing', mark: '🂮' },
  { id: 'fish', label: 'Asking', mark: '🃁' },
  { id: 'rummy', label: 'Melding', mark: '🃋' },
  { id: 'war', label: 'Flipping', mark: '🃞' },
  { id: 'bluff', label: 'Bluffing', mark: '🂢' },
  { id: 'reflex', label: 'Reflex', mark: '🃏' },
  { id: 'poker', label: 'Betting', mark: '🂫' },
  { id: 'pit', label: 'Trading', mark: '🃑' },
  { id: 'set', label: 'Spotting', mark: '🂪' },
  { id: 'kent', label: 'Signalling', mark: '🂹' },
  { id: 'layout', label: 'Laying out', mark: '🃎' },
  { id: 'swap', label: 'Remembering', mark: '🂠' },
  { id: 'maid', label: 'Blind draw', mark: '🂭' },
  { id: 'solitaire', label: 'Patience', mark: '🂨' },
];

/**
 * What kind of game this is, read the same way the interpreter reads it — off the optional
 * block the definition carries, not off `meta.family`, which is a free-text label an author
 * writes for humans ("shedding-matching", "comparison") and cannot be filtered on.
 */
export function kindOf(def: GameDefinition): string {
  if (def.solitaire) return 'solitaire';
  if (def.trick) return 'trick';
  if (def.climb) return 'climb';
  if (def.fish) return 'fish';
  if (def.rummy) return 'rummy';
  if (def.war) return 'war';
  // Without these five, every game the interpreter grew after the original families fell
  // through to "shedding" — so browsing for something like Crazy Eights turned up Showdown
  // Poker, Pit and Slapjack, and the tab claimed eight shedding games where there are three.
  if (def.bluff) return 'bluff';
  if (def.reflex) return 'reflex';
  if (def.poker) return 'poker';
  if (def.pit) return 'pit';
  if (def.set) return 'set';
  if (def.kent) return 'kent';
  if (def.layout) return 'layout';
  if (def.swap) return 'swap';
  if (def.maid) return 'maid';
  return 'shedding';
}

/** The player-facing name of that kind, for a badge or a tab. */
export function kindLabel(def: GameDefinition): string {
  const k = kindOf(def);
  return KINDS.find((x) => x.id === k)?.label ?? k;
}

// ---------- search ----------

export type SortKey = 'trending' | 'newest' | 'top-rated' | 'most-played' | 'name';

export interface Filters {
  query?: string;
  tags?: string[];
  players?: number;         // must seat exactly this many
  family?: string;
  favouritesOnly?: boolean;
  maxComplexity?: number;   // 1-5
}

/**
 * Complexity, estimated rather than asked for. Authors are the worst judges of how hard their
 * own game is, so this counts what the definition actually contains.
 */
export function complexityOf(def: GameDefinition): number {
  let score = 1;
  if (def.trick?.bidding || def.trick?.auction) score += 1;
  if (def.rummy) score += 1;
  if (def.climb?.combos) score += 0.5;
  if (def.handPass) score += 0.5;
  if (def.solitaire && def.solitaire.freeCells > 0) score += 0.5;
  score += Math.min(2, (def.rules ?? []).length * 0.4);
  score += Math.min(1, Object.keys(def.deck.tags).length * 0.25);
  return Math.max(1, Math.min(5, Math.round(score)));
}

/**
 * About what one hand of this game is worth, so a points target can be read as a number of
 * hands. Assuming a flat twenty-five put Spades — a race to 500, at roughly a hundred a hand
 * — at twenty hands and a shelf label of 160 minutes, which is not a game anybody clicks.
 */
function pointsPerHand(def: GameDefinition): number {
  if (def.trick?.scoreBy === 'penalty') {
    // Every penalty card is dealt out every hand, so the whole pot is scored each time. The
    // map is keyed by suit, by rank, or by one named card, and each means a different number
    // of cards — "every heart is worth one" is thirteen points a hand, not one.
    const pot = Object.entries(def.trick.penaltyPoints ?? {}).reduce((a, [key, v]) => {
      if (key.length >= 2) return a + v;                       // a single card, e.g. "SQ"
      if ('CDHS'.includes(key)) return a + v * 13;             // a whole suit
      return a + v * 4;                                        // a rank, four of them
    }, 0);
    return Math.max(4, pot || 26);
  }
  if (def.trick) {
    // A trick game pays per trick, and a hand holds one trick per card dealt. Euchre and its
    // relatives pay a point or two a hand instead, which a small target is the tell for.
    if ((def.scoring.target ?? 0) <= 15) return 1.5;
    const dealt = def.setup.find((s) => s.op === 'deal')?.countPerPlayer ?? 10;
    return Math.max(10, dealt * 8);
  }
  return 25;   // shedding, climbing and melding games settle around here
}

/** Rough playtime in minutes, from hand size, player count and whether it's a race to a target. */
export function playtimeOf(def: GameDefinition): number {
  // A game that seats two to six is nearly always played at a normal table rather than at its
  // absolute maximum, and quoting the slowest possible seating made every game look long.
  const seats = Math.min(def.meta.players.max, 4);
  const hands = def.scoring.target
    ? Math.min(12, Math.max(2, Math.round(def.scoring.target / pointsPerHand(def))))
    : 1;
  // How long one hand takes is mostly how many cards each player has to get through — a
  // five-card Euchre hand is nothing like a thirteen-card one — with the table adding a
  // little on top for everyone else's turns.
  const dealt = def.setup.find((s) => s.op === 'deal')?.countPerPlayer ?? 7;
  const base = def.solitaire ? 8 : 1 + dealt * 0.45 + seats * 0.3;
  return Math.max(3, Math.round(base * hands));
}

export function searchLibrary(games: PublishedGame[], filters: Filters, sort: SortKey): PublishedGame[] {
  const q = (filters.query ?? '').trim().toLowerCase();
  const favs = favourites();

  const hits = games.filter((g) => {
    const d = g.definition;
    if (q) {
      const hay = `${d.meta.name} ${d.meta.description} ${g.author} ${g.tags.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.family && kindOf(d) !== filters.family) return false;
    if (filters.tags?.length && !filters.tags.every((t) => g.tags.includes(t))) return false;
    if (filters.players && (d.meta.players.min > filters.players || d.meta.players.max < filters.players)) return false;
    if (filters.favouritesOnly && !favs.includes(g.id)) return false;
    if (filters.maxComplexity && complexityOf(d) > filters.maxComplexity) return false;
    return true;
  });

  const rating = (g: PublishedGame) => averageRating(g.stats) ?? 0;
  const sorters: Record<SortKey, (a: PublishedGame, b: PublishedGame) => number> = {
    // Trending leans on recency as well as plays, so a good new game isn't buried by an old one.
    trending: (a, b) => trendScore(b) - trendScore(a),
    newest: (a, b) => b.createdAt - a.createdAt,
    'top-rated': (a, b) => rating(b) - rating(a) || b.stats.ratingCount - a.stats.ratingCount,
    'most-played': (a, b) => b.stats.plays - a.stats.plays,
    name: (a, b) => a.definition.meta.name.localeCompare(b.definition.meta.name),
  };
  return hits.sort(sorters[sort]);
}

function trendScore(g: PublishedGame): number {
  const ageDays = (Date.now() - g.updatedAt) / 86400000;
  const heat = g.stats.plays + g.stats.favourites * 2 + g.stats.ratingSum;
  return heat / Math.pow(ageDays + 2, 0.6);
}

// ---------- helpers ----------

function slugId(name: string, existing: PublishedGame[]): string {
  const base = `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game'}`;
  let id = base;
  let n = 2;
  while (existing.some((g) => g.id === id)) id = `${base}-${n++}`;
  return id;
}

function dedupe(xs: string[]): string[] { return Array.from(new Set(xs.filter(Boolean))); }

/** Everything a game can be tagged with, gathered from what has actually been published. */
export function allTags(games: PublishedGame[]): string[] {
  return dedupe(games.flatMap((g) => g.tags)).sort();
}
