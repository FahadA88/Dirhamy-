import { Card, MatchState, Move } from '../engine/types';
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
  /*
    Spider: stacking onto your own suit is the only tableau move that builds toward a run — but
    only if the card was not already sitting on one.

    Without that second half, one-suit Spider is pathological. Every card is the same suit, so
    every move looks like progress, and the player spends the game sliding a nine off one ten
    and onto another: it hit the move cap on 104 of 120 deals. A card that is already the right
    rank below the right suit has nothing to gain by moving, so that is churn, and churn belongs
    in the bottom tier where it is only played when nothing else is available.
  */
  const destTop = (s.zones[to] || []).slice(-1)[0];
  if (card && destTop && card.suit === destTop.suit && !inSuitRun(s, col, idx)) return 'progress';
  return 'lateral';
}

// Is this card already the next rank down from a face-up card of its own suit? Then it is
// already where a Spider run wants it, and sliding it sideways achieves nothing.
function inSuitRun(s: MatchState, col: Card[], idx: number): boolean {
  if (idx <= 0) return false;
  const below = col[idx - 1];
  const card = col[idx];
  if (!below || !card || !s.faceUp[below.id] || below.suit !== card.suit) return false;
  const order = s.definition.deck.rankOrder as readonly string[];
  return order.indexOf(below.rank) === order.indexOf(card.rank) + 1;
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
  const cfg = s.definition.solitaire!;
  const all = legalMoves(s, s.players[0]);
  if (all.length === 0) return null;

  /*
    Churn is not a last resort, it is a trap — so it is refused outright rather than demoted.

    Taking a card that already sits on its own suit, one rank up, and sliding it onto a different
    card of the same suit and rank leaves the board in a position that is different from the one
    before and no better. One-suit Spider is nothing but those moves: with the whole pack one
    suit, every ten will take every nine, and the player spent 72 of 120 deals doing that until
    the move cap stopped it. The seen-positions guard cannot help, because each shuffle really is
    a new position.
  */
  const moves = all.filter((m) => {
    const from = m.from ?? '';
    if (!from.startsWith('tab') || !(m.to ?? '').startsWith('tab')) return true;
    const col = s.zones[from] || [];
    return !inSuitRun(s, col, col.findIndex((c) => c.id === m.cardId));
  });
  // If churn was the only thing on offer, the game is over in every sense that matters.
  if (moves.length === 0) return null;

  /*
    Item 14, Scorpion: dealing a new row needs every column full — see solDeal's own legality
    check — and the only way a column empties is by playing its last card away. Once that
    happens there is no way back: nothing can refill a column except the deal that emptying it
    just switched off, for good, with however many cards were still sitting in the stock. A
    greedy player chasing "empty a column" as pure progress (which it genuinely is in FreeCell
    or Forty Thieves) walks straight into that trap here — measured on Scorpion, deals were
    ending 0/120 with cards still sitting in an undealt stock, sometimes in under thirty moves.
    So the deal is taken the moment it's on offer, ahead of anything else that might cost it.

    Gated to moveRun 'any' — Scorpion's own defining move (pick up any face-up card and
    everything sitting on it, however jumbled, and drop it wherever the bottom card fits) —
    rather than every deal-row game. That move is what makes dealing onto a half-built column
    safe: whatever lands can always be untangled later. Spider requires an already-clean
    same-suit run to lift more than one card, so a card dealt onto an unfinished pile can jam it
    for good — applying this same fix to every deal-row game, not just moveRun:'any' ones, took
    Spider (One Suit) from 38/120 solved to 0/120.
  */
  if (cfg.stock === 'deal-row' && cfg.moveRun === 'any') {
    const deal = moves.find((m) => m.actionId === 'solDeal');
    if (deal && !seen.has(positionKey(apply(s, deal)))) return deal;
  }

  for (const tier of ['progress', 'stock', 'lateral'] as Tier[]) {
    const pool = moves.filter((m) => tierOf(s, m) === tier).sort((a, b) => rank(s, b) - rank(s, a));
    if (pool.length === 0) continue;

    /*
      A game played onto the waste gets one ply of lookahead. Every other game does not.

      In Golf the whole question is which of the exposed cards to spend, and the static ranking
      cannot see that taking the six now leaves nothing playable next. Trying each candidate and
      counting what the board then offers answers it directly — and the candidates here are
      column tops, so there are at most seven of them.

      That bound is the reason this is gated. Measured across the whole patience catalogue, the
      same lookahead run everywhere took the suite from 1m14s to 10m53s and made FreeCell and
      Spider markedly worse, because those games offer a hundred legal moves at a time and the
      count of replies is a poor guide when nearly all of them are sideways shuffles.
    */
    if (cfg.wasteIsTarget && tier === 'progress') {
      let best: { move: Move; after: number } | null = null;
      for (const m of pool) {
        const next = apply(s, m);
        if (seen.has(positionKey(next))) continue;
        const after = next.phase === 'playing' ? legalMoves(next, next.players[0]).length : 999;
        if (!best || after > best.after) best = { move: m, after };
      }
      if (best) return best.move;
      continue;
    }

    for (const m of pool) {
      if (!seen.has(positionKey(apply(s, m)))) return m;
    }
  }
  return null;
}
