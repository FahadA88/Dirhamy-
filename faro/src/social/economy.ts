// Chips and gems: what a finished game is worth, and what it can buy.
//
// Two currencies, on purpose. Chips are earned by playing at all — a match played, a match won,
// today's deal solved — so the number goes up steadily just from using the app. Gems are earned
// by the things `records.ts`/`daily.ts` already treat as milestones (a win streak, a play
// streak, a tournament actually won) rather than by ordinary play, so they stay scarce without
// needing an arbitrary drip rate invented for this file alone. Neither is purchasable with real
// money anywhere in this codebase, and this file has no code path that could make it so — see
// CLAUDE.md's "No real-money gambling."
//
// Storage is local, the same as every other player-progress file here (records.ts, daily.ts) —
// there is no server behind any of this yet, and the shape is written so that swapping the
// storage for one is a matter of replacing read/write, same promise records.ts already makes.

export interface Wallet {
  chips: number;
  gems: number;
}

/** One line of why a balance changed — shown in the Shop tab so "why did this go up" is never a
 *  mystery, and kept short (30 entries) so it is a recent-activity strip, not a second ledger to
 *  maintain forever. */
export interface EarnEvent {
  at: number;
  chips: number;
  gems: number;
  reason: string;
}

const WALLET = 'faro.wallet.v1';
const LEDGER = 'faro.wallet-ledger.v1';
const LEDGER_LIMIT = 30;

function readWallet(): Wallet {
  try {
    const raw = localStorage.getItem(WALLET);
    if (!raw) return { chips: 0, gems: 0 };
    const w = JSON.parse(raw) as Partial<Wallet>;
    // A saved wallet from a build that only ever wrote one of the two fields — or a hand-edited
    // one — should not hand back NaN to every balance display on the page.
    return { chips: Number.isFinite(w.chips) ? w.chips! : 0, gems: Number.isFinite(w.gems) ? w.gems! : 0 };
  } catch { return { chips: 0, gems: 0 }; }
}

function writeWallet(w: Wallet): void {
  try { localStorage.setItem(WALLET, JSON.stringify(w)); } catch { /* quota */ }
}

function readLedger(): EarnEvent[] {
  try { return JSON.parse(localStorage.getItem(LEDGER) || '[]') as EarnEvent[]; } catch { return []; }
}

function writeLedger(es: EarnEvent[]): void {
  try { localStorage.setItem(LEDGER, JSON.stringify(es.slice(-LEDGER_LIMIT))); } catch { /* quota */ }
}

export function wallet(): Wallet {
  return readWallet();
}

export function ledger(): EarnEvent[] {
  return [...readLedger()].reverse(); // most recent first
}

/** The one place a balance actually changes going up. `chips`/`gems` may be 0 (not both at
 *  once — call sites don't bother calling this for a reason worth nothing). */
function earn(chips: number, gems: number, reason: string): void {
  if (chips <= 0 && gems <= 0) return;
  const w = readWallet();
  writeWallet({ chips: w.chips + chips, gems: w.gems + gems });
  writeLedger([...readLedger(), { at: Date.now(), chips, gems, reason }]);
}

/**
 * Hooked into recordResult() in records.ts: every finished (non-practice) match. A played game
 * is worth something on its own — most games are not won by most seats — and a win is worth
 * more on top of that, not instead of it.
 */
export function earnForMatch(youWon: boolean): void {
  earn(8, 0, 'Played a match');
  if (youWon) earn(12, 0, 'Won a match');
}

/** Hooked into recordDaily() in daily.ts: the one Today's Deal result per day that sticks. */
export function earnForDaily(won: boolean): void {
  if (won) earn(25, 0, "Solved today's deal");
}

/**
 * Hooked into recordResult(), checked AFTER the result is written — currentStreak() reads the
 * just-updated history, so this sees the streak including the match that just finished. Fires
 * once per threshold crossed, not once per win past it: streakBefore lets the caller tell "just
 * reached 3" from "already past 3", so winning a fourth game in a row does not pay out the
 * three-streak bonus a second time.
 */
export function earnForStreak(streakBefore: number, streakAfter: number): void {
  const THRESHOLDS: [number, number][] = [[3, 8], [7, 25], [15, 60]]; // [streak length, gems]
  for (const [len, gems] of THRESHOLDS) {
    if (streakBefore < len && streakAfter >= len) earn(0, gems, `${len}-game win streak`);
  }
}

/** Hooked into recordYourTable() in tournament.ts, only when the bracket's champion is decided
 *  and it was you — winning a single round is already worth whatever its own match paid out. */
export function earnForChampionship(): void {
  earn(100, 50, 'Won a tournament');
}

// ---------- the shop ----------

export type ShopItemKind = 'cardBack' | 'avatar';

export interface ShopItem {
  id: string;
  kind: ShopItemKind;
  /** The value this item sets Settings.cardBack/avatar to once owned — usually the same as id,
   *  kept separate in case a shop id and a settings value ever need to differ. */
  value: string;
  name: string;
  blurb: string;
  price: { chips?: number; gems?: number };
}

// Nothing pre-existing was moved behind a paywall to build this catalog. Every one of the 21
// stock card backs and 16 stock avatars stays exactly as free as it always was — this is new
// cosmetics, added for the shop to sell, not old ones re-gated to give the shop something to do.
export const SHOP_ITEMS: ShopItem[] = [
  { id: 'shop-back-aurora', kind: 'cardBack', value: 'shop-back-aurora', name: 'Aurora', blurb: 'A slow green-violet shimmer across the back.', price: { chips: 150 } },
  { id: 'shop-back-embercut', kind: 'cardBack', value: 'shop-back-embercut', name: 'Embercut', blurb: 'Faceted, lit from underneath like hot glass.', price: { chips: 300 } },
  { id: 'shop-back-starfield', kind: 'cardBack', value: 'shop-back-starfield', name: 'Starfield', blurb: 'A scatter of pinlight stars on deep navy.', price: { gems: 20 } },
  { id: 'shop-avatar-lion', kind: 'avatar', value: '🦁', name: 'Lion', blurb: '', price: { chips: 60 } },
  { id: 'shop-avatar-unicorn', kind: 'avatar', value: '🦄', name: 'Unicorn', blurb: '', price: { chips: 250 } },
  { id: 'shop-avatar-comet', kind: 'avatar', value: '☄️', name: 'Comet', blurb: '', price: { gems: 15 } },
];

export function ownedShopItems(unlocked: string[]): Set<string> {
  return new Set(unlocked);
}

export function canAfford(w: Wallet, item: ShopItem): boolean {
  return (item.price.chips ?? 0) <= w.chips && (item.price.gems ?? 0) <= w.gems;
}

/** Spends the price and returns the new wallet, or null if it can't be afforded — callers check
 *  affordability themselves first (the Shop tab disables the button), this is the guard for
 *  anything that calls in without having checked. */
export function purchase(item: ShopItem): Wallet | null {
  const w = readWallet();
  if (!canAfford(w, item)) return null;
  const next: Wallet = { chips: w.chips - (item.price.chips ?? 0), gems: w.gems - (item.price.gems ?? 0) };
  writeWallet(next);
  writeLedger([...readLedger(), { at: Date.now(), chips: -(item.price.chips ?? 0), gems: -(item.price.gems ?? 0), reason: `Bought ${item.name}` }]);
  return next;
}
