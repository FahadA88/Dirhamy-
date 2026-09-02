import { MatchState, Move } from '../engine/types';
import { legalMoves, handDeadwood, pitCorner, trickTeams, trickValueOf, cardPoints } from '../engine/engine';
import { nextRandom } from '../engine/rng';

// Because the engine enumerates legal moves, a bot works for ANY valid game for free.
// This bot uses a light heuristic: prefer shedding a card over drawing, dump high-value
// cards first, and avoid burning wild 8s until needed.

const HIGH = new Set(['K', 'Q', 'J', '10']);

/**
 * A rough count of likely tricks from a hand: aces and kings, plus a bonus for a long trump
 * suit — the same estimate a bidding bot makes of its own hand, so a player asking "how strong
 * is this?" gets the identical honest read the table's own bots bid from, not a second opinion
 * invented for the occasion (worklist #64). Deliberately not more than that: a real read on a
 * bidding hand also weighs void suits, finesses and what partner is likely to hold, none of
 * which a pre-play count can see — "rough" is the whole promise being made here.
 */
export function estimateTrickWins(state: MatchState, playerId: string): number {
  const hand = state.zones[`hand:${playerId}`] || [];
  const trump = state.definition.trick?.trump;
  let bid = 0;
  for (const c of hand) if (c.rank === 'A' || c.rank === 'K') bid++;
  const trumpCount = trump && trump !== 'none' ? hand.filter((c) => c.suit === trump).length : 0;
  if (trumpCount > 3) bid += trumpCount - 3;
  return bid;
}

/**
 * How hard a bot tries. Underneath there are only two players — the heuristic one and the
 * coin-flipping one — and a tier is how often you get each. That is a real difference in
 * strength rather than a label: an easy bot genuinely throws away good cards.
 *
 * 'smart' and 'random' are the original two names, kept because saved settings and the seat
 * editor still speak them.
 */
export type BotMode = 'easy' | 'normal' | 'hard' | 'smart' | 'random';

/** Chance a tier plays a random legal move instead of its best one. */
const SLIP: Record<BotMode, number> = {
  easy: 1, normal: 0.22, hard: 0, smart: 0, random: 1,
};

export function chooseMove(
  state: MatchState,
  playerId: string,
  botSeed: number,
  tier: BotMode = 'smart',
): { move: Move; botSeed: number } {
  // Resolve the tier into the two modes the rest of this file understands. The draw comes from
  // the bot seed, so a given seed still replays exactly — difficulty does not break determinism.
  let mode: 'smart' | 'random' = 'smart';
  const slip = SLIP[tier] ?? 0;
  if (slip >= 1) mode = 'random';
  else if (slip > 0) {
    const r = nextRandom(botSeed);
    botSeed = r.state;
    if (r.value < slip) mode = 'random';
  }

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

  // Spotting a set. The engine only ever offers valid ones, so the bot's only real decision is
  // how fast it sees them — and a bot that always calls instantly is not an opponent, it is a
  // wall. Easy hesitates far more often than sharp does.
  if (moves[0]?.actionId === 'callSet') {
    const r = nextRandom(botSeed);
    botSeed = r.state;
    // Even at its sharpest it misses sometimes, so a person gets a chance to see one first.
    const miss = mode === 'random' ? 0.85 : 0.45;
    if (r.value < miss) return { move: { actionId: 'setPass' }, botSeed };
    // Having decided to call, actually call — moves also carries a trailing setPass, and picking
    // across the whole array let the bot occasionally pass right after choosing not to.
    const calls = moves.filter((m) => m.actionId === 'callSet');
    const pick = nextRandom(botSeed);
    return { move: calls[Math.floor(pick.value * calls.length)], botSeed: pick.state };
  }

  // A contract auction: bid what the hand can actually carry, and stop.
  //
  // The count is deliberately crude — high cards plus length — because the point is that the
  // bot bids more with a better hand and passes with a bad one, which is what makes an auction
  // a negotiation rather than noise. It will not bid past its own estimate, so auctions close.
  if (moves.some((m) => m.actionId === 'contractBid')) {
    if (mode === 'random') { const r = nextRandom(botSeed); return { move: moves[Math.floor(r.value * moves.length)], botSeed: r.state }; }
    const hand = state.zones[`hand:${playerId}`] || [];
    const points = hand.reduce((a, c) => a + (c.rank === 'A' ? 4 : c.rank === 'K' ? 3 : c.rank === 'Q' ? 2 : c.rank === 'J' ? 1 : 0), 0);
    const bySuit: Record<string, number> = { C: 0, D: 0, H: 0, S: 0 };
    for (const c of hand) if (c.suit in bySuit) bySuit[c.suit]++;
    const best = (Object.keys(bySuit) as string[]).sort((a, b) => bySuit[b] - bySuit[a])[0];
    // Roughly: a third of a trick per high-card point, plus anything past a third of the hand
    // in one suit. Scaled to the hand actually dealt rather than to a thirteen-card one.
    const longAt = Math.max(3, Math.ceil(hand.length / 3));
    const canTake = Math.floor(points / 3) + Math.max(0, bySuit[best] - longAt);
    // The book comes from the definition, not from Bridge: a short deal may have none, in which
    // case the level IS the promise. Assuming six here made every bot pass on every hand.
    const book = state.definition.trick?.numericAuction?.book ?? 0;
    const auction = state.definition.trick?.numericAuction;
    const pass = moves.find((m) => m.actionId === 'passBid');
    const allBids = moves.filter((m) => m.actionId === 'contractBid');
    // Passing is not always on offer — a stuck dealer (numericAuction.dealerMustBid) has nothing
    // but bids to choose from, however weak the hand. Falling back to `pass` here would hand
    // applyMove an undefined move and freeze the whole match, so a bot with no real choice picks
    // whatever it's given rather than the estimate it would otherwise have walked away from.
    const giveUp = (): { move: Move; botSeed: number } => {
      if (pass) return { move: pass, botSeed };
      const inSuit = allBids.filter((m) => m.strain === best);
      return { move: (inSuit.length ? inSuit : allBids)[0], botSeed };
    };

    /*
      A level is not always a number of tricks.

      Where the contract is settled on card points, the level is what the hand is WORTH — Skat
      bids run 18 upwards — and comparing that to an estimate of six or seven tricks meant
      nothing was ever affordable and every bot passed on every hand, forever. So no contract
      was ever made and the match could not reach its target at all.

      For those games, judge the hand by the point-carrying cards in it and bid that far up the
      auction's own range instead.
    */
    if (auction?.makeOnCardPoints) {
      const pts = state.definition.trick?.penaltyPoints ?? {};
      const carried = hand.reduce((a, c) => a + (pts[c.rank] ?? 0) + (pts[c.suit + c.rank] ?? 0), 0);
      // Jacks are worth little on their own but win tricks outright wherever they are trumps.
      const jacks = state.definition.trick?.jacksAreTrumps ? hand.filter((c) => c.rank === 'J').length : 0;
      const strength = carried + jacks * 8;
      // A hand carrying about a third of the pack's points is worth opening on; one carrying
      // half is worth pushing.
      const share = Math.max(0, Math.min(1, (strength - 25) / 35));
      if (share <= 0) return giveUp();
      const span = auction.maxLevel - auction.minLevel;
      const ceiling = auction.minLevel + Math.round(share * span);
      const canBid = moves.filter((m) => m.actionId === 'contractBid' && (m.level ?? 0) <= ceiling);
      if (canBid.length === 0) return giveUp();
      // The highest affordable bid, in the suit the hand is longest in.
      const inSuit = canBid.filter((m) => m.strain === best);
      return { move: (inSuit.length ? inSuit : canBid).slice(-1)[0], botSeed };
    }

    const wantLevel = canTake - book;
    if (wantLevel < 1) return giveUp();
    // The strongest bid at or below what the hand is worth, preferring the long suit.
    const affordable = moves.filter((m) => m.actionId === 'contractBid' && (m.level ?? 9) <= wantLevel);
    if (affordable.length === 0) return giveUp();
    const inBest = affordable.filter((m) => m.strain === best);
    const pick = (inBest.length ? inBest : affordable).slice(-1)[0];
    return { move: pick, botSeed };
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
    // Item 17 of the audit pass: on the dealer's forced last call (stick-the-dealer — no pass
    // available) with no hand strong enough to prefer, the bot used to always take bids[0] —
    // always the same suit, since the move list's order never changes. A fair coin flip instead.
    if (!best) {
      if (!canPass) { const r = nextRandom(botSeed); return { move: bids[Math.floor(r.value * bids.length)], botSeed: r.state }; }
      return { move: { actionId: 'passBid' }, botSeed };
    }
    if (bestV < 6.5 && canPass) return { move: { actionId: 'passBid' }, botSeed };
    if (bestV >= 10.5) {
      const solo = moves.find((m) => m.actionId === best!.actionId && m.choice === best!.choice && m.alone);
      if (solo) return { move: solo, botSeed };
    }
    return { move: best, botSeed };
  }

  // Dealer's discard after taking the upcard, or the contract winner burying the kitty back
  // down: throw the weakest off-trump card. The kitty bury happens before trump is officially
  // set (see settleContract), so fall back to the winning bid's own strain — the same trump the
  // hand is about to be played in, just not written into state.trumpSuit yet.
  if (moves[0].actionId === 'dealerDiscard' || moves[0].actionId === 'buryDiscard') {
    if (mode === 'random') { const r = nextRandom(botSeed); return { move: moves[Math.floor(r.value * moves.length)], botSeed: r.state }; }
    const hand = state.zones[`hand:${playerId}`] || [];
    const order = state.definition.deck.rankOrder;
    const trump = state.highBid?.strain ?? state.trumpSuit;
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
  //
  // A weaker bot mis-reads its hand; it does not lose its mind. Picking uniformly from the
  // legal bids — which is what the slip used to do here — had easy bots bidding thirteen,
  // claiming every trick in the hand, several times a match. That is not a worse player, it
  // is a broken one, and it makes the scorepad nonsense. So the estimate is always made, and
  // a slip moves it by a trick or two instead of replacing it.
  if (moves[0].actionId === 'bid') {
    let bid = estimateTrickWins(state, playerId);
    if (mode === 'random') {
      const r = nextRandom(botSeed);
      botSeed = r.state;
      bid += Math.floor(r.value * 5) - 2;          // out by up to two tricks either way
    }
    bid = Math.max(0, Math.min(bid, moves.length - 1));
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

    /*
      Games where tricks are the point (Spades, Euchre, Contract Whist).

      This used to be one line — play the lowest legal card, always — which meant a bot that
      had just bid five tricks, or won a contract at level four, played every hand exactly as
      if it were trying to lose. The bid was a promise nothing downstream ever tried to keep,
      and since bidding is the whole point of all three of those games, that quietly hollowed
      them out.

      The policy now is the ordinary one a person plays: work out whether you still need
      tricks, then either try to win the trick as cheaply as you can or get out of it as
      cheaply as you can. `trickValueOf` is the referee's own comparison, so the bot's idea of
      "would this take it" is right about trump, about bowers, and about a discard being worth
      nothing — the three places a hand-rolled guess goes wrong.
    */
    const teams = trickTeams(state);
    const myTeam = teams.find((t) => t.includes(playerId)) ?? [playerId];
    const partnerWinning = state.trickPlays.length > 0 && (() => {
      let lead = state.trickPlays[0];
      for (const p of state.trickPlays) if (trickValueOf(state, p.card) > trickValueOf(state, lead.card)) lead = p;
      return lead.player !== playerId && myTeam.includes(lead.player);
    })();
    const highSoFar = state.trickPlays.length > 0
      ? Math.max(...state.trickPlays.map((t) => trickValueOf(state, t.card)))
      : -1;

    /*
      Do we still want tricks?

      Three different games ask this three different ways. Spades hands every seat its own
      number, and an overtrick past the team's total is a bag rather than a prize. Contract
      Whist gives one side a promise via the auction — `highBid`, not `bids`, which is a
      separate field entirely — and the defenders want every trick they can take because each
      one is an undertrick the other side pays for. Euchre names a maker but no number, so
      tricks are simply the score.
    */
    const teamTricks = myTeam.reduce((n, p) => n + (state.tricksWon[p] ?? 0), 0);
    const contract = state.highBid;
    let wantTricks: boolean;
    if (state.bids?.[playerId] === 0) {
      // A nil bid is the opposite instruction: take nothing at all.
      wantTricks = false;
    } else if (contract) {
      const declaring = teams.find((t) => t.includes(contract.player)) ?? [contract.player];
      if (declaring.includes(playerId)) {
        const need = contract.level + (state.definition.trick?.numericAuction?.book ?? 0);
        wantTricks = declaring.reduce((n, p) => n + (state.tricksWon[p] ?? 0), 0) < need;
      } else {
        wantTricks = true;   // every trick the defence takes is one the contract is short
      }
    } else if (state.bids) {
      const teamBid = myTeam.reduce((n, p) => n + (state.bids![p] ?? 0), 0);
      wantTricks = teamTricks < teamBid;
    } else {
      wantTricks = true;
    }

    const val = (id?: string) => { const c = cardOf(id); return c ? trickValueOf(state, c) : -1; };
    const winners = moves.filter((m) => val(m.cardId) > highSoFar);
    const losers = moves.filter((m) => val(m.cardId) <= highSoFar);

    const cheapestOf = (pool: Move[]) => {
      let pick = pool[0];
      for (const m of pool) if (val(m.cardId) < val(pick.cardId)) pick = m;
      return pick;
    };
    const dearestOf = (pool: Move[]) => {
      let pick = pool[0];
      for (const m of pool) if (val(m.cardId) > val(pick.cardId)) pick = m;
      return pick;
    };

    // Leading, with nothing down yet: lead your best when you need tricks, your worst when
    // you are trying not to take any more.
    if (state.trickPlays.length === 0) {
      return { move: wantTricks ? dearestOf(moves) : cheapestOf(moves), botSeed };
    }

    // Partner already has it — no reason to spend a card beating your own side.
    if (partnerWinning) return { move: cheapestOf(moves), botSeed };

    if (wantTricks && winners.length > 0) {
      // Take it, but with the cheapest card that actually does.
      return { move: cheapestOf(winners), botSeed };
    }
    // Either the trick is not worth taking or nothing here can take it: throw the least useful
    // card. Falling back to `moves` matters — when every legal card would win, one must be played.
    return { move: cheapestOf(losers.length > 0 ? losers : moves), botSeed };
  }

  // Rummy: draw the discard when it connects with the hand; meld greedily; discard the least
  // useful card (one with no rank-mate and no same-suit neighbour).
  if (moves[0].actionId === 'drawStock' || moves[0].actionId === 'meld'
    || moves[0].actionId === 'rummyDiscard' || moves[0].actionId === 'knock' || moves[0].actionId === 'layOff') {
    const hand = state.zones[`hand:${playerId}`] || [];
    const order = state.definition.deck.rankOrder;
    const idxOf = (rank: string) => order.indexOf(rank as never);
    const usefulness = (rank: string, suit: string, self = true) => {
      const sameRank = hand.filter((c) => c.rank === rank).length - (self ? 1 : 0);
      const neighbour = hand.some((c) => c.suit === suit && Math.abs(idxOf(c.rank) - idxOf(rank)) === 1) ? 1 : 0;
      return sameRank * 2 + neighbour;
    };

    const isGin = state.definition.rummy!.knock !== undefined;

    if (moves.some((m) => m.actionId === 'drawStock')) {
      const discardZone = state.definition.zones.find((z) => z.visibility === 'top-public');
      const top = discardZone ? state.zones[discardZone.id]?.[state.zones[discardZone.id].length - 1] : undefined;
      const canTake = !!top && moves.some((m) => m.actionId === 'drawDiscard');
      // Gin: take the discard only if it actually lowers what the hand would be left holding.
      if (isGin) {
        const take = canTake && handDeadwood(state, [...hand, top!]) < handDeadwood(state, hand);
        return { move: { actionId: take ? 'drawDiscard' : 'drawStock' }, botSeed };
      }
      const takeDiscard = canTake && usefulness(top!.rank, top!.suit, false) > 0;
      return { move: { actionId: takeDiscard ? 'drawDiscard' : 'drawStock' }, botSeed };
    }

    // Gin: knocking is the whole game — take it whenever it's offered, preferring the throw
    // that leaves the least deadwood behind.
    const knocks = moves.filter((m) => m.actionId === 'knock');
    if (knocks.length > 0) {
      if (mode === 'random') { const r = nextRandom(botSeed); return { move: knocks[Math.floor(r.value * knocks.length)], botSeed: r.state }; }
      const value = (id?: string) => { const c = hand.find((x) => x.id === id); return c ? (c.rank === 'A' ? 1 : ['J', 'Q', 'K'].includes(c.rank) ? 10 : parseInt(c.rank, 10) || 0) : 0; };
      let best = knocks[0];
      for (const m of knocks) if (value(m.cardId) > value(best.cardId)) best = m;
      return { move: best, botSeed };
    }

    const meld = moves.find((m) => m.actionId === 'meld');
    if (meld) return { move: meld, botSeed };
    const lay = moves.find((m) => m.actionId === 'layOff');
    if (lay) return { move: lay, botSeed };
    const discards = moves.filter((m) => m.actionId === 'rummyDiscard');
    if (mode === 'random') { const r = nextRandom(botSeed); return { move: discards[Math.floor(r.value * discards.length)], botSeed: r.state }; }

    // Gin: throw whichever card leaves the least deadwood behind, breaking ties on card value.
    if (isGin) {
      let best = discards[0];
      let bestScore = Infinity;
      for (const m of discards) {
        const rest = hand.filter((c) => c.id !== m.cardId);
        const c = hand.find((x) => x.id === m.cardId);
        const value = c ? (c.rank === 'A' ? 1 : ['J', 'Q', 'K'].includes(c.rank) ? 10 : parseInt(c.rank, 10) || 0) : 0;
        const sc = handDeadwood(state, rest) * 100 - value;
        if (sc < bestScore) { bestScore = sc; best = m; }
      }
      return { move: best, botSeed };
    }

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

  // Bluff: challenge sometimes (never deterministically always/never, or the same claim and
  // the same response repeat forever), otherwise dump your largest real group under its own
  // true rank — a bot that never lies still makes real progress and gives the AI simulator (and
  // a human opponent) something honest to either catch or not bother challenging.
  if (moves.some((m) => m.actionId === 'bluffClaim' || m.actionId === 'bluffChallenge')) {
    const challenge = moves.find((m) => m.actionId === 'bluffChallenge');
    const claims = moves.filter((m) => m.actionId === 'bluffClaim');
    if (challenge && claims.length === 0) return { move: challenge, botSeed };
    const r = nextRandom(botSeed);
    if (challenge && r.value < 0.3) return { move: challenge, botSeed: r.state };
    let best = claims[0];
    for (const m of claims) {
      const truthful = m.cards?.length && state.zones[`hand:${playerId}`]?.find((c) => c.id === m.cards![0])?.rank === m.claimedRank;
      const bestTruthful = best.cards?.length && state.zones[`hand:${playerId}`]?.find((c) => c.id === best.cards![0])?.rank === best.claimedRank;
      if ((m.cards?.length ?? 0) > (best.cards?.length ?? 0) || (truthful && !bestTruthful)) best = m;
    }
    return { move: best, botSeed: r.state };
  }

  // Reflex: a slap on offer is always the right move; otherwise the only choice is to flip.
  if (moves.some((m) => m.actionId === 'reflexSlap' || m.actionId === 'reflexFlip')) {
    const slap = moves.find((m) => m.actionId === 'reflexSlap');
    return { move: slap ?? moves[0], botSeed };
  }

  // Poker: fold weak hands facing a real bet, otherwise check/call; raise occasionally with a
  // strong-looking hand (a pair or better among your own cards is all a bot can see).
  if (moves.some((m) => m.actionId?.startsWith('poker'))) {
    const hand = state.zones[`hand:${playerId}`] || [];
    const counts: Record<string, number> = {};
    for (const c of hand) counts[c.rank] = (counts[c.rank] ?? 0) + 1;
    const strong = Object.values(counts).some((n) => n >= 2);
    const toCall = moves.some((m) => m.actionId === 'pokerCall');
    const r = nextRandom(botSeed);
    if (!toCall) {
      const bet = moves.find((m) => m.actionId === 'pokerBet');
      if (strong && bet && r.value < 0.5) return { move: bet, botSeed: r.state };
      return { move: moves.find((m) => m.actionId === 'pokerCheck') ?? moves[0], botSeed: r.state };
    }
    if (!strong && r.value < 0.55) return { move: moves.find((m) => m.actionId === 'pokerFold') ?? moves[0], botSeed: r.state };
    const raise = moves.find((m) => m.actionId === 'pokerRaise');
    if (strong && raise && r.value < 0.3) return { move: raise, botSeed: r.state };
    return { move: moves.find((m) => m.actionId === 'pokerCall') ?? moves.find((m) => m.actionId === 'pokerFold') ?? moves[0], botSeed: r.state };
  }

  // Kent. Three things matter and they are all about the tell.
  //
  // Your partner has signalled: call it, that is the whole game. An opponent has signalled:
  // call it off — but not every time, because a bot that never misses a tell is not an
  // opponent, it is a wall, and spotting one is the only thing a person is actually racing.
  // Nothing showing: collect. Pick the rank you hold most of and trade towards it.
  /*
    Kings Corner. Empty your hand, and prefer the plays that keep you able to.

    The ordering is the whole strategy: get rid of the biggest cards first, because a king can
    only ever go in a corner and a queen only on a king, so the high cards are the ones that run
    out of places to be. Opening a corner is worth doing the moment you can — it is a place to
    put things that did not exist a second ago. Consolidating two piles is worth doing after
    that, because it frees a space, and free spaces take anything.

    Stopping is last, and only when there is nothing else, because every card left in hand is a
    card somebody else is going to go out ahead of you with.
  */
  /*
    Old Maid. Every move is a position in a hand nobody, including this bot, can see into — so
    there is no "smart" pick, and pretending otherwise would be inventing information that does
    not exist. Uniform random over the offered positions is not a fallback here, it is the
    correct policy.
  */
  if (moves.length > 0 && moves[0].actionId === 'maidDraw') {
    const r = nextRandom(botSeed);
    botSeed = r.state;
    return { move: moves[Math.floor(r.value * moves.length)], botSeed };
  }

  /*
    Dutch. The bot is held to the same knowledge a person would have: it only trusts
    `state.seen[playerId]`, never the raw grid, because the engine state handed to a bot is the
    unredacted truth and reading straight off it would be the bot cheating at its own memory
    game. An unseen slot is scored at the deck's average value — about seven — which is what
    "I have no idea" is worth in expectation.
  */
  if (moves.some((m) => m.actionId?.startsWith('swap'))) {
    const cfg = state.definition.swap;
    if (cfg) {
      const seen = new Set(state.seen?.[playerId] ?? []);
      const myGrid = state.zones[`grid:${playerId}`] || [];
      const valueOf = (c: import('../engine/types').Card | undefined): number => {
        if (!c) return 7;
        if (!seen.has(c.id)) return 7;
        return cardPoints(state.definition.scoring, c);
      };
      const known = (grid: import('../engine/types').Card[]) =>
        grid.reduce((a, c) => a + (seen.has(c.id) ? valueOf(c) : 0), 0);
      const myKnownTotal = myGrid.reduce((a, c) => a + valueOf(c), 0);

      const power = moves.find((m) => m.actionId === 'swapPeekSelf'
        || m.actionId === 'swapPeekOther' || m.actionId === 'swapBlind');
      if (power) {
        if (power.actionId === 'swapPeekSelf') {
          // Look at the slot you know least about.
          const unseen = moves.filter((m) => m.actionId === 'swapPeekSelf'
            && !seen.has(myGrid[m.slot ?? 0]?.id));
          return { move: (unseen[0] ?? power), botSeed };
        }
        /*
          Which opponent gets peeked or swapped is picked at random, not "the first name in the
          seat list that is not me" — which is what `moves.find`/`moves[0]` would have done,
          because `swapLegalMoves` builds the option list by walking `state.players` in order.
          Taking the first option every time meant one seat (whichever is NOT early in that
          array relative to most other seats) was targeted far less often than the others: self-
          play at three seats showed it winning two-thirds of matches on a genuinely lower
          average score, purely because it was left alone far more than it was attacked.
        */
        if (power.actionId === 'swapPeekOther') {
          const options = moves.filter((m) => m.actionId === 'swapPeekOther');
          const r = nextRandom(botSeed);
          botSeed = r.state;
          return { move: options[Math.floor(r.value * options.length)] ?? power, botSeed };
        }
        // A blind swap: give away the worst of what you know. Which opponent and which of
        // their slots comes back is picked at random for the same reason — neither side can
        // see it, so no target is strategically better, and picking one consistently is a bug
        // dressed up as a decision.
        const worstMineIdx = myGrid.reduce((best, c, i) =>
          valueOf(c) > valueOf(myGrid[best]) ? i : best, 0);
        const targets = moves.filter((m) => m.actionId === 'swapBlind' && m.slot === worstMineIdx);
        const r = nextRandom(botSeed);
        botSeed = r.state;
        return { move: targets[Math.floor(r.value * targets.length)] ?? power, botSeed };
      }

      const place = moves.filter((m) => m.actionId === 'swapPlace');
      if (place.length > 0 && state.held) {
        const heldVal = cardPoints(state.definition.scoring, state.held.card);
        // Only worth placing where it beats what might already be there — trade in for the
        // worst KNOWN card first, and treat an unseen slot as an average card, not a safe one.
        let best = place[0];
        let bestGain = -Infinity;
        for (const m of place) {
          const there = myGrid[m.slot ?? 0];
          const gain = valueOf(there) - heldVal;
          if (gain > bestGain) { bestGain = gain; best = m; }
        }
        if (bestGain > 0) return { move: best, botSeed };
        const throwIt = moves.find((m) => m.actionId === 'swapThrow');
        if (throwIt) return { move: throwIt, botSeed };
        return { move: best, botSeed };
      }

      const take = moves.find((m) => m.actionId === 'swapTakeDiscard');
      const drawStock = moves.find((m) => m.actionId === 'swapDrawStock');
      const call = moves.find((m) => m.actionId === 'swapCall');

      // Calling: worth it once the hand you actually know about is cheap and there is not much
      // of the round left to improve it.
      if (call && known(myGrid) <= 6 && myKnownTotal <= cfg.slots * 4) {
        return { move: call, botSeed };
      }

      const discardTop = (state.zones['discard'] || []).slice(-1)[0];
      if (take && discardTop && cardPoints(state.definition.scoring, discardTop) <= 3) {
        return { move: take, botSeed };
      }
      if (drawStock) return { move: drawStock, botSeed };
      if (take) return { move: take, botSeed };
      if (call) return { move: call, botSeed };
    }
  }

  if (moves.some((m) => m.actionId === 'layoutPlay' || m.actionId === 'layoutDone'
    || m.actionId === 'layoutDraw')) {
    const draw = moves.find((m) => m.actionId === 'layoutDraw');
    if (draw) return { move: draw, botSeed };

    const cfg = state.definition.layout!;
    const order = state.definition.deck.rankOrder as readonly string[];
    const plays = moves.filter((m) => m.actionId === 'layoutPlay');
    if (plays.length > 0) {
      const hand = state.zones[`hand:${playerId}`] || [];
      let best = plays[0];
      let bestScore = -1;
      for (const m of plays) {
        const card = hand.find((c) => c.id === m.cardId);
        if (!card) continue;
        const idx = Number((m.to ?? '').split(':')[1]);
        const opening = idx >= cfg.piles && (state.zones[m.to ?? ''] || []).length === 0;
        // Opening a corner beats anything; after that, spend the highest card you can.
        const score = (opening ? 1000 : 0) + order.indexOf(card.rank);
        if (score > bestScore) { bestScore = score; best = m; }
      }
      return { move: best, botSeed };
    }

    const consolidate = moves.find((m) => m.actionId === 'layoutMove');
    if (consolidate) return { move: consolidate, botSeed };

    const done = moves.find((m) => m.actionId === 'layoutDone');
    if (done) return { move: done, botSeed };
  }

  if (moves.some((m) => m.actionId === 'kentCall' || m.actionId === 'kentStop'
    || m.actionId === 'kentSignal' || m.actionId === 'kentSwap')) {
    const call = moves.find((m) => m.actionId === 'kentCall');
    if (call) return { move: call, botSeed };
    const stop = moves.find((m) => m.actionId === 'kentStop');
    if (stop) {
      const r = nextRandom(botSeed);
      // Even at its sharpest it looks away sometimes: a bot that never misses a tell is not an
      // opponent, and spotting one is the only thing a person is racing it for.
      const miss = mode === 'random' ? 0.75 : 0.3;
      if (r.value >= miss) return { move: stop, botSeed: r.state };
      return { move: { actionId: 'kentWait' }, botSeed: r.state };
    }
    const waiting = moves.find((m) => m.actionId === 'kentWait');
    if (waiting) return { move: waiting, botSeed };
    const signal = moves.find((m) => m.actionId === 'kentSignal');
    if (signal) return { move: signal, botSeed };

    const hand = state.zones[`hand:${playerId}`] || [];
    const pool = state.zones['kent:pool'] || [];
    const count = (rank: string, without?: string) =>
      hand.filter((c) => c.rank === rank && c.id !== without).length;

    // Collect what the table can actually give you, and know when to give up on a rank.
    //
    // Holding out for the fourth king is how a person plays and it is also how four bots lock
    // a game solid: three of them sit on three of a kind, the fourth card of each is in
    // somebody else's hand, and no swap on earth improves anyone. Left like that they traded
    // equivalent cards back and forth for four thousand moves without a single pile changing.
    //
    // So: take a swap only if it makes your biggest pile bigger. If nothing does, the table
    // cannot help — turn it over. And every so often, when turning it over has not helped
    // either, break your own pile up and start again on a rank the table is actually offering,
    // which is precisely what a player does when they work out the card is not coming.
    const mine = Math.max(0, ...hand.map((c) => count(c.rank)));
    let best: Move | null = null;
    let bestScore = mine;
    for (const m of moves) {
      if (m.actionId !== 'kentSwap') continue;
      const taken = pool.find((c) => c.id === m.poolId);
      const given = hand.find((c) => c.id === m.cardId);
      if (!taken || !given) continue;
      const after = count(taken.rank, m.cardId) + 1;
      const kept = Math.max(after, ...hand.filter((c) => c.id !== m.cardId).map((c) => count(c.rank, m.cardId)));
      if (kept > bestScore) { bestScore = kept; best = m; }
    }
    if (best) return { move: best, botSeed };

    const refresh = moves.find((m) => m.actionId === 'kentRefresh');
    const r = nextRandom(botSeed);
    const swapMoves = moves.filter((m) => m.actionId === 'kentSwap').map((m) => {
      const taken = pool.find((c) => c.id === m.poolId);
      const given = hand.find((c) => c.id === m.cardId);
      return { m, gain: taken ? count(taken.rank, m.cardId) : -1, shed: given ? count(given.rank) : 9 };
    });

    // Giving up on the rank. Rarely, and on purpose: break your own pile and start again on
    // whatever the table is offering. Without it four bots sit on three of a kind each with
    // the fourth of every rank in somebody else's hand, and no swap on earth improves anyone.
    if (r.value < 0.15 && swapMoves.length > 0) {
      const give = swapMoves.slice().sort((a, b) => b.gain - a.gain || b.shed - a.shed)[0];
      return { move: give.m, botSeed: r.state };
    }
    // Turning the table over is what brings ranks that are not yet in play into play, so it has
    // to happen often or nobody ever completes anything. But three bots doing it in rotation and
    // nothing else is forty seconds of a game log saying nothing happened, so half the time
    // keep the pile and trade away your loneliest card instead — the cards still move, and the
    // table still comes round often enough for the game to finish.
    const r2 = nextRandom(r.state);
    const useless = !pool.some((c) => count(c.rank) > 0);
    if (refresh && (useless || r2.value < 0.5)) return { move: refresh, botSeed: r2.state };
    if (swapMoves.length > 0) {
      const keep = swapMoves.slice().sort((a, b) => b.gain - a.gain || a.shed - b.shed)[0];
      return { move: keep.m, botSeed: r2.state };
    }
    if (refresh) return { move: refresh, botSeed: r2.state };

    const swaps = moves.filter((m) => m.actionId === 'kentSwap');
    if (swaps.length === 0) return { move: moves[0], botSeed };
    const lonely = swaps.slice().sort((a, b) => {
      const ca = hand.find((c) => c.id === a.cardId); const cb = hand.find((c) => c.id === b.cardId);
      return count(ca?.rank ?? '') - count(cb?.rank ?? '');
    })[0];
    return { move: lonely, botSeed };
  }

  // Pit: take a trade that's actually on the table before ever posting a new one — otherwise
  // every player just keeps re-offering and the market grows forever without a single trade
  // landing. Only post a fresh offer, in your scarcest suit, when nothing is acceptable and you
  // don't already have too many of your own sitting open.
  if (moves.some((m) => m.actionId === 'pitOffer' || m.actionId === 'pitAccept' || m.actionId === 'pitCancel')) {
    const r = nextRandom(botSeed);
    const hand = state.zones[`hand:${playerId}`] || [];
    const held: Record<string, number> = {};
    for (const c of hand) held[c.suit] = (held[c.suit] ?? 0) + 1;
    // The commodity you are collecting: whatever you already hold most of. Without this the
    // bots accepted anything going, so every trade undid the last one and no corner was ever
    // assembled — four thousand random trades a game and the only finishes were hands that had
    // been dealt a corner outright.
    const suits = ['C', 'D', 'H', 'S'];
    const byHolding = suits.slice().sort((a, b) => (held[b] ?? 0) - (held[a] ?? 0));
    // Who else is collecting what is public: an open offer asking for hearts is somebody saying
    // they want hearts. Two players quietly chasing the same commodity is a permanent deadlock —
    // neither will ever hand the other a card of it — so back off a suit somebody else has
    // already called, unless you are nearly home in it yourself.
    const claimed = new Set(state.market.filter((o) => o.player !== playerId).map((o) => o.want));
    const goal = pitCorner(state);
    const target = byHolding.find((sut) => !claimed.has(sut as never) || (held[sut] ?? 0) >= goal - 2)
      ?? byHolding[0];

    // Take a trade only when it moves you towards that suit: you receive your commodity and pay
    // in something else.
    const accepts = moves
      .filter((m) => m.actionId === 'pitAccept')
      .map((m) => ({ m, o: state.market.find((x) => x.id === m.offerId) }))
      .filter((x) => x.o && x.o.give === target && x.o.want !== target)
      .sort((a, b) => (b.o!.count - a.o!.count));
    if (accepts.length > 0) return { move: accepts[0].m, botSeed: r.state };

    // Nothing worth taking. Post your own, paying with the suit you have least use for.
    const mine = state.market.filter((o) => o.player === playerId);
    const spare = suits
      .filter((sut) => sut !== target && (held[sut] ?? 0) > 0)
      .sort((a, b) => (held[a] ?? 0) - (held[b] ?? 0));
    const wanted = moves.filter((m) => m.actionId === 'pitOffer' && m.want === target
      && m.give !== target && spare.includes(String(m.give)));
    if (mine.length < 2 && wanted.length > 0) {
      // Small parcels. A trade only happens if someone can fill the exact count asked for, so
      // three-for-three offers sit unanswered while two bots stare at each other — the market
      // moves when what is on it is easy to take.
      const best = wanted.sort((a, b) => {
        const byCount = Number(a.cards?.[0] ?? 0) - Number(b.cards?.[0] ?? 0);
        return byCount !== 0 ? byCount : spare.indexOf(String(a.give)) - spare.indexOf(String(b.give));
      })[0];
      return { move: best, botSeed: r.state };
    }
    // Nothing on the table helps and there is nothing new worth posting. Take any trade that at
    // least does not cost you your own commodity — standing perfectly still is how a table of
    // four bots, each guarding a different suit, sat and stared at each other forever.
    const harmless = moves
      .filter((m) => m.actionId === 'pitAccept')
      .map((m) => ({ m, o: state.market.find((x) => x.id === m.offerId) }))
      .filter((x) => x.o && x.o.want !== target);
    if (harmless.length > 0) return { move: harmless[Math.floor(r.value * harmless.length)].m, botSeed: r.state };

    // Two of your own already sitting unanswered: pull one rather than flood the market.
    const cancels = moves.filter((m) => m.actionId === 'pitCancel');
    if (cancels.length > 0) return { move: cancels[Math.floor(r.value * cancels.length)], botSeed: r.state };
    const offers = moves.filter((m) => m.actionId === 'pitOffer');
    if (offers.length === 0) return { move: moves[0], botSeed: r.state };
    return { move: offers[Math.floor(r.value * offers.length)], botSeed: r.state };
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

  // Capture-by-sum: play whatever claims the most cards off the table, sweeps first since
  // those also carry a bonus. Nothing to claim with anything in hand — get rid of the highest
  // card, since a small one left behind is more useful bait for a later sum than a big one is.
  if (state.definition.capture) {
    const plays = moves.filter((m) => m.actionId === 'playCard');
    if (mode === 'random' || plays.length === 0) {
      const r = nextRandom(botSeed);
      return { move: moves[Math.floor(r.value * moves.length)], botSeed: r.state };
    }
    const hand = state.zones[`hand:${playerId}`] || [];
    const table = state.zones.table || [];
    const order = state.definition.deck.rankOrder;
    const valueOf = (rank: string) => order.indexOf(rank as never) + 1;
    const tableSum = table.reduce((t, c) => t + valueOf(c.rank), 0);
    const scored = plays.map((m) => {
      const card = hand.find((c) => c.id === m.cardId)!;
      const v = valueOf(card.rank);
      const sameValue = table.filter((c) => valueOf(c.rank) === v).length;
      const claims = sameValue > 0 ? sameValue : (table.length > 0 && tableSum === v ? table.length : 0);
      // A claim that clears the table outscores an equal-size claim that doesn't — it's the
      // one worth a sweep bonus, when the game has one.
      const swept = claims > 0 && claims === table.length;
      return { m, score: claims * 10 + (swept ? 1 : 0) - v };
    });
    scored.sort((a, b) => b.score - a.score);
    const r = nextRandom(botSeed);
    const top = scored.filter((s) => s.score === scored[0].score);
    const pick = top[Math.floor(r.value * top.length)] || scored[0];
    return { move: pick.m, botSeed: r.state };
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
