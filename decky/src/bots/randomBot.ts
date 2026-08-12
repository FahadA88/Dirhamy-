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

  const plays = moves.filter((m) => m.actionId === 'playCard');
  if (plays.length === 0) {
    // Only drawing is possible.
    return { move: moves[0], botSeed };
  }

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
