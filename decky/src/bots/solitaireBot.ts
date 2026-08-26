import { MatchState, Move } from '../engine/types';
import { legalMoves, solZones } from '../engine/engine';

// Solitaire has no opponent, so this is not a bot in the usual sense — it is the greedy player
// used to sanity-check that a deal is playable, and the same ranking drives the Hint button.
//
// A patience game will happily let you shuffle one card back and forth forever, so the caller
// keeps a set of seen positions and this refuses to repeat one.

export function positionKey(s: MatchState): string {
  const cfg = s.definition.solitaire!;
  const parts: string[] = [];
  for (let i = 0; i < cfg.columns; i++) {
    parts.push((s.zones[solZones.tab(i)] || []).map((c) => `${c.id}${s.faceUp[c.id] ? '+' : '-'}`).join(','));
  }
  for (let i = 0; i < cfg.freeCells; i++) parts.push((s.zones[solZones.free(i)] || []).map((c) => c.id).join(''));
  for (let i = 0; i < cfg.foundations; i++) parts.push(String((s.zones[solZones.found(i)] || []).length));
  parts.push(String((s.zones[solZones.stock] || []).length));
  parts.push((s.zones[solZones.waste] || []).map((c) => c.id).join(','));
  // The reserve was missing from the key, so two Canfield positions differing only in how far
  // down the reserve had been dug looked identical — and the loop guard then refused the very
  // moves that were making progress.
  if (cfg.reserve) parts.push((s.zones[solZones.reserve] || []).map((c) => c.id).join(','));
  // With a dealt base the same card means different things in different deals.
  if (cfg.foundationStart === 'dealt') parts.push(String(s.foundationBase));
  return parts.join('|');
}

// Moves fall into three tiers. Anything that makes progress is played first; only when nothing
// does will the player touch the stock; only when it can't do that either will it shuffle cards
// sideways. Without that last tier a game like Spider — where nearly every card stacks on nearly
// every other — wanders forever instead of dealing.
export type Tier = 'progress' | 'stock' | 'lateral';

export function tierOf(s: MatchState, m: Move): Tier {
  if (m.actionId === 'solDeal' || m.actionId === 'solDraw' || m.actionId === 'solRedeal') return 'stock';
  const to = m.to ?? '';
  const from = m.from ?? '';
  const col = s.zones[from] || [];
  const idx = col.findIndex((c) => c.id === m.cardId);
  const card = col[idx];

  if (to.startsWith('found')) return 'progress';
  // Golf plays ONTO the waste, and every such move shrinks the board — which is the win
  // condition there. Without this the bot treated its only scoring move as a sideways shuffle
  // and drew the whole stock before touching a column.
  if (to === solZones.waste) return 'progress';
  if (from.startsWith('tab') && idx > 0 && !s.faceUp[col[idx - 1].id]) return 'progress';
  if (from.startsWith('tab') && idx === 0 && col.length > 0) return 'progress';   // empties a column
  // Digging into the reserve is the whole game in Canfield: the cards under it are unreachable
  // until the ones above are gone.
  if (from.startsWith('free') || from === solZones.waste || from === solZones.reserve) return 'progress';
  // Spider: stacking onto your own suit is the only tableau move that builds toward a run.
  const destTop = (s.zones[to] || []).slice(-1)[0];
  if (card && destTop && card.suit === destTop.suit) return 'progress';
  return 'lateral';
}

// Higher scores get played first within a tier.
export function rank(s: MatchState, m: Move): number {
  const cfg = s.definition.solitaire!;
  if (m.actionId === 'solDeal') return 10;
  if (m.actionId === 'solDraw') return 20;
  if (m.actionId === 'solRedeal') return 5;

  const to = m.to ?? '';
  const from = m.from ?? '';
  const col = s.zones[from] || [];
  const idx = col.findIndex((c) => c.id === m.cardId);

  if (to.startsWith('found')) return 100;
  // In a game won by clearing the board, emptying a column beats everything else; in one won by
  // filling foundations, a card that goes home does.
  // Clearing a column is the win, so among cards that could all go onto the waste, take the one
  // from the shortest column — it is the nearest to gone. Cheap, and the only lookahead a
  // greedy player can afford.
  if (to === solZones.waste) return 120 - Math.min(col.length, 20);
  if (from.startsWith('tab') && idx > 0 && !s.faceUp[col[idx - 1].id]) return 80 + idx;
  if (from.startsWith('tab') && idx === 0) return 60;
  // Ahead of the waste: a reserve card unblocks the one beneath it, where a waste card only
  // moves itself.
  if (from === solZones.reserve) return 50;
  if (from.startsWith('free')) return 40;
  if (from === solZones.waste) return 30;
  if ((s.zones[to] || []).length === 0 && to.startsWith('tab')) return 5;
  if (to.startsWith('free')) return cfg.stock === 'none' ? 2 : 1;
  return 20;
}

// The best move from here that doesn't return to a position already seen.
export function chooseSolitaireMove(
  s: MatchState,
  seen: Set<string>,
  apply: (st: MatchState, m: Move) => MatchState,
): Move | null {
  const moves = legalMoves(s, s.players[0]);
  if (moves.length === 0) return null;
  for (const tier of ['progress', 'stock', 'lateral'] as Tier[]) {
    const pool = moves.filter((m) => tierOf(s, m) === tier).sort((a, b) => rank(s, b) - rank(s, a));
    if (pool.length === 0) continue;

    for (const m of pool) {
      if (!seen.has(positionKey(apply(s, m)))) return m;
    }
  }
  return null;
}
