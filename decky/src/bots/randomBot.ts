import { MatchState, Move } from '../engine/types';
import { legalMoves } from '../engine/engine';
import { nextRandom } from '../engine/rng';

// Because the engine enumerates legal moves, a bot works for ANY valid game for free.
// This bot uses a light heuristic: prefer shedding a card over drawing, dump high-value
// cards first, and avoid burning wild 8s until needed.

const HIGH = new Set(['K', 'Q', 'J', '10']);

export function chooseMove(
  state: MatchState,
  playerId: string,
  botSeed: number,
  mode: 'smart' | 'random' = 'smart',
): { move: Move; botSeed: number } {
  const moves = legalMoves(state, playerId);
  if (moves.length === 0) return { move: { actionId: 'drawCard' }, botSeed };

  // Resolving a pending suit choice: pick the suit the bot holds most of.
  if (moves[0].actionId === 'resolveChoice') {
    const hand = state.zones[`hand:${playerId}`] || [];
    const counts: Record<string, number> = { C: 0, D: 0, H: 0, S: 0 };
    for (const c of hand) if (c.suit in counts) counts[c.suit]++;
    let best = 'S';
    for (const s of ['C', 'D', 'H', 'S']) if (counts[s] > counts[best]) best = s;
    return { move: { actionId: 'resolveChoice', choice: best }, botSeed };
  }

  // Bidding (Spades): estimate tricks from high cards + long trump.
  if (moves[0].actionId === 'bid') {
    if (mode === 'random') { const r = nextRandom(botSeed); return { move: moves[Math.floor(r.value * moves.length)], botSeed: r.state }; }
    const hand = state.zones[`hand:${playerId}`] || [];
    const trump = state.definition.trick?.trump;
    let bid = 0;
    for (const c of hand) if (c.rank === 'A' || c.rank === 'K') bid++;
    const trumpCount = trump && trump !== 'none' ? hand.filter((c) => c.suit === trump).length : 0;
    if (trumpCount > 3) bid += trumpCount - 3;
    bid = Math.min(bid, moves.length - 1);
    const pick = moves.find((m) => m.choice === String(bid)) || moves[0];
    return { move: pick, botSeed };
  }

  // Trick-taking: play from the trick-legal set. Smart = shed the lowest card.
  if (moves[0].actionId === 'playToTrick') {
    if (mode === 'random') { const r = nextRandom(botSeed); return { move: moves[Math.floor(r.value * moves.length)], botSeed: r.state }; }
    const hand = state.zones[`hand:${playerId}`] || [];
    const order = state.definition.deck.rankOrder;
    const strength = (id?: string) => { const c = hand.find((x) => x.id === id); if (!c) return 0; const b = order.indexOf(c.rank as never); return c.rank === 'A' ? 100 : b; };
    let best = moves[0];
    for (const m of moves) if (strength(m.cardId) < strength(best.cardId)) best = m;
    return { move: best, botSeed };
  }

  // Rummy: draw the discard when it connects with the hand; meld greedily; discard the least
  // useful card (one with no rank-mate and no same-suit neighbour).
  if (moves[0].actionId === 'drawStock' || moves[0].actionId === 'meld' || moves[0].actionId === 'rummyDiscard') {
    const hand = state.zones[`hand:${playerId}`] || [];
    const order = state.definition.deck.rankOrder;
    const idxOf = (rank: string) => order.indexOf(rank as never);
    const usefulness = (rank: string, suit: string, self = true) => {
      const sameRank = hand.filter((c) => c.rank === rank).length - (self ? 1 : 0);
      const neighbour = hand.some((c) => c.suit === suit && Math.abs(idxOf(c.rank) - idxOf(rank)) === 1) ? 1 : 0;
      return sameRank * 2 + neighbour;
    };

    if (moves.some((m) => m.actionId === 'drawStock')) {
      const discardZone = state.definition.zones.find((z) => z.visibility === 'top-public');
      const top = discardZone ? state.zones[discardZone.id]?.[state.zones[discardZone.id].length - 1] : undefined;
      const takeDiscard = !!top && moves.some((m) => m.actionId === 'drawDiscard') && usefulness(top.rank, top.suit, false) > 0;
      return { move: { actionId: takeDiscard ? 'drawDiscard' : 'drawStock' }, botSeed };
    }

    const meld = moves.find((m) => m.actionId === 'meld');
    if (meld) return { move: meld, botSeed };
    const discards = moves.filter((m) => m.actionId === 'rummyDiscard');
    if (mode === 'random') { const r = nextRandom(botSeed); return { move: discards[Math.floor(r.value * discards.length)], botSeed: r.state }; }
    const score = (id?: string) => { const c = hand.find((x) => x.id === id); return c ? usefulness(c.rank, c.suit) * 10 - idxOf(c.rank) : 0; };
    let best = discards[0];
    for (const m of discards) if (score(m.cardId) < score(best.cardId)) best = m;
    return { move: best, botSeed };
  }

  // Fishing (Go Fish): draw when told to; otherwise ask for the rank you hold most of.
  if (moves[0].actionId === 'fishDraw' || moves[0].actionId === 'ask') {
    if (moves[0].actionId === 'fishDraw') return { move: moves[0], botSeed };
    if (mode === 'random') { const r = nextRandom(botSeed); return { move: moves[Math.floor(r.value * moves.length)], botSeed: r.state }; }
    const hand = state.zones[`hand:${playerId}`] || [];
    const counts: Record<string, number> = {};
    for (const c of hand) counts[c.rank] = (counts[c.rank] ?? 0) + 1;
    let best = moves[0];
    for (const m of moves) if ((counts[m.rank!] ?? 0) > (counts[best.rank!] ?? 0)) best = m;
    return { move: best, botSeed };
  }

  // Climbing (President): play the lowest card that beats the pile, else pass.
  if (moves[0].actionId === 'climbPlay' || moves[0].actionId === 'climbPass') {
    if (mode === 'random') { const r = nextRandom(botSeed); return { move: moves[Math.floor(r.value * moves.length)], botSeed: r.state }; }
    const plays = moves.filter((m) => m.actionId === 'climbPlay');
    if (plays.length === 0) return { move: moves[0], botSeed };
    const hand = state.zones[`hand:${playerId}`] || [];
    const order = state.definition.climb!.order;
    const rankOf = (id?: string) => { const c = hand.find((x) => x.id === id); return c ? order.indexOf(c.rank as never) : 999; };
    let best = plays[0];
    for (const m of plays) if (rankOf(m.cardId) < rankOf(best.cardId)) best = m;
    return { move: best, botSeed };
  }

  // From here down is the shedding/matching family.
  const plays = moves.filter((m) => m.actionId === 'playCard');
  if (plays.length === 0) return { move: moves[0], botSeed }; // only a draw is available

  // Easy mode: pick any legal move uniformly at random.
  if (mode === 'random') {
    const r = nextRandom(botSeed);
    return { move: moves[Math.floor(r.value * moves.length)], botSeed: r.state };
  }

  const hand = state.zones[`hand:${playerId}`] || [];
  const rankOf = (id?: string) => hand.find((c) => c.id === id)?.rank ?? '';

  // Prefer non-wild high cards first; keep 8s (wild) for last.
  const scored = plays.map((m) => {
    const rank = rankOf(m.cardId);
    let score = 0;
    if (rank === '8') score -= 100;          // save wilds
    else if (HIGH.has(rank)) score += 10;    // dump high pip values early
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // Small deterministic tie-break jitter via the bot seed (keeps solo play varied but reproducible).
  const r = nextRandom(botSeed);
  const top = scored.filter((s) => s.score === scored[0].score);
  const pick = top[Math.floor(r.value * top.length)] || scored[0];
  return { move: pick.m, botSeed: r.state };
}
