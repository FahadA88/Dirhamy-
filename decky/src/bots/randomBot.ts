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

  // Euchre auction: take a suit only when the hand is genuinely strong in it. Count the two
  // bowers, then trump aces/kings; go alone on a near-lock.
  if (moves.some((m) => m.actionId === 'orderUp' || m.actionId === 'nameTrump' || m.actionId === 'passBid')) {
    if (mode === 'random') { const r = nextRandom(botSeed); return { move: moves[Math.floor(r.value * moves.length)], botSeed: r.state }; }
    const hand = state.zones[`hand:${playerId}`] || [];
    const sameColour: Record<string, string> = { C: 'S', S: 'C', H: 'D', D: 'H' };
    const strengthIn = (suit: string) => {
      let v = 0;
      for (const c of hand) {
        if (c.rank === 'J' && c.suit === suit) v += 4;
        else if (c.rank === 'J' && c.suit === sameColour[suit]) v += 3;
        else if (c.suit === suit) v += c.rank === 'A' ? 2 : c.rank === 'K' ? 1.5 : 1;
        else if (c.rank === 'A') v += 0.5;
      }
      return v;
    };
    const bids = moves.filter((m) => m.actionId === 'orderUp' || m.actionId === 'nameTrump');
    let best: Move | null = null;
    let bestV = 0;
    for (const m of bids) {
      if (m.alone) continue;
      const v = strengthIn(m.choice!);
      if (v > bestV) { bestV = v; best = m; }
    }
    const canPass = moves.some((m) => m.actionId === 'passBid');
    // On the dealer's forced last call there is no pass — take the best suit going.
    if (!best) return { move: canPass ? { actionId: 'passBid' } : bids[0], botSeed };
    if (bestV < 6.5 && canPass) return { move: { actionId: 'passBid' }, botSeed };
    if (bestV >= 10.5) {
      const solo = moves.find((m) => m.actionId === best!.actionId && m.choice === best!.choice && m.alone);
      if (solo) return { move: solo, botSeed };
    }
    return { move: best, botSeed };
  }

  // Dealer's discard after taking the upcard: throw the weakest off-trump card.
  if (moves[0].actionId === 'dealerDiscard') {
    if (mode === 'random') { const r = nextRandom(botSeed); return { move: moves[Math.floor(r.value * moves.length)], botSeed: r.state }; }
    const hand = state.zones[`hand:${playerId}`] || [];
    const order = state.definition.deck.rankOrder;
    const trump = state.trumpSuit;
    const sameColour: Record<string, string> = { C: 'S', S: 'C', H: 'D', D: 'H' };
    const keep = (id?: string) => {
      const c = hand.find((x) => x.id === id);
      if (!c) return 0;
      if (c.rank === 'J' && (c.suit === trump || c.suit === sameColour[trump ?? ''])) return 1000;
      return (c.suit === trump ? 100 : 0) + order.indexOf(c.rank as never);
    };
    let best = moves[0];
    for (const m of moves) if (keep(m.cardId) < keep(best.cardId)) best = m;
    return { move: best, botSeed };
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
    const cfg = state.definition.trick!;
    const order = state.definition.deck.rankOrder;
    const cardOf = (id?: string) => hand.find((x) => x.id === id);
    const strength = (id?: string) => { const c = cardOf(id); if (!c) return 0; const b = order.indexOf(c.rank as never); return c.rank === 'A' ? 100 : b; };

    // Avoidance games (Hearts): the goal is to lose tricks, and to dump penalties when void.
    if (cfg.scoreBy === 'penalty') {
      const pen = (id?: string) => {
        const c = cardOf(id); if (!c) return 0;
        const p = cfg.penaltyPoints ?? {};
        return (p[c.rank] ?? 0) + (p[c.suit] ?? 0) + (p[c.suit + c.rank] ?? 0);
      };
      const following = state.lead ? moves.filter((m) => cardOf(m.cardId)?.suit === state.lead) : [];
      if (state.lead && following.length === 0) {
        // Void in the led suit — this trick is free, so throw the worst card held.
        let best = moves[0];
        for (const m of moves) {
          const better = pen(m.cardId) > pen(best.cardId)
            || (pen(m.cardId) === pen(best.cardId) && strength(m.cardId) > strength(best.cardId));
          if (better) best = m;
        }
        return { move: best, botSeed };
      }
      if (state.lead) {
        // Duck: play the highest card that still stays under the current winner; if every
        // card would take the trick, give up the cheapest one.
        const high = Math.max(...state.trickPlays.filter((t) => t.card.suit === state.lead)
          .map((t) => (t.card.rank === 'A' ? 100 : order.indexOf(t.card.rank as never))));
        const under = following.filter((m) => strength(m.cardId) < high);
        const pool = under.length > 0 ? under : following;
        let best = pool[0];
        for (const m of pool) {
          const better = under.length > 0 ? strength(m.cardId) > strength(best.cardId) : strength(m.cardId) < strength(best.cardId);
          if (better) best = m;
        }
        return { move: best, botSeed };
      }
      // Leading: low cards are safest.
      let best = moves[0];
      for (const m of moves) if (strength(m.cardId) < strength(best.cardId)) best = m;
      return { move: best, botSeed };
    }

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

  // Climbing (President/Big Two): play the lowest legal group that beats the pile, else pass.
  // Out of turn, a bomb is only worth interrupting with if it wins the hand outright.
  if (moves[0].actionId === 'climbPlay' || moves[0].actionId === 'climbPass'
    || moves[0].actionId === 'climbBomb' || moves[0].actionId === 'climbNoBomb') {
    if (mode === 'random') { const r = nextRandom(botSeed); return { move: moves[Math.floor(r.value * moves.length)], botSeed: r.state }; }
    const hand = state.zones[`hand:${playerId}`] || [];
    const order = state.definition.climb!.order;
    const rankOfGroup = (ids?: string[]) => {
      const c = ids?.[0] ? hand.find((x) => x.id === ids[0]) : undefined;
      return c ? order.indexOf(c.rank as never) : 999;
    };

    const bombs = moves.filter((m) => m.actionId === 'climbBomb');

    if (state.players[state.turnIndex] !== playerId) {
      // Out of turn only bombs (or declining) are legal. Interrupt to go out immediately, or
      // in an emergency: somebody else is one play from going out, so steal the lead now.
      const winner = bombs.find((m) => m.cards!.length === hand.length);
      const urgent = state.players.some(
        (p) => p !== playerId && !state.finished.includes(p) && (state.zones[`hand:${p}`]?.length ?? 99) <= 2,
      );
      const pick = winner ?? (urgent ? bombs[0] : undefined);
      return { move: pick ?? { actionId: 'climbNoBomb' }, botSeed };
    }

    const plays = moves.filter((m) => m.actionId === 'climbPlay');
    // Stuck on your own turn is exactly what a bomb is for — spend it rather than pass.
    if (plays.length === 0) {
      if (bombs.length > 0) return { move: bombs[0], botSeed };
      return { move: moves.find((m) => m.actionId === 'climbPass') ?? moves[0], botSeed };
    }
    // When several shapes are legal (leading a fresh pile), shed bigger combos first — a real
    // Big-Two strategy, and it's what makes pairs/triples actually get played in solo/sim play.
    const scoreOf = (m: Move) => rankOfGroup(m.cards) - (m.cards?.length ?? 1) * 1000;
    let best = plays[0];
    for (const m of plays) if (scoreOf(m) < scoreOf(best)) best = m;
    return { move: best, botSeed };
  }

  // Simultaneous pass: give away the most dangerous card — the biggest penalty first, then
  // simply the highest rank.
  if (moves[0].actionId === 'choosePass') {
    if (mode === 'random') { const r = nextRandom(botSeed); return { move: moves[Math.floor(r.value * moves.length)], botSeed: r.state }; }
    const hand = state.zones[`hand:${playerId}`] || [];
    const order = state.definition.deck.rankOrder;
    const p = state.definition.trick?.penaltyPoints ?? {};
    const danger = (id?: string) => {
      const c = hand.find((x) => x.id === id);
      if (!c) return -1;
      const pen = (p[c.rank] ?? 0) + (p[c.suit] ?? 0) + (p[c.suit + c.rank] ?? 0);
      return pen * 100 + order.indexOf(c.rank as never);
    };
    let best = moves[0];
    for (const m of moves) if (danger(m.cardId) > danger(best.cardId)) best = m;
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
