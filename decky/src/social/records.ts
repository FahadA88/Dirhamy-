// What happened, and who is good at what.
//
// A leaderboard is only honest if it records the games people actually finished, so results are
// written when a match ends rather than counted from clicks. Everything here is per-device for
// now; the shapes are what a server would store, so wiring one up is a swap of read/write.

export interface Result {
  gameId: string;
  gameName: string;
  at: number;
  seats: number;
  /** Display names in finishing order, best first. */
  standings: { name: string; score: number; isYou: boolean }[];
  youWon: boolean;
  /**
   * One memorable number from this particular game — the size of a pot, the length of a run.
   * What it means depends on the family, which is why it carries its own label.
   */
  highlight?: { key: string; label: string; value: number } | null;
  /** Practice games are played, but they are not counted. */
  practice?: boolean;
}

export interface Standing {
  name: string;
  played: number;
  won: number;
  points: number;
  winRate: number;
  best: number;
}

const RESULTS = 'decky.results.v1';
const LIMIT = 300;

function read(): Result[] {
  try { return JSON.parse(localStorage.getItem(RESULTS) || '[]') as Result[]; } catch { return []; }
}

function write(rs: Result[]): void {
  try { localStorage.setItem(RESULTS, JSON.stringify(rs.slice(-LIMIT))); } catch { /* quota */ }
}

export function recordResult(r: Result): void {
  // Practice is for trying things out. Recording it would make the record a lie.
  if (r.practice) return;
  write([...read(), r]);
}

export function allResults(gameId?: string): Result[] {
  const rs = read().slice().reverse();
  return gameId ? rs.filter((r) => r.gameId === gameId) : rs;
}

/**
 * The table for a game, or across everything.
 *
 * Sorted by win rate rather than raw wins, with a games-played tiebreak — otherwise whoever sat
 * down most often tops every board, which tells you nothing.
 */
export function leaderboard(gameId?: string, only?: string[]): Standing[] {
  const rows = new Map<string, Standing>();
  for (const r of allResults(gameId)) {
    r.standings.forEach((s, i) => {
      const cur = rows.get(s.name) ?? { name: s.name, played: 0, won: 0, points: 0, winRate: 0, best: 0 };
      cur.played += 1;
      if (i === 0) cur.won += 1;
      cur.points += s.score;
      cur.best = Math.max(cur.best, s.score);
      rows.set(s.name, cur);
    });
  }
  return [...rows.values()]
    .filter((s) => !only || only.includes(s.name))
    .map((s) => ({ ...s, winRate: s.played > 0 ? s.won / s.played : 0 }))
    .sort((a, b) => b.winRate - a.winRate || b.played - a.played);
}

/** Consecutive wins ending at the most recent game, for the one stat people actually feel. */
export function currentStreak(gameId?: string): number {
  let n = 0;
  for (const r of allResults(gameId)) {
    if (!r.youWon) break;
    n++;
  }
  return n;
}

/** Punch-list item 68: the other direction — consecutive losses, so the table can offer to ease
 *  up on a tier that's clearly too hard, the same way currentStreak drives the "try a harder
 *  bot?" nudge. */
export function currentLossStreak(gameId?: string): number {
  let n = 0;
  for (const r of allResults(gameId)) {
    if (r.youWon) break;
    n++;
  }
  return n;
}

export interface PlayerSummary {
  played: number;
  won: number;
  winRate: number;
  streak: number;
  favouriteGame: string | null;
}

export function mySummary(): PlayerSummary {
  const rs = allResults();
  const byGame = new Map<string, number>();
  for (const r of rs) byGame.set(r.gameName, (byGame.get(r.gameName) ?? 0) + 1);
  let favourite: string | null = null;
  let most = 0;
  for (const [name, n] of byGame) if (n > most) { most = n; favourite = name; }
  const won = rs.filter((r) => r.youWon).length;
  return {
    played: rs.length,
    won,
    winRate: rs.length > 0 ? won / rs.length : 0,
    streak: currentStreak(),
    favouriteGame: favourite,
  };
}

// ---------- rank ----------
//
// Worklist: "no rank/tier concept in the data model, and inventing one was out of scope." A tier
// stored as its own field would be exactly that invention — a second place for the same fact to
// live, one that can drift from the truth the moment somebody edits localStorage by hand or an
// old build wrote it differently. Games finished is already tracked, already honest (practice
// games are excluded the same way everywhere else on this page excludes them), and already the
// basis two of the badges above cut at — this only reads the same number a third time.

export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface TierInfo {
  id: Tier;
  name: string;
  /** What it takes to reach the next one, or null at the top. */
  next: number | null;
}

/** The two lower cuts match the "Regular" (10) and "Fixture" (50) badges above, so a player who
 *  has earned one of those already carries the tier that goes with it. Platinum is one more cut
 *  past the highest badge, for whoever kept going after that. */
export function tierFor(gamesPlayed: number): TierInfo {
  if (gamesPlayed >= 150) return { id: 'platinum', name: 'Platinum', next: null };
  if (gamesPlayed >= 50) return { id: 'gold', name: 'Gold', next: 150 };
  if (gamesPlayed >= 10) return { id: 'silver', name: 'Silver', next: 50 };
  return { id: 'bronze', name: 'Bronze', next: 10 };
}

// ---------- badges ----------
//
// Every badge is derived from the results already stored, never tracked separately. That means
// they are correct for games played before the badge existed, and it means there is one source
// of truth about what somebody did rather than two that can disagree.

export interface Badge {
  id: string;
  name: string;
  blurb: string;
  mark: string;
  /** How far along, 0..1. A badge at 1 is earned. */
  progress: number;
  /** The concrete state of it — "4 of 19 games" — so progress is legible, not just a bar. */
  detail: string;
}

/** How many distinct games have been won at least once. */
function gamesWon(rs: Result[]): Set<string> {
  const s = new Set<string>();
  for (const r of rs) if (r.youWon) s.add(r.gameId);
  return s;
}

/** The longest run of wins anywhere in the history, not just the current one. */
function bestStreak(rs: Result[]): number {
  let best = 0, run = 0;
  // allResults() is newest-first; direction does not matter for a longest run.
  for (const r of rs) {
    if (r.youWon) { run++; best = Math.max(best, run); } else run = 0;
  }
  return best;
}

/**
 * The badges, and how close each one is.
 *
 * `catalogSize` is passed in rather than imported so this module stays free of the game
 * catalogue — it is storage, and it should not need to know what games exist.
 */
export function badges(catalogSize: number): Badge[] {
  const rs = allResults();
  const won = gamesWon(rs);
  const streak = bestStreak(rs);
  const played = rs.length;
  const bigTable = rs.filter((r) => r.seats >= 5 && r.youWon).length;
  const clean = rs.filter((r) => r.youWon && r.standings.length > 1
    && r.standings[0].score !== r.standings[1].score).length;

  const step = (have: number, need: number) => Math.max(0, Math.min(1, have / need));

  return [
    {
      id: 'first-win', name: 'First blood', blurb: 'Win a game.', mark: '★',
      progress: step(rs.filter((r) => r.youWon).length, 1),
      detail: rs.some((r) => r.youWon) ? 'Earned' : 'No wins yet',
    },
    {
      id: 'ten-games', name: 'Regular', blurb: 'Finish ten games.', mark: '◆',
      progress: step(played, 10), detail: `${Math.min(played, 10)} of 10 finished`,
    },
    {
      id: 'fifty-games', name: 'Fixture', blurb: 'Finish fifty games.', mark: '◈',
      progress: step(played, 50), detail: `${Math.min(played, 50)} of 50 finished`,
    },
    {
      id: 'streak-3', name: 'On a run', blurb: 'Win three in a row.', mark: '⚡',
      progress: step(streak, 3), detail: `Best run: ${streak}`,
    },
    {
      id: 'streak-7', name: 'Unbeaten', blurb: 'Win seven in a row.', mark: '✷',
      progress: step(streak, 7), detail: `Best run: ${streak}`,
    },
    {
      id: 'polyglot', name: 'All-rounder', blurb: 'Win at five different games.', mark: '✦',
      progress: step(won.size, 5), detail: `${won.size} different games won`,
    },
    {
      id: 'completionist', name: 'The whole shelf', blurb: 'Win at every game in the library.', mark: '♔',
      progress: catalogSize > 0 ? step(won.size, catalogSize) : 0,
      detail: `${won.size} of ${catalogSize} games won`,
    },
    {
      id: 'full-table', name: 'Crowd pleaser', blurb: 'Win at a table of five or more.', mark: '☗',
      progress: step(bigTable, 1), detail: bigTable > 0 ? 'Earned' : 'Not yet',
    },
    {
      id: 'outright', name: 'Outright', blurb: 'Win ten games without sharing first place.', mark: '◉',
      progress: step(clean, 10), detail: `${Math.min(clean, 10)} of 10 outright wins`,
    },
  ];
}

// ---------- the memorable numbers ----------

export interface Highlight {
  key: string;
  label: string;
  value: number;
  gameName: string;
  at: number;
}

/** The best recorded highlight per kind — the biggest pot, the longest run, and so on. */
export function highlights(): Highlight[] {
  const best = new Map<string, Highlight>();
  for (const r of allResults()) {
    const h = r.highlight;
    if (!h) continue;
    const cur = best.get(h.key);
    if (!cur || h.value > cur.value) {
      best.set(h.key, { ...h, gameName: r.gameName, at: r.at });
    }
  }
  return [...best.values()].sort((a, b) => b.at - a.at);
}
