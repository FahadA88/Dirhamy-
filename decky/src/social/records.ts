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
export function leaderboard(gameId?: string): Standing[] {
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
