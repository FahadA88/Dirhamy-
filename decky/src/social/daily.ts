// Today's Deal — worklist #78, second only to drag-and-drop on the "if I only did five" list:
// "One seeded hand, the same for everybody, ranked. It is the single highest-value thing on
// this list for bringing anybody back tomorrow."
//
// "The same for everybody" is real: the deal is derived from the UTC date alone, through the
// same commit-reveal machinery (deriveSeed in fairness.ts) every other match already uses —
// nothing new to trust. "Ranked" is not, honestly: results here are per-device, the same
// documented limit every other record in this app already carries (see records.ts), and there
// is no server to compare your run against anyone else's. What's kept instead is what a
// device-local app can actually promise — your own result for today, and the streak of days
// you've solved it — rather than a leaderboard this app has no way to run.

const KEY = 'decky.daily.v1';

export interface DailyResult {
  date: string;   // YYYY-MM-DD, UTC
  won: boolean;
  moves: number;
}

/** Today's date key, in UTC — so the deal changes at the same instant for every player on
 * Earth, not separately per time zone. */
export function todayKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function read(): Record<string, DailyResult> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, DailyResult>; } catch { return {}; }
}

function write(all: Record<string, DailyResult>): void {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* quota */ }
}

/** Records today's outcome. Only the first result for a given date sticks — replaying the same
 * day's deal (which the UI does not offer, but a saved match reload could) should not let a
 * loss be quietly overwritten by a second try. */
export function recordDaily(result: DailyResult): void {
  const all = read();
  if (all[result.date]) return;
  all[result.date] = result;
  write(all);
}

export function resultFor(date: string): DailyResult | null {
  return read()[date] ?? null;
}

/** Consecutive solved days ending today or yesterday — ending yesterday still counts as a live
 * streak, since today's deal may simply not have been played yet. */
export function dailyStreak(): number {
  const all = read();
  const d = new Date();
  if (!all[todayKey(d)]?.won) d.setUTCDate(d.getUTCDate() - 1); // today not played/won: start counting from yesterday
  let n = 0;
  while (all[todayKey(d)]?.won) {
    n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}
