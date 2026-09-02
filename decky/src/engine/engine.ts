// The deterministic interpreter. Reads a GameDefinition and runs any game expressible in it.
// Pure: no I/O, no clock, no network. All randomness flows through state.rngState (seeded).
//
// Public surface:
//   createMatch(def, players, seed) -> MatchState
//   legalMoves(state, playerId)     -> Move[]
//   applyMove(state, playerId, move)-> MatchState   (returns a new state; never mutates input)
//   isTerminal(state)               -> boolean
//   redact(state, playerId)         -> RedactedState

import {
  ActionDef, Card, Effect, GameDefinition, MatchState, Move, NumericAuctionConfig,
  PlayerRef, Predicate, RedactedState, RedactedZone, RuleHook, RuleValue, ScoringDef, Strain,
  Suit, TrickConfig, ZoneDef,
} from './types';
import { buildDeck, cardColor, cardTags } from './deck';
import { seededShuffle } from './rng';

// ---------- zone helpers ----------

function zoneDef(def: GameDefinition, id: string): ZoneDef {
  const z = def.zones.find((zz) => zz.id === id);
  if (!z) throw new Error(`Unknown zone: ${id}`);
  return z;
}

function zoneKey(def: GameDefinition, id: string, playerId: string): string {
  return zoneDef(def, id).perPlayer ? `${id}:${playerId}` : id;
}

function topCard(cards: Card[]): Card | undefined {
  return cards.length ? cards[cards.length - 1] : undefined;
}

function propOf(card: Card, prop: 'suit' | 'rank' | 'color'): string {
  if (prop === 'suit') return card.suit;
  if (prop === 'rank') return card.rank;
  return cardColor(card);
}

// ---------- match creation ----------

// `carry` lets a fresh hand continue an existing match's running score (see nextHand()).
export function createMatch(
  def: GameDefinition,
  players: string[],
  seed: number,
  carry?: {
    matchScores: Record<string, number>; handScores: Record<string, number>[]; handNumber: number;
    /** Poker only: the stacks people are sitting down with, carried from the last hand. */
    chips?: Record<string, number>;
    /** Kent only: the letters each pair has already spelt. */
    kentLetters?: Record<string, number>;
    /** Author-written counters that asked to survive the deal, and their names. */
    vars?: Record<string, string>;
    keepVars?: string[];
  },
): MatchState {
  const state: MatchState = {
    definition: def,
    seed,
    rngState: seed >>> 0,
    players: players.slice(),
    zones: {},
    turnIndex: 0,
    direction: def.turnFlow.order === 'clockwise' ? 1 : -1,
    skipCount: 0,
    repeatTurn: false,
    stallCount: 0,
    lead: null,
    trickPlays: [],
    lastTrick: null,
    lastBattle: null,
    warsCount: 0,
    shotMoon: null,
    roundOutcome: null,
    tricksWon: Object.fromEntries(players.map((p) => [p, 0])),
    bids: {},
    bidding: !!def.trick?.bidding,
    trumpSuit: (def.trick?.auction || def.trick?.turnedTrump) ? null : (def.trick?.trump ?? null),
    auctionRound: 0,
    auctionPasses: 0,
    turnedDownSuit: null,
    dealerIndex: 0,
    maker: null,
    alone: false,
    sittingOut: null,
    discarding: null,
    rummyPhase: 'draw',
    passStreak: 0,
    lastPlayer: null,
    finished: [],
    climbShape: 0,
    climbTopRank: null,
    climbBombDeclined: {},
    booksWon: Object.fromEntries(players.map((p) => [p, 0])),
    vars: { ...(carry?.vars ?? {}) },
    keepVars: carry?.keepVars ? [...carry.keepVars] : [],
    stopRules: false,
    ruleDepth: 0,
    handEndFired: false,
    foundationBase: null,
    scores: Object.fromEntries(players.map((p) => [p, 0])),
    phase: 'playing',
    winner: null,
    pendingChoice: null,
    passDirection: null,
    passCount: 1,
    passChoices: {},
    passStaged: {},
    brokenSuitPlayed: false,
    faceUp: {},
    redealsLeft: -1,
    moveCount: 0,
    ply: 0,
    bonus: {},
    pendingClaim: null,
    bluffCaught: Object.fromEntries(players.map((p) => [p, 0])),
    bluffCalled: Object.fromEntries(players.map((p) => [p, 0])),
    lastReveal: null,
    reflexOut: [],
    chips: def.poker
      ? Object.fromEntries(players.map((p) => [p, carry?.chips?.[p] ?? def.poker!.startingChips]))
      : {},
    pot: 0,
    currentBet: 0,
    committed: {},
    folded: {},
    actedThisRound: {},
    pokerPhase: 'bet',
    pokerWasShowdown: null,
    market: [],
    tradesCompleted: Object.fromEntries(players.map((p) => [p, 0])),
    kentTell: null,
    layoutDrew: null,
    layoutIdle: 0,
    seen: {},
    held: null,
    pendingPower: null,
    caller: null,
    callTurnsLeft: 0,
    swapTurns: 0,
    kentLetters: {},
    nextOfferId: 1,
    highBid: null,
    rummyMeldSizes: [],
    log: [],
    matchScores: carry?.matchScores ?? Object.fromEntries(players.map((p) => [p, 0])),
    handScores: carry?.handScores ?? [],
    handNumber: carry?.handNumber ?? 1,
    matchOver: false,
    matchWinner: null,
  };

  // Solitaire synthesises its own board: columns, foundations, cells, stock and waste.
  if (def.solitaire) {
    const cfg = def.solitaire;
    for (let i = 0; i < cfg.columns; i++) state.zones[solZones.tab(i)] = [];
    for (let i = 0; i < cfg.foundations; i++) state.zones[solZones.found(i)] = [];
    for (let i = 0; i < cfg.freeCells; i++) state.zones[solZones.free(i)] = [];
    state.zones[solZones.stock] = [];
    state.zones[solZones.waste] = [];
    if (cfg.reserve) state.zones[solZones.reserve] = [];
    state.redealsLeft = cfg.redeals;

    const { result, rngState } = seededShuffle(buildDeck(def), state.rngState);
    state.rngState = rngState;
    const deck = result;

    // Deal: Klondike's staircase, or an even spread across the columns.
    const counts: number[] = [];
    // Whatever the reserve and a turned-up foundation card have already taken is not available
    // to the tableau — an even split that ignores them deals the whole pack and leaves the
    // last columns empty.
    const spare = deck.length - (cfg.reserve ?? 0) - (cfg.foundationStart === 'dealt' ? 1 : 0);
    if (cfg.dealCount !== undefined) {
      for (let i = 0; i < cfg.columns; i++) counts.push(cfg.dealCount);
    } else if (cfg.deal === 'triangle') {
      for (let i = 0; i < cfg.columns; i++) counts.push(i + 1);
    } else if (cfg.deal === 'yukon') {
      // 1, 6, 7, 8, 9, 10, 11 — fifty-two exactly. The first column is a single card; every
      // other one is its buried run plus the five that sit face up on top.
      for (let i = 0; i < cfg.columns; i++) counts.push(i === 0 ? 1 : i + 5);
    } else {
      const per = Math.floor(spare / cfg.columns);
      const extra = spare % cfg.columns;
      for (let i = 0; i < cfg.columns; i++) counts.push(per + (i < extra ? 1 : 0));
    }
    // Spider deals 54 of 104, not the whole pack.
    if (cfg.stock === 'deal-row') {
      const seed = Math.floor((deck.length - cfg.columns * 5) / cfg.columns);
      for (let i = 0; i < cfg.columns; i++) counts[i] = seed + (i < 4 ? 1 : 0);
    }

    let k = 0;
    // Canfield's reserve comes off the top before anything else, face up but stacked, so only
    // its top card is ever in play.
    if (cfg.reserve) {
      for (let n = 0; n < cfg.reserve && k < deck.length; n++, k++) {
        state.zones[solZones.reserve].push(deck[k]);
        state.faceUp[deck[k].id] = true;
      }
    }
    /*
      The base rank, for a game that does not build from aces.

      One card decides it for the whole deal: it goes straight to the first foundation and every
      other foundation then starts from that same rank and wraps round the top of the order back
      to the bottom. Chosen here rather than on the first play so that the board a player is
      looking at already tells them what they are collecting.
    */
    if (cfg.foundationStart === 'dealt' && k < deck.length) {
      const base = deck[k];
      state.zones[solZones.found(0)].push(base);
      state.faceUp[base.id] = true;
      state.foundationBase = base.rank;
      k++;
    }
    for (let i = 0; i < cfg.columns; i++) {
      for (let n = 0; n < counts[i] && k < deck.length; n++, k++) {
        const card = deck[k];
        state.zones[solZones.tab(i)].push(card);
        // 'all' shows the lot; otherwise the top `faceUpCount` cards, which is one unless a
        // game says otherwise. Yukon says five.
        const shown = cfg.faceUp === 'all' ? counts[i] : (cfg.faceUpCount ?? 1);
        state.faceUp[card.id] = n >= counts[i] - shown;
      }
    }
    for (; k < deck.length; k++) {
      state.zones[solZones.stock].push(deck[k]);
      state.faceUp[deck[k].id] = false;
    }
    // A game played onto the waste needs something there to play onto, or the opening position
    // has no legal move at all and the first turn is always a draw.
    if (cfg.wasteIsTarget) {
      const seed = state.zones[solZones.stock].pop();
      if (seed) {
        state.faceUp[seed.id] = true;
        state.zones[solZones.waste].push(seed);
      }
    }

    log(state, null, `${def.meta.name} dealt.`);
    return state;
  }

  // A set game has no hands to deal. It has one shared board and a deck behind it, so it builds
  // its own zones the way solitaire does rather than being described one at a time.
  if (def.set) {
    const { result, rngState } = seededShuffle(buildDeck(def), state.rngState);
    state.rngState = rngState;
    state.zones['set:deck'] = result;
    state.zones['set:board'] = [];
    for (const p of players) state.scores[p] = 0;
    refillSetBoard(state);
    log(state, null, `${def.meta.name} — ${state.zones['set:board'].length} cards face up.`);
    return state;
  }

  // Initialize zones.
  for (const z of def.zones) {
    if (z.perPlayer) {
      for (const p of players) state.zones[`${z.id}:${p}`] = [];
    } else {
      state.zones[z.id] = [];
    }
  }

  // Load the full deck into the first shared pile (the "draw" source of setup).
  const deck = buildDeck(def);
  const drawZone = def.zones.find((z) => z.shared && z.type === 'pile');
  if (!drawZone) throw new Error('Definition needs a shared pile to hold the deck.');
  state.zones[drawZone.id] = deck;

  // Run setup steps deterministically.
  for (const step of def.setup) {
    if (step.op === 'shuffle') {
      const key = step.zone;
      const { result, rngState } = seededShuffle(state.zones[key], state.rngState);
      state.zones[key] = result;
      state.rngState = rngState;
    } else if (step.op === 'deal') {
      const count = step.countByPlayers?.[players.length] ?? step.countPerPlayer;
      for (let i = 0; i < count; i++) {
        for (const p of players) {
          const card = state.zones[step.from].pop();
          if (card) state.zones[zoneKey(def, step.to, p)].push(card);
        }
      }
    } else if (step.op === 'dealAll') {
      let seat = 0;
      while (state.zones[step.from].length) {
        const card = state.zones[step.from].pop()!;
        state.zones[zoneKey(def, step.to, players[seat % players.length])].push(card);
        seat++;
      }
    } else if (step.op === 'move') {
      for (let i = 0; i < step.count; i++) {
        const card = state.zones[step.from].pop();
        if (card) state.zones[step.to].push(card);
      }
    }
  }

  // Whist's own rule: trump is not named by anyone, it is whatever suit the last card dealt
  // happens to be. That card was the last one pushed by the round-robin deal loop above, so it
  // sits on top of the last seat's hand — turn it up, tell the table, and leave it exactly
  // where it landed; it is a card in that hand like any other from the next trick onward.
  if (def.trick?.turnedTrump) {
    const lastSeat = players[players.length - 1];
    const hand = state.zones[zoneKey(def, 'hand', lastSeat)] || [];
    const turned = hand[hand.length - 1];
    if (turned) {
      state.trumpSuit = turned.suit;
      log(state, null, `${short(lastSeat)} turns up ${cardLabel(turned)} — trump is ${turned.suit}.`);
    }
  }

  // Seed activeSuit from the starter card if there is a discard top.
  const discard = def.zones.find((z) => z.visibility === 'top-public');
  if (discard) {
    const top = topCard(state.zones[discard.id]);
    if (top) state.vars.activeSuit = top.suit;
  }

  // Fishing: a player dealt a full book immediately sets it aside.
  if (def.fish) for (const p of players) checkBooks(state, p);

  log(state, null, `${def.meta.name} started with ${players.length} players.`);
  // A pre-hand exchange happens before anyone plays; otherwise open at the designated lead.
  if (def.handPass) startHandPass(state);
  if (def.trick?.numericAuction) {
    // The deal rotates, and the auction opens to the dealer's left. auctionRound doubles as
    // "an auction is running" — there are no rounds in a contract auction, it simply continues
    // until the passes close it.
    state.dealerIndex = ((carry?.handNumber ?? 1) - 1) % players.length;
    state.auctionRound = 1;
    state.auctionPasses = 0;
    state.highBid = null;
    state.turnIndex = (state.dealerIndex + 1) % players.length;
    log(state, null, `${short(players[state.dealerIndex])} deals. The auction is open.`);
  } else if (def.trick?.auction) {
    // The deal rotates each hand, and bidding opens to the dealer's left.
    state.dealerIndex = ((carry?.handNumber ?? 1) - 1) % players.length;
    state.auctionRound = 1;
    state.turnIndex = (state.dealerIndex + 1) % players.length;
    const up = topCard(state.zones[def.trick.auction.upcardZone] || []);
    log(state, null, `${short(players[state.dealerIndex])} deals. ${up ? `${cardLabel(up)} is turned up.` : ''}`);
  } else if (def.trick?.bidding) {
    // Bidding trick games (Spades, Oh Hell) settle their own opening seat, independent of
    // turnFlow.startPlayer: the deal rotates each hand and bidding opens to the dealer's left,
    // the same as a trump auction — otherwise every hand of the match would bid, and then lead,
    // from seat one.
    state.dealerIndex = ((carry?.handNumber ?? 1) - 1) % players.length;
    state.turnIndex = (state.dealerIndex + 1) % players.length;
    log(state, null, `${short(players[state.dealerIndex])} deals. Bidding is open.`);
  } else if (def.trick && !state.passDirection) {
    // No auction, no bidding: whoever holds the designated lead card opens (Hearts' 2♣).
    // Failing that — Briscola, Sixty-Six, Black Maria, Pinochle, Whist — the deal still has to
    // rotate, or the same seat opens trick one of every single hand of the match forever, the
    // exact seat bias the dealerLeft branch below exists to fix for the other families.
    state.dealerIndex = ((carry?.handNumber ?? 1) - 1) % players.length;
    state.turnIndex = openingLeadSeat(state);
  } else if (def.turnFlow.startPlayer === 'dealerLeft') {
    /*
      The deal rotates for everyone else too.

      Auction games already did this a few lines up, and every other family was left with seat
      one opening every hand of every match — which in rummy is not cosmetic. The player who
      leads draws first, so they reach a hand they can go out with first, and going out is the
      whole game. Measured over eighty matches the effect compounds hand after hand: Three
      Thirteen came out 43/21/26/10 across four seats, Hand and Foot 35/39/19/8. Seat four was
      not playing worse; it was never once opening.
    */
    state.dealerIndex = ((carry?.handNumber ?? 1) - 1) % players.length;
    state.turnIndex = (state.dealerIndex + 1) % players.length;
    log(state, null, `${short(players[state.dealerIndex])} deals.`);
  }
  // Poker: antes and blinds are posted before the first decision, same as any real table —
  // otherwise "bet" would just be the first player's own choice with nothing already at risk.
  if (def.poker) {
    const cfg = def.poker;
    const n = players.length;
    if (cfg.ante > 0) {
      for (const p of players) {
        const add = Math.min(cfg.ante, state.chips[p] ?? 0);
        state.chips[p] = (state.chips[p] ?? 0) - add;
        state.pot += add;
      }
    }
    const postBlind = (idx: number, amount: number) => {
      const p = players[idx];
      const add = Math.min(amount, state.chips[p] ?? 0);
      state.chips[p] = (state.chips[p] ?? 0) - add;
      state.committed[p] = (state.committed[p] ?? 0) + add;
      state.pot += add;
    };
    const sbIdx = 0;
    const bbIdx = n > 1 ? 1 : 0;
    if (n >= 2) {
      postBlind(sbIdx, cfg.smallBlind);
      postBlind(bbIdx, cfg.bigBlind);
      state.currentBet = Math.max(...players.map((p) => state.committed[p] ?? 0));
      // Heads-up, the button posts the small blind and acts first preflop. Three or more,
      // action opens under the gun — the seat left of the big blind.
      state.turnIndex = n === 2 ? sbIdx : 2 % n;
      log(state, null, `${short(players[sbIdx])} posts the small blind (${cfg.smallBlind}). ${short(players[bbIdx])} posts the big blind (${cfg.bigBlind}).`);
    }
  }
  // Kent: four in the middle, face up, after the hands have gone out. The letters already
  // spelt come in with the carry, because a round is one hand but a game is however many
  // rounds it takes a pair to spell the word.
  if (def.swap) {
    const cfg = def.swap;
    const draw = state.zones['draw'] || (state.zones['draw'] = []);
    for (const p of players) {
      const grid = (state.zones[swapZones.grid(p)] ||= []);
      state.seen[p] = [];
      for (let i = 0; i < cfg.slots; i++) {
        const c = draw.pop();
        if (c) { grid.push(c); state.faceUp[c.id] = false; }
      }
      // Your one look, and it is the only one you get for free. The outer two by convention —
      // which two hardly matters, but that they are always the same two does: everyone at the
      // table knows which of your cards you know.
      for (let i = 0; i < Math.min(cfg.peekAtStart, grid.length); i++) {
        state.seen[p].push(grid[i].id);
      }
    }
    const up = draw.pop();
    if (up) { (state.zones['discard'] ||= []).push(up); state.faceUp[up.id] = true; }
    log(state, null, `${cfg.slots} face down each. You saw ${cfg.peekAtStart} of yours — remember them.`);
  }

  // Old Maid: the deck was dealt out whole by the definition's own `dealAll` step, unevenly if
  // it must be — 51 cards never split evenly by four. Whatever landed in a hand, any pair in it
  // falls out before the first turn, same as it will after every draw from here on.
  if (def.maid) {
    for (const p of players) maidDiscardPairs(state, p);
  }

  if (def.layout) {
    const cfg = def.layout;
    const draw = state.zones['draw'] || (state.zones['draw'] = []);
    for (const p of players) {
      const hand = (state.zones[`hand:${p}`] ||= []);
      for (let i = 0; i < cfg.handSize; i++) { const c = draw.pop(); if (c) hand.push(c); }
    }
    // The cross gets a card each and the corners stay shut until somebody has a king.
    for (let i = 0; i < cfg.piles + cfg.cornerPiles; i++) {
      const pile = (state.zones[layoutZones.pile(i)] ||= []);
      if (i < cfg.piles) {
        const c = draw.pop();
        if (c) { pile.push(c); state.faceUp[c.id] = true; }
      }
    }
    log(state, null, `${cfg.piles} piles up, ${cfg.cornerPiles} corners waiting on a ${cfg.cornerRank}.`);
  }

  if (def.kent) {
    const pool = (state.zones[kentZones.pool] ||= []);
    const draw = state.zones['draw'] || [];
    for (let i = 0; i < def.kent.poolSize; i++) { const c = draw.pop(); if (c) pool.push(c); }
    state.kentLetters = { A: carry?.kentLetters?.A ?? 0, B: carry?.kentLetters?.B ?? 0 };
    log(state, null, `${def.kent.poolSize} face up in the middle. Get four of a kind and signal your partner — spell ${def.kent.letters} and your pair is out.`);
  }
  // Pit deals the whole deck out at once, so a player can already be holding a full corner the
  // instant the cards land — pitCheckWin() is otherwise only ever called after a trade, which
  // would let a deal-time win go undetected (and possibly traded away) before anyone ever offers.
  if (def.pit) {
    // The deck is dealt out entire, so at three seats everyone holds seventeen cards and a
    // corner of seven turned up ready-made in sixty per cent of deals — the game was over
    // before a single offer was posted. A deal that already contains a corner is not a game,
    // so it is thrown in and dealt again, the way a misdeal is at a real table.
    for (let redeal = 0; redeal < 40 && pitDealtCorner(state); redeal++) {
      const all: Card[] = [];
      for (const p of state.players) { all.push(...(state.zones[`hand:${p}`] || [])); state.zones[`hand:${p}`] = []; }
      const { result, rngState } = seededShuffle(all, state.rngState);
      state.rngState = rngState;
      result.forEach((c, i) => state.zones[`hand:${state.players[i % state.players.length]}`].push(c));
    }
    // Say what winning looks like at this table, since the number depends on how many sat down.
    log(state, null, `Corner ${pitCorner(state)} of one suit to win.`);
    pitCheckWin(state);
  }
  scoreMelds(state);
  fireRules(state, 'handStart', { playerId: state.players[state.turnIndex] });
  return state;
}

// ---------- predicate evaluation ----------

interface Ctx {
  playerId: string;
  targetCard?: Card;
}

function evalPredicate(state: MatchState, p: Predicate, ctx: Ctx): boolean {
  const def = state.definition;
  if ('always' in p) return true;
  if ('any' in p) return p.any.some((sub) => evalPredicate(state, sub, ctx));
  if ('all' in p) return p.all.every((sub) => evalPredicate(state, sub, ctx));
  if ('not' in p) return !evalPredicate(state, p.not, ctx);
  if ('cardHasTag' in p) {
    return !!ctx.targetCard && cardTags(def, ctx.targetCard).includes(p.cardHasTag);
  }
  if ('existsLegal' in p) {
    // Is the referenced action currently legal for this player? Guard against self-reference.
    return actionHasLegalMove(state, ctx.playerId, p.existsLegal, true);
  }
  if ('matches' in p) {
    const m = p.matches;
    if (!ctx.targetCard) return false;
    const val = propOf(ctx.targetCard, m.cardProp);
    if (m.equalsTopOf) {
      const top = topCard(state.zones[m.equalsTopOf]);
      if (!top) return false;
      return propOf(top, m.cardProp) === val;
    }
    if (m.equalsStateOrTopOf) {
      const [stateVar, zoneId] = m.equalsStateOrTopOf;
      const sv = state.vars[stateVar];
      if (sv !== undefined) return sv === val;
      const top = topCard(state.zones[zoneId]);
      if (!top) return false;
      return propOf(top, m.cardProp) === val;
    }
    return false;
  }
  if ('cmp' in p) {
    return compareValues(evalValue(state, p.cmp.left, ctx), p.cmp.op, evalValue(state, p.cmp.right, ctx));
  }
  if ('rankIn' in p) return !!ctx.targetCard && p.rankIn.includes(ctx.targetCard.rank);
  if ('suitIn' in p) return !!ctx.targetCard && p.suitIn.includes(ctx.targetCard.suit);
  if ('colorIs' in p) return !!ctx.targetCard && cardColor(ctx.targetCard) === p.colorIs;
  if ('handHas' in p) return handMatches(state, p.handHas, ctx.playerId);
  if ('listHas' in p) {
    const q = p.listHas;
    const held = (state.vars[varKey(state, q.var, q.per, ctx)] ?? '').split(',').filter(Boolean);
    return held.includes(String(evalValue(state, q.value, ctx)));
  }
  if ('isFirstTurn' in p) return state.ply === 0;
  return false;
}

// ---------- rule values (the near-programmable layer) ----------
//
// An author-written rule is data, not code. Every value it can read is listed here, so a rule
// somebody builds in the browser can be evaluated by the engine without ever evaluating a
// string. That is what keeps a custom game as safe to run as a classic one.

function seatOf(state: MatchState, playerId: string): number {
  return Math.max(0, state.players.indexOf(playerId));
}

/** Resolve a player reference to the seats it names. */
export function refToPlayers(state: MatchState, ref: PlayerRef, me: string): string[] {
  const n = state.players.length;
  const i = seatOf(state, me);
  switch (ref) {
    case '$me': return [me];
    case '$next': return [state.players[((i + state.direction) % n + n) % n]];
    case '$prev': return [state.players[((i - state.direction) % n + n) % n]];
    case '$all': return state.players.slice();
    case '$others': return state.players.filter((p) => p !== me);
    default: return [me];
  }
}

function num(v: number | string): number {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function evalValue(state: MatchState, v: RuleValue, ctx: Ctx): number | string {
  const def = state.definition;
  if ('lit' in v) return v.lit;
  if ('stateVar' in v) return state.vars[varKey(state, v.stateVar, v.per, ctx)] ?? '';
  if ('count' in v) {
    const key = v.count === '$hand' ? `hand:${ctx.playerId}` : zoneKey(def, v.count, ctx.playerId);
    return (state.zones[key] || []).length;
  }
  if ('cardProp' in v) {
    const c = ctx.targetCard;
    if (!c) return '';
    if (v.cardProp === 'value') return rankIndex(def, c.rank);
    return propOf(c, v.cardProp);
  }
  if ('score' in v) return sumOver(state, v.score, ctx.playerId, (p) => handPoints(state, p));
  if ('matchScore' in v) return sumOver(state, v.matchScore, ctx.playerId, (p) => state.matchScores[p] ?? 0);
  if ('tricksWon' in v) return sumOver(state, v.tricksWon, ctx.playerId, (p) => state.tricksWon[p] ?? 0);
  if ('handNumber' in v) return state.handNumber;
  if ('playerCount' in v) return state.players.length;
  if ('add' in v) return num(evalValue(state, v.add[0], ctx)) + num(evalValue(state, v.add[1], ctx));
  if ('sub' in v) return num(evalValue(state, v.sub[0], ctx)) - num(evalValue(state, v.sub[1], ctx));
  if ('mul' in v) return num(evalValue(state, v.mul[0], ctx)) * num(evalValue(state, v.mul[1], ctx));
  if ('min' in v) return Math.min(num(evalValue(state, v.min[0], ctx)), num(evalValue(state, v.min[1], ctx)));
  if ('max' in v) return Math.max(num(evalValue(state, v.max[0], ctx)), num(evalValue(state, v.max[1], ctx)));
  return '';
}

/** This hand's points including anything author rules have awarded so far. */
function handPoints(state: MatchState, p: string): number {
  return (state.scores[p] ?? 0) + (state.bonus[p] ?? 0);
}

function sumOver(state: MatchState, ref: PlayerRef, me: string, get: (p: string) => number): number {
  const seats = refToPlayers(state, ref, me);
  return seats.reduce((t, p) => t + get(p), 0);
}

function rankIndex(def: GameDefinition, rank: string): number {
  const i = def.deck.rankOrder.indexOf(rank as never);
  return i < 0 ? 0 : i + 1;   // 1-based so "value > 0" reads naturally
}

function compareValues(a: number | string, op: string, b: number | string): boolean {
  // Compare as numbers when both sides look numeric; otherwise as text. An author writing
  // "activeSuit == hearts" and one writing "hand size >= 3" both get what they meant.
  const bothNumeric = isNumeric(a) && isNumeric(b);
  const l = bothNumeric ? num(a) : String(a);
  const r = bothNumeric ? num(b) : String(b);
  switch (op) {
    case '==': return l === r;
    case '!=': return l !== r;
    case '>': return l > r;
    case '>=': return l >= r;
    case '<': return l < r;
    case '<=': return l <= r;
    default: return false;
  }
}

function isNumeric(v: number | string): boolean {
  return typeof v === 'number' || (v !== '' && Number.isFinite(Number(v)));
}

function handMatches(
  state: MatchState, q: { rank?: string; suit?: string; color?: string; tag?: string; minCount?: number }, playerId: string,
): boolean {
  const hand = state.zones[`hand:${playerId}`] || [];
  const hits = hand.filter((c) => {
    if (q.rank && c.rank !== q.rank) return false;
    if (q.suit && c.suit !== q.suit) return false;
    if (q.color && cardColor(c) !== q.color) return false;
    if (q.tag && !cardTags(state.definition, c).includes(q.tag)) return false;
    return true;
  });
  return hits.length >= (q.minCount ?? 1);
}

// ---------- legal move enumeration ----------

function findAction(def: GameDefinition, id: string): ActionDef | undefined {
  return def.actions.find((a) => a.id === id);
}

// Does <actionId> yield at least one legal move for player? `guard` blocks existsLegal recursion.
function actionHasLegalMove(
  state: MatchState, playerId: string, actionId: string, guard: boolean,
): boolean {
  const def = state.definition;
  const action = findAction(def, actionId);
  if (!action) return false;
  const ctxBase: Ctx = { playerId };

  if (action.target) {
    const handKey = zoneKey(def, action.target.from, playerId);
    const cards = state.zones[handKey] || [];
    return cards.some((c) =>
      safeEval(state, action.when, { ...ctxBase, targetCard: c }, guard));
  }
  return safeEval(state, action.when, ctxBase, guard);
}

// Evaluate a predicate; if guard is set, treat any nested existsLegal as false (prevents cycles).
function safeEval(state: MatchState, p: Predicate, ctx: Ctx, guard: boolean): boolean {
  if (!guard) return evalPredicate(state, p, ctx);
  return evalPredicate(state, stripExistsLegal(p), ctx);
}

function stripExistsLegal(p: Predicate): Predicate {
  if ('existsLegal' in p) return { not: { always: true } } as unknown as Predicate;
  if ('any' in p) return { any: p.any.map(stripExistsLegal) };
  if ('all' in p) return { all: p.all.map(stripExistsLegal) };
  if ('not' in p) return { not: stripExistsLegal(p.not) };
  return p;
}

/**
 * Cards an author's own rules forbid, filtered out of whatever the family offered.
 *
 * This is the one place a custom rule gets to say NO. Every other hook is reactive — it fires
 * after a move and reacts to it — which meant "you may not lead a heart" or "the queen of
 * spades may not be played on the first trick" were unsayable: the rule could punish the play
 * but not prevent it.
 *
 * The family always wins a disagreement. A restriction may never be the last word if honouring
 * it would leave a player with nothing legal to do, because a player with no legal move is a
 * stuck game, and a stuck game is worse than a rule that occasionally does not apply.
 */
function applyRestrictions(state: MatchState, playerId: string, moves: Move[]): Move[] {
  const rules = state.definition.playRestrictions;
  if (!rules || rules.length === 0 || moves.length === 0) return moves;
  const byId = new Map<string, Card>();
  for (const c of state.zones[`hand:${playerId}`] || []) byId.set(c.id, c);

  const kept = moves.filter((m) => {
    if (!m.cardId) return true;              // a restriction is about a card, not a bid or a pass
    const card = byId.get(m.cardId);
    if (!card) return true;
    const ctx: Ctx = { playerId, targetCard: card };
    return !rules.some((r) => r.enabled !== false && evalPredicate(state, r.if, ctx));
  });
  return kept.length > 0 ? kept : moves;
}

export function legalMoves(state: MatchState, playerId: string): Move[] {
  return applyRestrictions(state, playerId, familyLegalMoves(state, playerId));
}

function familyLegalMoves(state: MatchState, playerId: string): Move[] {
  if (state.phase !== 'playing') return [];

  // A simultaneous pass overrides whose turn it is, in every family — each player who hasn't
  // finished choosing may pick a card to give away, regardless of the normal turn order.
  if (state.passDirection) {
    if (playerId in state.passChoices) return [];
    const staged = state.passStaged[playerId] || [];
    const hand = state.zones[`hand:${playerId}`] || [];
    return hand.filter((c) => !staged.includes(c.id)).map((c) => ({ actionId: 'choosePass', cardId: c.id }));
  }

  if (state.definition.solitaire) return solitaireLegalMoves(state);
  if (state.definition.trick) return trickLegalMoves(state, playerId);
  if (state.definition.climb) return climbLegalMoves(state, playerId);
  if (state.definition.fish) return fishLegalMoves(state, playerId);
  if (state.definition.rummy) return rummyLegalMoves(state, playerId);
  if (state.definition.war) return state.players[state.turnIndex] === playerId ? [{ actionId: 'warFlip' }] : [];
  if (state.definition.bluff) return bluffLegalMoves(state, playerId);
  if (state.definition.reflex) return reflexLegalMoves(state, playerId);
  if (state.definition.poker) return pokerLegalMoves(state, playerId);
  if (state.definition.pit) return pitLegalMoves(state, playerId);
  if (state.definition.kent) return kentLegalMoves(state, playerId);
  if (state.definition.layout) return layoutLegalMoves(state, playerId);
  if (state.definition.swap) return swapLegalMoves(state, playerId);
  if (state.definition.maid) return maidLegalMoves(state, playerId);
  if (state.definition.set) return setLegalMoves(state);

  // Resolve a pending choice first (e.g. pick a suit after a wild).
  if (state.pendingChoice) {
    if (state.pendingChoice.player !== playerId) return [];
    return (['C', 'D', 'H', 'S'] as const).map((suit) => ({
      actionId: 'resolveChoice', choice: suit,
    }));
  }

  if (state.players[state.turnIndex] !== playerId) return [];

  const def = state.definition;
  const moves: Move[] = [];
  for (const action of def.actions) {
    if (action.target) {
      const handKey = zoneKey(def, action.target.from, playerId);
      const cards = state.zones[handKey] || [];
      for (const c of cards) {
        if (evalPredicate(state, action.when, { playerId, targetCard: c })) {
          moves.push({ actionId: action.id, cardId: c.id });
        }
      }
    } else if (evalPredicate(state, action.when, { playerId })) {
      moves.push({ actionId: action.id });
    }
  }
  return moves;
}

// ---------- effect execution ----------

function cloneState(state: MatchState): MatchState {
  return {
    ...state,
    players: state.players.slice(),
    zones: Object.fromEntries(Object.entries(state.zones).map(([k, v]) => [k, v.slice()])),
    vars: { ...state.vars },
    scores: { ...state.scores },
    tricksWon: { ...state.tricksWon },
    bids: { ...state.bids },
    trickPlays: state.trickPlays.map((t) => ({ ...t })),
    lastTrick: state.lastTrick
      ? { winner: state.lastTrick.winner, plays: state.lastTrick.plays.map((t) => ({ ...t })) }
      : null,
    lastBattle: state.lastBattle ? state.lastBattle.map((b) => ({ card: { ...b.card } })) : null,
    warsCount: state.warsCount,
    shotMoon: state.shotMoon ?? null,
    roundOutcome: state.roundOutcome ?? null,
    finished: state.finished.slice(),
    booksWon: { ...state.booksWon },
    pendingChoice: state.pendingChoice ? { ...state.pendingChoice } : null,
    passChoices: Object.fromEntries(Object.entries(state.passChoices).map(([k, v]) => [k, v.slice()])),
    passStaged: Object.fromEntries(Object.entries(state.passStaged).map(([k, v]) => [k, v.slice()])),
    climbBombDeclined: { ...state.climbBombDeclined },
    faceUp: { ...state.faceUp },
    pendingClaim: state.pendingClaim ? { ...state.pendingClaim, cardIds: state.pendingClaim.cardIds.slice() } : null,
    bluffCaught: { ...state.bluffCaught },
    bluffCalled: { ...state.bluffCalled },
    lastReveal: state.lastReveal ? { ...state.lastReveal, cards: state.lastReveal.cards.map((c) => ({ ...c })) } : null,
    reflexOut: state.reflexOut.slice(),
    chips: { ...state.chips },
    committed: { ...state.committed },
    folded: { ...state.folded },
    actedThisRound: { ...state.actedThisRound },
    market: state.market.map((o) => ({ ...o })),
    tradesCompleted: { ...state.tradesCompleted },
    // Kent's tell and its letters are state like everything else here: shared by reference they
    // would leak across a take-back and across a replay, which is exactly what this clone
    // exists to stop.
    kentTell: state.kentTell ? { ...state.kentTell } : null,
    kentLetters: { ...state.kentLetters },
    highBid: state.highBid ? { ...state.highBid } : null,
    log: state.log.slice(),
  };
}

function nextSeat(state: MatchState): string {
  const n = state.players.length;
  const idx = ((state.turnIndex + state.direction) % n + n) % n;
  return state.players[idx];
}

function runEffects(state: MatchState, effects: Effect[], ctx: Ctx & { playedCard?: Card }): void {
  const def = state.definition;
  for (const e of effects) {
    switch (e.op) {
      case 'move': {
        if (e.card === '$target' && ctx.targetCard) {
          // remove target from its owner's source zone, push to `to`
          removeCardFromAnyZone(state, ctx.targetCard.id);
          state.zones[e.to].push(ctx.targetCard);
          ctx.playedCard = ctx.targetCard;
        } else if (e.from) {
          const count = e.count ?? 1;
          let moved = 0;
          for (let i = 0; i < count; i++) {
            const card = state.zones[e.from].pop();
            if (!card) break;
            state.zones[zoneKey(def, e.to, ctx.playerId)].push(card);
            moved++;
          }
          if (e.from !== e.to && moved === 0) state.stallCount++;
          else state.stallCount = 0;
        }
        break;
      }
      case 'setState': {
        state.vars[varKey(state, e.var, e.per, ctx)] = resolveValue(e.value, ctx);
        if (e.keep) rememberVar(state, e.var);
        break;
      }
      case 'if': {
        if (evalPredicate(state, e.cond, ctx)) runEffects(state, e.then, ctx);
        else if (e.else) runEffects(state, e.else, ctx);
        break;
      }
      case 'chooseSuit': {
        state.pendingChoice = { type: 'suit', player: ctx.playerId, setState: e.setState };
        break;
      }
      case 'reverseOrder': {
        state.direction = (state.direction * -1) as 1 | -1;
        break;
      }
      case 'skipNext': {
        state.skipCount += 1;
        break;
      }
      case 'forceDraw': {
        const target = nextSeat(state);
        for (let i = 0; i < e.count; i++) {
          const card = state.zones[e.from].pop();
          if (card) state.zones[zoneKey(def, 'hand', target)].push(card);
        }
        break;
      }
      case 'reshuffleDiscardInto': {
        reshuffleDiscardInto(state, e.zone, e.keepTop);
        break;
      }
      case 'extraTurn': {
        state.repeatTurn = true;
        break;
      }
      case 'drawUntilPlayable': {
        const handKey = zoneKey(def, 'hand', ctx.playerId);
        let guard = 0;
        while (guard++ < 30) {
          if (actionHasLegalMove(state, ctx.playerId, 'playCard', true)) break;
          let card = state.zones[e.from].pop();
          if (!card) { fireDrawPileTriggers(state); card = state.zones[e.from].pop(); }
          if (!card) break;
          state.zones[handKey].push(card);
        }
        break;
      }
      case 'passCards': {
        // Only players still holding a card can be asked to give one away.
        if (state.players.every((p) => (state.zones[`hand:${p}`] || []).length > 0)) {
          state.passDirection = e.direction;
          state.passCount = 1;
          state.passChoices = {};
          state.passStaged = {};
        }
        break;
      }

      // ----- near-programmable effects (Phase 2) -----
      case 'addScore': {
        const amount = num(evalValue(state, e.amount, ctx));
        for (const p of refToPlayers(state, e.player, ctx.playerId)) {
          state.bonus[p] = (state.bonus[p] ?? 0) + amount;
        }
        break;
      }
      case 'setVarNum': {
        state.vars[varKey(state, e.var, e.per, ctx)] = String(evalValue(state, e.value, ctx));
        if (e.keep) rememberVar(state, e.var);
        break;
      }
      case 'appendVar': {
        // A counter remembers how many; this remembers which. Held as a comma-delimited list
        // because vars are strings, and read back by the "a list contains" condition.
        const key = varKey(state, e.var, e.per, ctx);
        const item = String(evalValue(state, e.value, ctx));
        const cur = state.vars[key] ? state.vars[key].split(',').filter(Boolean) : [];
        if (!e.unique || !cur.includes(item)) cur.push(item);
        state.vars[key] = cur.join(',');
        break;
      }
      case 'stopRules': {
        state.stopRules = true;
        break;
      }
      case 'runRule': {
        // One rule calling another. Guarded against a cycle rather than trusted not to have
        // one — an author can absolutely write two rules that call each other.
        const target = (state.definition.rules ?? []).find((r) => r.id === e.rule);
        if (!target || target.enabled === false) break;
        if (state.ruleDepth >= 8) { log(state, null, 'A rule called too many others and was stopped.'); break; }
        if (target.if && !evalPredicate(state, target.if, ctx)) break;
        state.ruleDepth += 1;
        runEffects(state, target.then, ctx);
        state.ruleDepth -= 1;
        break;
      }
      case 'announce': {
        log(state, null, e.text);
        break;
      }
      case 'endHand': {
        // A rule may end the hand outright. Guarded so a rule can't re-end a finished hand.
        if (state.phase === 'playing') {
          const hint = e.winner === undefined ? undefined
            : e.winner === 'highestScore' ? bestBy(state, (p) => handPoints(state, p), 1)
            : e.winner === 'lowestScore' ? bestBy(state, (p) => handPoints(state, p), -1)
            : refToPlayers(state, e.winner, ctx.playerId)[0];
          endRound(state, 'won', hint);
        }
        break;
      }
      case 'swapHands': {
        const other = refToPlayers(state, e.withPlayer === 'next' ? '$next' : '$prev', ctx.playerId)[0];
        const a = `hand:${ctx.playerId}`, b = `hand:${other}`;
        const tmp = state.zones[a] || [];
        state.zones[a] = state.zones[b] || [];
        state.zones[b] = tmp;
        log(state, ctx.playerId, `${short(ctx.playerId)} swapped hands with ${short(other)}.`);
        break;
      }
      case 'moveMany': {
        const count = Math.max(0, Math.floor(num(evalValue(state, e.count, ctx))));
        const from = zoneKey(def, e.from, ctx.playerId);
        const to = zoneKey(def, e.to, ctx.playerId);
        for (let i = 0; i < count; i++) {
          const card = (state.zones[from] || []).pop();
          if (!card) break;
          (state.zones[to] = state.zones[to] || []).push(card);
        }
        break;
      }
      case 'drawTo': {
        const count = Math.max(0, Math.floor(num(evalValue(state, e.count, ctx))));
        for (const p of refToPlayers(state, e.player, ctx.playerId)) {
          for (let i = 0; i < count; i++) {
            const card = (state.zones[e.from] || []).pop();
            if (!card) break;
            state.zones[`hand:${p}`].push(card);
          }
        }
        break;
      }
      case 'revealHand': {
        for (const p of refToPlayers(state, e.player, ctx.playerId)) {
          const hand = state.zones[`hand:${p}`] || [];
          log(state, null, `${short(p)} reveals: ${hand.map(cardLabel).join(', ') || '(nothing)'}`);
        }
        break;
      }
      case 'skipTo': {
        // Hand the turn straight to a named neighbour rather than stepping round the table.
        const target = refToPlayers(state, e.player === 'next' ? '$next' : '$prev', ctx.playerId)[0];
        state.turnIndex = state.players.indexOf(target);
        state.skipCount = 0;
        break;
      }
    }
  }
}

function removeCardFromAnyZone(state: MatchState, cardId: string): void {
  for (const key of Object.keys(state.zones)) {
    const idx = state.zones[key].findIndex((c) => c.id === cardId);
    if (idx >= 0) {
      state.zones[key].splice(idx, 1);
      return;
    }
  }
}

function resolveValue(value: string, ctx: Ctx): string {
  if (value === '$target.suit') return ctx.targetCard?.suit ?? '';
  if (value === '$target.rank') return ctx.targetCard?.rank ?? '';
  return value;
}

function reshuffleDiscardInto(state: MatchState, drawZoneId: string, keepTop: boolean): void {
  const discardZone = state.definition.zones.find((z) => z.visibility === 'top-public');
  if (!discardZone) return;
  const discard = state.zones[discardZone.id];
  if (discard.length <= (keepTop ? 1 : 0)) return;
  const keep = keepTop ? [discard[discard.length - 1]] : [];
  const toShuffle = keepTop ? discard.slice(0, -1) : discard.slice();
  const { result, rngState } = seededShuffle(toShuffle, state.rngState);
  state.rngState = rngState;
  state.zones[drawZoneId] = [...state.zones[drawZoneId], ...result];
  state.zones[discardZone.id] = keep;
  log(state, null, 'Draw pile reshuffled from the discard.');
}

// ---------- apply a move ----------

export function applyMove(state: MatchState, playerId: string, move: Move): MatchState {
  const s = cloneState(state);
  const def = s.definition;

  if (move.actionId === 'choosePass') return applyChoosePass(s, playerId, move);

  // Resolve a pending suit choice. Generic across every family — some (trick games, via
  // chooseTrumpAfter) route their own moves through a family-specific apply function below, so
  // this has to be handled before that dispatch, not after it, or a resolveChoice move for one
  // of those families would be handed to a family handler that has never heard of it.
  if (move.actionId === 'resolveChoice') {
    if (!s.pendingChoice || s.pendingChoice.player !== playerId) return s;
    // Naming trump after winning a level-only contract auction is its own kind of choice: it
    // finishes settling the contract (see settleContract's chooseTrumpAfter branch) rather than
    // just stashing a var and handing the turn on, so it gets its own resolution here instead of
    // falling into the generic path below.
    if (s.pendingChoice.purpose === 'contractTrump') {
      const bid = s.highBid!;
      bid.strain = move.choice as Strain;
      s.trumpSuit = move.choice as Suit;
      const need = bid.level + s.definition.trick!.numericAuction!.book;
      log(s, playerId, `${short(playerId)} names ${suitWord(move.choice!)} trump — ${need} tricks to make ${bid.level}.`);
      s.pendingChoice = null;
      s.turnIndex = (s.players.indexOf(bid.player) + 1) % s.players.length;
      return s;
    }
    s.vars[s.pendingChoice.setState] = move.choice!;
    log(s, playerId, `${short(playerId)} chose ${suitWord(move.choice!)}.`);
    s.pendingChoice = null;
    advanceAndCheck(s);
    return s;
  }

  // Every family gets the same rule hooks. The handlers below own the mechanics; this wrapper
  // owns the author's layer, so a rule behaves identically whichever family it rides on.
  const handBefore = (s.zones[`hand:${playerId}`] || []).slice();
  if (def.solitaire) return applySolitaireMove(s, move);
  if (def.trick) return afterFamilyMove(applyTrickMove(s, playerId, move), playerId, handBefore);
  if (def.climb) return afterFamilyMove(applyClimbMove(s, playerId, move), playerId, handBefore);
  if (def.fish) return afterFamilyMove(applyFishMove(s, playerId, move), playerId, handBefore);
  if (def.rummy) return afterFamilyMove(applyRummyMove(s, playerId, move), playerId, handBefore);
  if (def.war) return afterFamilyMove(applyWarMove(s, playerId, move), playerId, handBefore);
  if (def.bluff) return afterFamilyMove(applyBluffMove(s, playerId, move), playerId, handBefore);
  if (def.reflex) return afterFamilyMove(applyReflexMove(s, playerId, move), playerId, handBefore);
  if (def.poker) return afterFamilyMove(applyPokerMove(s, playerId, move), playerId, handBefore);
  if (def.pit) return afterFamilyMove(applyPitMove(s, playerId, move), playerId, handBefore);
  if (def.kent) return afterFamilyMove(applyKentMove(s, playerId, move), playerId, handBefore);
  if (def.layout) return afterFamilyMove(applyLayoutMove(s, playerId, move), playerId, handBefore);
  if (def.swap) return afterFamilyMove(applySwapMove(s, playerId, move), playerId, handBefore);
  if (def.maid) return afterFamilyMove(applyMaidMove(s, playerId, move), playerId, handBefore);
  if (def.set) return afterFamilyMove(applySetMove(s, playerId, move), playerId, handBefore);

  // Validate the move is currently legal.
  const legal = legalMoves(s, playerId);
  const chosen = legal.find((m) => m.actionId === move.actionId && m.cardId === move.cardId);
  if (!chosen) return s; // illegal move → no-op (server rejects; caller can inspect)

  const action = findAction(def, move.actionId)!;
  const targetCard = move.cardId
    ? (s.zones[zoneKey(def, action.target!.from, playerId)] || []).find((c) => c.id === move.cardId)
    : undefined;

  const ctx: Ctx & { playedCard?: Card } = { playerId, targetCard };
  runEffects(s, action.effects, ctx);

  if (ctx.playedCard) {
    log(s, playerId, `${short(playerId)} played ${cardLabel(ctx.playedCard)}.`);
    fireTriggers(s, 'cardPlayed', ctx.playedCard, ctx);
    fireRules(s, 'cardPlayed', ctx);
  } else if (move.actionId === 'drawCard') {
    log(s, playerId, `${short(playerId)} drew a card.`);
    fireRules(s, 'cardDrawn', ctx);
  }

  // Draw-pile-empty triggers (e.g. reshuffle).
  fireDrawPileTriggers(s);
  if (s.phase !== 'playing') return s;

  s.ply += 1;
  fireRules(s, 'turnEnd', ctx);
  if (s.phase !== 'playing') return s;

  // If a choice is pending (e.g. wild suit) or a simultaneous pass just started, pause here —
  // turn does not advance until it resolves.
  if (s.pendingChoice) return s;
  if (s.passDirection) return s;

  advanceAndCheck(s);
  if (s.phase === 'playing') fireRules(s, 'turnStart', { playerId: s.players[s.turnIndex] });
  return s;
}

// Resolves a fully-collected simultaneous pass: every player's chosen card moves to their
// neighbor at once, using each player's ORIGINAL choice (nobody can react to what they're
// about to receive). Then resumes whatever turn flow was paused when the pass began.
// Contribute to a simultaneous pass. Any player may submit this, in any order, in any family;
// a multi-card pass stages picks until the full count is in. The swap only resolves once
// everyone has committed.
function applyChoosePass(s: MatchState, playerId: string, move: Move): MatchState {
  if (!s.passDirection || playerId in s.passChoices) return s;
  const hand = s.zones[`hand:${playerId}`] || [];
  const staged = s.passStaged[playerId] || [];
  if (!hand.some((c) => c.id === move.cardId) || staged.includes(move.cardId!)) return s;
  const next = [...staged, move.cardId!];
  if (next.length < s.passCount) { s.passStaged[playerId] = next; return s; }
  delete s.passStaged[playerId];
  s.passChoices[playerId] = next;
  log(s, playerId, `${short(playerId)} picks ${next.length === 1 ? 'a card' : `${next.length} cards`} to pass.`);
  if (s.players.every((p) => p in s.passChoices)) resolvePassCards(s);
  return s;
}

function resolvePassCards(s: MatchState): void {
  const dir = s.passDirection!;
  const n = s.players.length;
  const offset = dir === 'left' ? 1 : dir === 'right' ? -1 : Math.floor(n / 2);
  const picks = s.players.map((from, i) => ({
    from, to: s.players[((i + offset) % n + n) % n], cardIds: s.passChoices[from] || [],
  }));
  // Lift every card out first, then deliver — otherwise a pass can hand on a card it just got.
  const lifted = picks.map(({ from, to, cardIds }) => {
    const hand = s.zones[`hand:${from}`];
    const cards: Card[] = [];
    for (const id of cardIds) {
      const idx = hand.findIndex((c) => c.id === id);
      if (idx >= 0) cards.push(...hand.splice(idx, 1));
    }
    return { to, cards };
  });
  for (const { to, cards } of lifted) s.zones[`hand:${to}`].push(...cards);
  log(s, null, `Cards passed ${dir}.`);
  s.passDirection = null;
  s.passChoices = {};
  s.passStaged = {};
  s.passCount = 1;
  // A pre-hand exchange resumes at the opening lead, not at the next seat in turn order; the
  // mid-hand sweep effect is the one that resumes normal shedding flow.
  if (s.definition.trick) { s.turnIndex = openingLeadSeat(s); return; }
  advanceAndCheck(s);
}

// Who leads trick 1: the holder of the designated lead card (Hearts' 2♣), else the dealer's
// left — never a flat seat 0, or a game with no lead card would open every hand at the same seat.
function openingLeadSeat(s: MatchState): number {
  const fallback = (s.dealerIndex + 1) % s.players.length;
  const lead = s.definition.trick?.leadCard;
  if (!lead) return fallback;
  const i = s.players.findIndex((p) => (s.zones[`hand:${p}`] || []).some((c) => c.id === lead));
  return i >= 0 ? i : fallback;
}

// A pre-hand exchange (Hearts): everyone gives `count` cards at once before any trick is played.
// 'hold' hands skip the exchange entirely.
function startHandPass(s: MatchState): void {
  const cfg = s.definition.handPass;
  if (!cfg || cfg.rotation.length === 0) return;
  const dir = cfg.rotation[(s.handNumber - 1) % cfg.rotation.length];
  if (dir === 'hold') { log(s, null, 'No pass this hand.'); return; }
  if (dir === 'across' && s.players.length % 2 !== 0) return; // no seat directly opposite
  s.passDirection = dir;
  s.passCount = Math.max(1, cfg.count);
  s.passChoices = {};
  s.passStaged = {};
  log(s, null, `Pass ${cfg.count} card${cfg.count === 1 ? '' : 's'} ${dir}.`);
}

function advanceAndCheck(s: MatchState): void {
  if (checkEnd(s)) return;
  // Extra-turn cards: the same player goes again (unless they've stalled out).
  if (s.repeatTurn) {
    s.repeatTurn = false;
    if (legalMoves(s, s.players[s.turnIndex]).length > 0) return;
  }
  advanceTurn(s);
  // Deadlock guard: if the whole table has stalled with no productive move, end the round.
  if (s.stallCount >= s.players.length) {
    endRound(s, 'stalemate');
    return;
  }
  // If the new current player has no legal move at all, end by lowest hand.
  if (legalMoves(s, s.players[s.turnIndex]).length === 0) {
    // Give a custom rule a chance to penalize the stuck player before the hand's scores
    // (state.bonus, folded in by finalizeMatchProgress) are locked in.
    fireRules(s, 'roundStuck', { playerId: s.players[s.turnIndex] });
    endRound(s, 'stuck');
  }
}

function advanceTurn(s: MatchState): void {
  const n = s.players.length;
  const steps = 1 + s.skipCount;
  s.skipCount = 0;
  s.turnIndex = ((s.turnIndex + s.direction * steps) % n + n) % n;
}

/**
 * Run the author's hooks after a family handler has done its work.
 *
 * Which card was played is worked out by diffing the hand rather than threaded through every
 * handler: the families move cards in half a dozen different ways, and a diff is true for all
 * of them without six separate call sites to keep in step.
 */
function afterFamilyMove(s: MatchState, playerId: string, handBefore: Card[]): MatchState {
  s.ply += 1;
  if (!s.definition.rules?.length) return s;

  const after = new Set((s.zones[`hand:${playerId}`] || []).map((c) => c.id));
  const played = handBefore.find((c) => !after.has(c.id));
  const ctx: Ctx = { playerId, targetCard: played };

  // The hand ending is a moment rules obviously want — "double the last hand", "pay out the
  // pool" — and it used to be the one moment they were guaranteed to miss, because this
  // wrapper returned early the instant the phase stopped being 'playing'. These two fire on
  // the way out instead, and deliberately after the family has finished scoring.
  if (s.phase !== 'playing') {
    fireHandEnd(s, playerId);
    return s;
  }

  // Somebody going out is likewise a moment, and one only this wrapper can see: it knows what
  // the hand held before the move and what it holds now.
  const wentOut = handBefore.length > 0 && after.size === 0;

  if (played) fireRules(s, 'cardPlayed', ctx);
  if (s.phase !== 'playing') { fireHandEnd(s, playerId); return s; }
  if (wentOut) fireRules(s, 'playerOut', ctx);
  if (s.phase !== 'playing') { fireHandEnd(s, playerId); return s; }
  fireRules(s, 'turnEnd', ctx);
  if (s.phase !== 'playing') { fireHandEnd(s, playerId); return s; }
  fireRules(s, 'turnStart', { playerId: s.players[s.turnIndex] });
  return s;
}

/**
 * The end-of-hand hooks, fired once however the hand finished.
 *
 * Guarded by a flag rather than by where it is called from, because a hand can end down any of
 * eighteen paths in this file and every one of them would otherwise need to remember.
 */
function fireHandEnd(s: MatchState, playerId: string): void {
  if (!s.definition.rules?.length || s.handEndFired) return;
  s.handEndFired = true;
  const ctx: Ctx = { playerId };
  fireRules(s, 'handEnd', ctx);
  if (isMatchOver(s)) fireRules(s, 'matchEnd', ctx);
}

// ---------- author-written rules ----------
//
// The hooks a CustomRule can attach to. These fire the same way for a game somebody built this
// morning as for Hearts: same engine, same order, same clone-then-mutate discipline.

/**
 * Where one variable actually lives.
 *
 * Unscoped, it is a single entry in a flat bag shared by the whole table — right for "have
 * hearts been broken", wrong for anything each player owns, because the next player's write
 * lands on the same key. `per` moves it under a player.
 */
function varKey(state: MatchState, name: string, per: PlayerRef | undefined, ctx: Ctx): string {
  if (!per) return name;
  const who = refToPlayers(state, per, ctx.playerId);
  // "everyone" has no single owner, so it falls back to the shared bag rather than silently
  // writing to whichever seat happened to come back first.
  return who.length === 1 ? `${who[0]}:${name}` : name;
}

/** Note that a var should survive the deal. Recorded on state so nextHand can carry it. */
function rememberVar(state: MatchState, name: string): void {
  if (!state.keepVars.includes(name)) state.keepVars.push(name);
}

function fireRules(state: MatchState, hook: RuleHook, ctx: Ctx & { playedCard?: Card }): void {
  const rules = state.definition.rules;
  if (!rules || rules.length === 0) return;
  state.stopRules = false;
  for (const rule of rules) {
    if (rule.enabled === false) continue;
    if (rule.when !== hook) continue;
    if (rule.cardHasTag) {
      const card = ctx.targetCard ?? ctx.playedCard;
      if (!card || !cardTags(state.definition, card).includes(rule.cardHasTag)) continue;
    }
    if (rule.if && !evalPredicate(state, rule.if, ctx)) continue;
    runEffects(state, rule.then, ctx);
    // A rule that ended the hand stops the rest — nothing should run after the scores are in.
    if (state.phase !== 'playing') return;
    // …and one that said so explicitly stops the rest too, which is how an author writes
    // "this case is handled, don't fall through to the general rule below".
    if (state.stopRules) { state.stopRules = false; return; }
  }
}

// Item 93 of the audit pass: a genuine tie used to resolve to whichever tied player happened to
// sit lowest in seat order (the `> 0` comparison below never fires for an exact tie, so `best`
// simply never moves past the first one reached) — the same seat-0-wins-every-stalemate shape
// as the fairness bugs already found and fixed elsewhere (items 4, 16-18, 91). Reachable through
// any author-written custom rule ending the hand on "highest score"/"lowest score".
/** Which player scores best (dir 1) or worst (dir -1) by some measure. */
export function bestBy(state: MatchState, get: (p: string) => number, dir: 1 | -1): string {
  let best = state.players[0];
  let tied = [best];
  for (const p of state.players.slice(1)) {
    const cmp = (get(p) - get(best)) * dir;
    if (cmp > 0) { best = p; tied = [p]; }
    else if (cmp === 0) tied.push(p);
  }
  if (tied.length === 1) return best;
  const { result, rngState } = seededShuffle(tied, state.rngState);
  state.rngState = rngState;
  return result[0];
}

// ---------- triggers ----------

function fireTriggers(state: MatchState, on: 'cardPlayed', card: Card, ctx: Ctx): void {
  const def = state.definition;
  for (const trig of def.triggers) {
    if (trig.on !== on) continue;
    if (trig.cardHasTag && !cardTags(def, card).includes(trig.cardHasTag)) continue;
    runEffects(state, trig.do, ctx);
  }
}

function fireDrawPileTriggers(state: MatchState): void {
  const def = state.definition;
  const drawZone = def.zones.find((z) => z.shared && z.type === 'pile' && z.visibility === 'none');
  if (!drawZone) return;
  if (state.zones[drawZone.id].length > 0) return;
  for (const trig of def.triggers) {
    if (trig.on === 'drawPileEmpty') runEffects(state, trig.do, { playerId: state.players[state.turnIndex] });
  }
  fireRules(state, 'drawPileEmpty', { playerId: state.players[state.turnIndex] });
}

// ---------- end conditions & scoring ----------

function checkEnd(state: MatchState): boolean {
  const def = state.definition;
  for (const ec of def.endConditions) {
    const { zone, eq } = ec.when.zoneCount;
    for (const p of state.players) {
      const key = zoneDef(def, zone).perPlayer ? `${zone}:${p}` : zone;
      if ((state.zones[key]?.length ?? 0) === eq) {
        endRound(state, 'won', p);
        return true;
      }
    }
  }
  return false;
}

function endRound(state: MatchState, reason: 'won' | 'stalemate' | 'stuck', winnerHint?: string): void {
  state.phase = 'roundOver';
  const winner = computeWinner(state, winnerHint);
  state.winner = winner;
  if (reason === 'won') log(state, null, `${short(winner!)} wins — hand emptied!`);
  else log(state, null, `Round over (${reason}). Winner by fewest points: ${short(winner!)}.`);
  finalizeMatchProgress(state);
}

function computeWinner(state: MatchState, winnerHint?: string): string {
  const def = state.definition;
  const s: ScoringDef = def.scoring;
  // Always tally remaining hand points into state.scores — even in firstOut mode, where the
  // hand's WINNER is whoever went out (winnerHint), but everyone's points still need to be
  // known so a multi-hand match can accumulate them (classic Crazy-Eights-style scoring).
  const highest = s.winner === 'highestTotal';
  let best: string = state.players[0];
  let bestPts = highest ? -Infinity : Infinity;
  for (const p of state.players) {
    const hand = state.zones[`hand:${p}`] || [];
    const pts = hand.reduce((sum, c) => sum + cardPoints(s, c), 0);
    state.scores[p] = pts;
    if (highest ? pts > bestPts : pts < bestPts) { bestPts = pts; best = p; }
  }
  return s.winner === 'firstOut' && winnerHint ? winnerHint : best;
}

/**
 * What one card is worth when a hand is scored.
 *
 * Read most-specific-first: the exact card ("SQ"), then its suit ("H"), then its rank ("Q"),
 * then whatever `default` says. Rank was the only one of those the scorer used to look at,
 * which meant "hearts are worth a point each" and "the queen of spades is worth thirteen" —
 * both of which the TRICK scorer had understood for as long as it has existed — were
 * inexpressible the moment a game counted points in hand instead of in tricks.
 */
export function cardPoints(s: ScoringDef, card: Card): number {
  const cp = s.cardPoints || {};
  const resolve = (v: number | 'rankValue' | undefined): number | null => {
    if (v === 'rankValue') return rankValue(card.rank);
    return typeof v === 'number' ? v : null;
  };
  const exact = resolve(cp[card.suit + card.rank]);
  if (exact !== null) return exact;
  const bySuit = resolve(cp[card.suit]);
  if (bySuit !== null) return bySuit;
  const byRank = resolve(cp[card.rank]);
  if (byRank !== null) return byRank;
  return resolve(cp.default) ?? 0;
}

function rankValue(rank: string): number {
  if (rank === 'A') return 1;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  if (rank === 'JOKER') return 50;
  const n = parseInt(rank, 10);
  return Number.isNaN(n) ? 0 : n;
}

// True once THIS HAND has ended (a family's end-round function ran). A match may continue
// into another hand after this — check isMatchOver for that.
export function isTerminal(state: MatchState): boolean {
  return state.phase === 'roundOver';
}

// Every player who currently needs to submit a move. Almost always a single player (whoever's
// turn it is, or whoever owes a pending choice) — but a simultaneous pass can have several
// players acting at once, none of them necessarily the seat whose turn it nominally is.
export function actingPlayers(state: MatchState): string[] {
  if (state.phase !== 'playing') return [];
  if (state.pendingChoice) return [state.pendingChoice.player];
  if (state.discarding) return [state.discarding];
  if (state.passDirection) return state.players.filter((p) => !(p in state.passChoices));
  // Pit has no turn order at all — every player who still has legal moves is "acting" on
  // every tick, the same way a simultaneous pass works.
  if (state.definition.pit) return state.players.filter((p) => pitLegalMoves(state, p).length > 0);
  if (state.definition.kent) return state.players.filter((p) => kentLegalMoves(state, p).length > 0);
  // Nobody's turn: everyone is looking at the same board, and whoever calls first gets it.
  if (state.definition.set) return setLegalMoves(state).length > 0 ? state.players.slice() : [];
  const current = state.players[state.turnIndex];
  if (state.definition.climb?.bombSize) {
    // A bomb can interrupt out of turn — anyone holding one is also "acting" right now.
    const bombers = state.players.filter((p) => p !== current && climbBombMoves(state, p).length > 0);
    if (bombers.length > 0) return [current, ...bombers];
  }
  if (state.definition.bluff && state.pendingClaim) {
    // Anyone but the claimant may challenge right now, on top of whoever's turn it is.
    const challengers = state.players.filter((p) => p !== state.pendingClaim!.player);
    return [...new Set([current, ...challengers])];
  }
  if (state.definition.reflex) {
    const flipper = reflexNextFlipper(state, state.turnIndex);
    if (reflexSlapValid(state)) return [...new Set([flipper, ...reflexActive(state)].filter((p): p is string => !!p))];
    return flipper ? [flipper] : [];
  }
  return [current];
}

// True once the MATCH has ended: either this game has no points target (a match is exactly
// one hand, the legacy behavior), or a player's cumulative score has crossed the target.
export function isMatchOver(state: MatchState): boolean {
  return state.phase === 'roundOver' && state.matchOver;
}

// Every family's end-round function calls this once state.scores (this hand's points) and
// state.winner are final. It folds the hand into the running match score and decides whether
// the match continues or someone has crossed the target.
function finalizeMatchProgress(s: MatchState): void {
  // Fold in rule-awarded points before the roll-up. Every family routes through here, so this
  // is the one place that has to know about it.
  for (const p of s.players) {
    if (s.bonus[p]) s.scores[p] = (s.scores[p] ?? 0) + s.bonus[p];
  }
  s.bonus = {};

  // Chips are a stack, not a score to add up.
  //
  // A betting game's running total is what you are holding right now, so it is assigned rather
  // than accumulated, and the scorepad's row is what the hand won or lost you. The sitting ends
  // when the last hand has been played or somebody runs out of chips, and the biggest stack
  // takes it — one hand and out meant posting a blind, calling once, and being told the game
  // was over with everyone still holding nearly all their chips.
  // Kent is scored in letters, not points. A round is a hand; the game is over when a pair has
  // spelt the whole word, and the other pair has won it.
  if (s.definition.kent) {
    const word = s.definition.kent.letters.length;
    const row: Record<string, number> = {};
    for (const p of s.players) row[p] = s.scores[p] ?? 0;
    s.handScores.push(row);
    for (const p of s.players) s.matchScores[p] = (s.matchScores[p] ?? 0) + (s.scores[p] ?? 0);
    // At 4 players this is a straight two-pair contest. At 6 it is three pairs, and spelling the
    // whole word only eliminates the pair that spelt it — the winner is whichever surviving pair
    // is furthest from spelling it themselves, ties (including the ordinary 2-pair case) broken
    // fairly at random rather than by seat order.
    const teams = [...new Set(s.players.map((p) => kentTeamOf(s, p)))];
    const spelledOut = teams.filter((t) => (s.kentLetters[t] ?? 0) >= word);
    if (spelledOut.length > 0) {
      const surviving = teams.filter((t) => !spelledOut.includes(t));
      const bestLetters = surviving.length > 0 ? Math.min(...surviving.map((t) => s.kentLetters[t] ?? 0)) : 0;
      const bestTeams = surviving.filter((t) => (s.kentLetters[t] ?? 0) === bestLetters);
      let won: string | undefined;
      if (bestTeams.length <= 1) {
        won = bestTeams[0];
      } else {
        const { result, rngState } = seededShuffle(bestTeams, s.rngState);
        s.rngState = rngState;
        won = result[0];
      }
      s.matchOver = true;
      s.matchWinner = won ? (s.players.find((p) => kentTeamOf(s, p) === won) ?? null) : null;
      log(s, null,
        `Pair ${spelledOut.join(' & ')} spell${spelledOut.length === 1 ? 's' : ''} ${s.definition.kent.letters}`
        + (won ? ` — pair ${won} takes the game.` : '.'));
    } else {
      s.matchOver = false;
      s.matchWinner = null;
    }
    return;
  }

  if (s.definition.poker) {
    const start = s.definition.poker.startingChips;
    const row: Record<string, number> = {};
    for (const p of s.players) {
      const before = s.handNumber === 1 ? start : (s.matchScores[p] ?? start);
      row[p] = (s.chips[p] ?? 0) - before;
      s.matchScores[p] = s.chips[p] ?? 0;
    }
    s.handScores.push(row);
    const hands = s.definition.poker.hands ?? 1;
    const broke = s.players.filter((p) => (s.chips[p] ?? 0) <= 0);
    if (s.handNumber >= hands || broke.length > 0) {
      s.matchOver = true;
      let best = s.players[0];
      for (const p of s.players) if ((s.chips[p] ?? 0) > (s.chips[best] ?? 0)) best = p;
      s.matchWinner = best;
      log(s, null, broke.length > 0
        ? `${short(broke[0])} is out of chips — ${short(best)} takes the table with ${s.chips[best] ?? 0}.`
        : `That's the last hand — ${short(best)} takes the table with ${s.chips[best] ?? 0}.`);
    } else {
      s.matchOver = false;
      s.matchWinner = null;
    }
    return;
  }

  // The scorepad's row for this hand, written before the roll-up so the column always sums to
  // the running total rather than merely agreeing with it by construction elsewhere.
  const row: Record<string, number> = {};
  for (const p of s.players) row[p] = s.scores[p] ?? 0;
  s.handScores.push(row);
  for (const p of s.players) s.matchScores[p] = (s.matchScores[p] ?? 0) + (s.scores[p] ?? 0);
  const scoring = s.definition.scoring;

  // Busting out (e.g. Spades' "-200 and you're out") ends the match immediately, below-target,
  // as a loss for whoever crossed it — the best-placed of everyone else wins.
  const bust = scoring.bust;
  if (bust != null) {
    const busted = s.players.filter((p) => s.matchScores[p] <= bust);
    if (busted.length > 0 && busted.length < s.players.length) {
      s.matchOver = true;
      const survivors = s.players.filter((p) => !busted.includes(p));
      let best = survivors[0];
      let bestV = -Infinity;
      for (const p of survivors) { const v = s.matchScores[p]; if (v > bestV) { bestV = v; best = p; } }
      s.matchWinner = best;
      log(s, null, `Match over — ${short(busted[0])} dropped to ${s.matchScores[busted[0]]} (bust at ${bust}); ${short(best)} wins.`);
      return;
    }
  }

  const target = scoring.target;
  if (target == null) { s.matchOver = true; s.matchWinner = s.winner; return; }
  const crossed = s.players.some((p) => s.matchScores[p] >= target);
  if (!crossed) { s.matchOver = false; s.matchWinner = null; return; }
  s.matchOver = true;
  const highest = scoring.winner === 'highestTotal';
  let best = s.players[0];
  let bestV = highest ? -Infinity : Infinity;
  for (const p of s.players) {
    const v = s.matchScores[p];
    if (highest ? v > bestV : v < bestV) { bestV = v; best = p; }
  }
  s.matchWinner = best;
  log(s, null, `Match over — ${short(best)} wins with ${bestV} points.`);
}

// Deals a fresh hand, continuing an in-progress match (running score carries forward).
// Caller must check !isMatchOver(state) first — this does not check for you.
export function nextHand(state: MatchState, seed: number): MatchState {
  return createMatch(state.definition, state.players, seed, {
    matchScores: { ...state.matchScores },
    handScores: state.handScores.map((r) => ({ ...r })),
    handNumber: state.handNumber + 1,
    // Chips are the whole point of a betting game: the stack you finished the last hand with
    // is the stack you sit down with for the next one.
    chips: state.definition.poker ? { ...state.chips } : undefined,
    kentLetters: state.definition.kent ? { ...state.kentLetters } : undefined,
    // Author counters that asked to survive the deal. Everything else in vars is deliberately
    // wiped: a hand starts clean unless a rule said otherwise.
    keepVars: state.keepVars.slice(),
    vars: Object.fromEntries(state.keepVars
      .flatMap((name) => Object.entries(state.vars).filter(([k]) => k === name || k.endsWith(`:${name}`)))),
  });
}

/**
 * Points for combinations a player was dealt, awarded before anything is played.
 *
 * Counted by consuming cards: a hand holding two of every card in a meld scores it twice, and a
 * card already spent on one copy cannot be counted again for the next. Awarded through the same
 * `bonus` channel author-written rules use, so it folds into the hand score wherever that is
 * finally worked out rather than needing its own path through every family's scorer.
 */
export function scoreMelds(s: MatchState): void {
  const literal = s.definition.trick?.melds ?? [];
  const patterns = s.definition.trick?.meldPatterns ?? [];
  if (literal.length === 0 && patterns.length === 0) return;

  // Every suit actually in the deck, so a pattern expands correctly whether it is a full pack
  // or a short one — Skat's 32 cards are still all four suits, but a hypothetical three-suit
  // deck should not be checked against a fourth that was never dealt.
  const suits = [...new Set(buildDeck(s.definition).map((c) => c.suit))];
  const trump = trumpOf(s);
  const all = [
    ...literal.map((m) => ({ name: m.name, cards: m.cards, points: m.points })),
    ...patterns.flatMap((m) => suits.map((suit) => ({
      name: suit === trump && m.doubleInTrump ? `the royal ${m.name}` : `a ${m.name} in ${suitName(suit)}`,
      cards: m.ranks.map((r) => `${suit}${r}`),
      points: suit === trump && m.doubleInTrump ? m.points * 2 : m.points,
    }))),
  ];

  for (const p of s.players) {
    const hand = s.zones[`hand:${p}`] || [];
    for (const meld of all) {
      const pool = hand.map((c) => `${c.suit}${c.rank}`);
      let copies = 0;
      // Keep taking whole copies out of the pool until one cannot be completed.
      for (;;) {
        const taking: number[] = [];
        for (const want of meld.cards) {
          const at = pool.findIndex((k, i) => k === want && !taking.includes(i));
          if (at < 0) { taking.length = 0; break; }
          taking.push(at);
        }
        if (taking.length !== meld.cards.length) break;
        for (const i of taking.sort((a, b) => b - a)) pool.splice(i, 1);
        copies++;
      }
      if (copies > 0) {
        s.bonus[p] = (s.bonus[p] ?? 0) + meld.points * copies;
        log(s, null, `${short(p)} melds ${meld.name}${copies > 1 ? ` ×${copies}` : ''} for ${meld.points * copies}.`);
      }
    }
  }
}

// ---------- trick-taking family ----------

// Trump is normally fixed by the definition, but an auction game names it per hand. Both kinds
// of auction count: a contract auction sets it from the winning strain, and no-trump leaves it
// unset on purpose, which is exactly 'none'.
export function trumpOf(s: MatchState): Suit | 'none' {
  const cfg = s.definition.trick!;
  if (cfg.auction || cfg.numericAuction || cfg.turnedTrump) return s.trumpSuit ?? 'none';
  return cfg.trump;
}

const SAME_COLOUR: Record<string, string> = { C: 'S', S: 'C', H: 'D', D: 'H' };

// The left bower is a trump card, not a card of its printed suit — for following suit AND for
// resolving the trick. Every suit comparison in this family goes through here.
export function suitOf(s: MatchState, card: Card): string {
  const t = trumpOf(s);
  // A ranking joker has no printed suit worth honouring: it follows whatever was led, so it is
  // always legal to play and always counts as following suit. Leading one names trump as the
  // suit (or, with no trump, leaves the led suit as JOKER — which nobody else holds, so the
  // rest of the table plays what it likes).
  const jr = s.definition.trick!.jokerRank;
  if (card.rank === 'JOKER' && jr && jr !== 'low') {
    if (jr === 'trump' && t !== 'none') return t;
    return s.lead ?? (t !== 'none' ? t : card.suit);
  }
  // Every jack belongs to trump, not to the suit on its face — so a jack of diamonds does not
  // follow diamonds, and holding one does not stop you being void.
  if (s.definition.trick!.jacksAreTrumps && card.rank === 'J') return t === 'none' ? 'J' : t;
  if (!s.definition.trick!.bowers || t === 'none') return card.suit;
  if (card.rank === 'J' && card.suit === SAME_COLOUR[t]) return t;
  return card.suit;
}

// Rank within a trick: a ranking joker tops everything, then the right bower, then the left,
// then the rest of the rank order.
export function trickStrength(s: MatchState, card: Card): number {
  const cfg = s.definition.trick!;
  const t = trumpOf(s);
  if (card.rank === 'JOKER' && cfg.jokerRank && cfg.jokerRank !== 'low') return 5000;
  // Clubs, spades, hearts, diamonds — the fixed order of the four top trumps.
  if (cfg.jacksAreTrumps && card.rank === 'J') {
    return 4000 + (({ C: 3, S: 2, H: 1, D: 0 } as Record<string, number>)[card.suit] ?? 0);
  }
  if (cfg.bowers && t !== 'none' && card.rank === 'J') {
    if (card.suit === t) return 3000;
    if (card.suit === SAME_COLOUR[t]) return 2900;
  }
  const base = s.definition.deck.rankOrder.indexOf(card.rank as never);
  return cfg.aceHigh && card.rank === 'A' ? 1000 : base;
}

function trickLegalMoves(state: MatchState, playerId: string): Move[] {
  const cfgEarly = state.definition.trick!;

  // Naming trump after winning a chooseTrumpAfter auction (see settleContract) is the trick
  // family's own use of the engine-wide pendingChoice pause. Trick games route here directly
  // rather than through the generic dispatcher that already checks this, so it needs its own
  // check — without it, the winning bidder had zero legal moves and the hand stalled forever.
  if (state.pendingChoice) {
    if (state.pendingChoice.player !== playerId) return [];
    return (['C', 'D', 'H', 'S'] as const).map((suit) => ({ actionId: 'resolveChoice', choice: suit }));
  }

  // The dealer owes a discard after taking the upcard — nothing else can happen until they do.
  if (state.discarding) {
    if (state.discarding !== playerId) return [];
    return (state.zones[`hand:${playerId}`] || []).map((c) => ({ actionId: 'dealerDiscard', cardId: c.id }));
  }

  if (state.sittingOut === playerId) return [];   // partner is out while the maker plays alone
  if (state.players[state.turnIndex] !== playerId) return [];
  const def = state.definition;

  // A contract auction: bid a level and a strain, or pass. Every bid must beat the last.
  if (state.auctionRound > 0 && cfgEarly.numericAuction) {
    return contractBidMoves(state);
  }

  // Trump auction: take the turned-up suit (round 1) or name one (round 2), or pass.
  if (state.auctionRound > 0 && cfgEarly.auction) {
    const moves: Move[] = [];
    const up = topCard(state.zones[cfgEarly.auction.upcardZone] || []);
    if (state.auctionRound === 1) {
      if (up) moves.push({ actionId: 'orderUp', choice: up.suit });
    } else {
      // Round 2 bars the suit that was just turned down.
      for (const suit of ['C', 'D', 'H', 'S'] as const) {
        if (suit !== state.turnedDownSuit) moves.push({ actionId: 'nameTrump', choice: suit });
      }
    }
    if (cfgEarly.goAlone) {
      for (const m of [...moves]) moves.push({ ...m, alone: true });
    }
    // "Screw the dealer": on the last call of the final round the dealer must name something,
    // so a hand can never be passed out forever.
    const lastCall = state.auctionRound === cfgEarly.auction.rounds
      && state.auctionPasses === state.players.length - 1;
    if (!lastCall) moves.push({ actionId: 'passBid' });
    return moves;
  }

  // Bidding phase: bid 0..handSize tricks.
  if (state.bidding) {
    const n = (state.zones[`hand:${playerId}`] || []).length;
    return Array.from({ length: n + 1 }, (_, i) => ({ actionId: 'bid', choice: String(i) }));
  }
  const cfg = def.trick!;
  const hand = state.zones[`hand:${playerId}`] || [];
  const firstTrick = Object.values(state.tricksWon).reduce((a, b) => a + b, 0) === 0;

  // The designated opening card (Hearts' 2♣) must be led, and nothing else may be.
  if (firstTrick && cfg.leadCard && state.trickPlays.length === 0) {
    const forced = hand.find((c) => c.id === cfg.leadCard);
    if (forced) return [{ actionId: 'playToTrick', cardId: forced.id }];
  }

  let playable = hand;
  // Must follow the led suit if you hold one. Effective suit, so the left bower follows trump.
  if (cfg.mustFollowSuit && state.lead) {
    const following = hand.filter((c) => suitOf(state, c) === state.lead);
    if (following.length) playable = following;
    // A ranking joker (jokerRank 'trump' or 'high') is never bound by follow-suit: it can beat
    // any trick regardless of what was led, so holding the led suit doesn't lock it out. Without
    // this it would silently vanish from `playable` whenever suitOf() reports it as trump rather
    // than the led suit and the hand also holds a card of that led suit.
    if (cfg.jokerRank && cfg.jokerRank !== 'low') {
      const rankingJokers = hand.filter((c) => c.rank === 'JOKER' && !playable.includes(c));
      if (rankingJokers.length) playable = [...playable, ...rankingJokers];
    }
  }

  // Leading the "broken" suit is barred until it has shown up in a trick — unless it's all
  // you hold.
  if (cfg.brokenSuit && !state.brokenSuitPlayed && state.trickPlays.length === 0) {
    const others = playable.filter((c) => c.suit !== cfg.brokenSuit);
    if (others.length) playable = others;
  }

  // The opening trick takes no points if the rule is on — again, unless you have nothing else.
  if (firstTrick && cfg.noPenaltyFirstTrick) {
    const safe = playable.filter((c) => penaltyOf(cfg, c) === 0);
    if (safe.length) playable = safe;
  }

  return playable.map((c) => ({ actionId: 'playToTrick', cardId: c.id }));
}

function penaltyOf(cfg: TrickConfig, card: Card): number {
  const p = cfg.penaltyPoints;
  if (!p) return 0;
  return (p[card.rank] ?? 0) + (p[card.suit] ?? 0) + (p[card.suit + card.rank] ?? 0);
}

function applyTrickMove(s: MatchState, playerId: string, move: Move): MatchState {
  // A contract auction settles who plays and what they promised before a card is played.
  if (s.auctionRound > 0 && s.definition.trick?.numericAuction) {
    return applyContractBid(s, playerId, move);
  }

  // Trump auction and the dealer's discard.
  if (s.discarding || s.auctionRound > 0) {
    const auctionMoves = trickLegalMoves(s, playerId);
    if (!auctionMoves.some((m) => m.actionId === move.actionId && m.choice === move.choice
      && !!m.alone === !!move.alone && m.cardId === move.cardId)) return s;
    return applyAuctionMove(s, playerId, move);
  }

  // Bidding phase.
  if (s.bidding) {
    const bidMoves = trickLegalMoves(s, playerId);
    if (!bidMoves.some((m) => m.actionId === move.actionId && m.choice === move.choice)) return s;
    s.bids[playerId] = parseInt(move.choice!, 10);
    log(s, playerId, `${short(playerId)} bids ${move.choice}${move.choice === '0' ? ' (nil)' : ''}.`);
    fireRules(s, 'bidMade', { playerId });
    // Bidding opened at the dealer's left and goes all the way around, so the last bid is the
    // dealer's own — the lead then passes back to the same seat bidding started at, not to a
    // flat seat 0, or the dealer's neighbour would open trick one of every single hand.
    if (Object.keys(s.bids).length >= s.players.length) {
      s.bidding = false;
      s.turnIndex = (s.dealerIndex + 1) % s.players.length;
    }
    else s.turnIndex = ((s.turnIndex + s.direction) % s.players.length + s.players.length) % s.players.length;
    return s;
  }

  const legal = trickLegalMoves(s, playerId);
  const chosen = legal.find((m) => m.cardId === move.cardId);
  if (!chosen) return s;

  const hand = s.zones[`hand:${playerId}`];
  const idx = hand.findIndex((c) => c.id === move.cardId);
  const card = hand[idx];
  hand.splice(idx, 1);
  const trickZone = s.definition.zones.find((z) => z.type === 'trick')!;
  s.zones[trickZone.id].push(card);
  const leadingThis = s.trickPlays.length === 0;
  if (leadingThis) { s.lead = suitOf(s, card) as MatchState['lead']; s.lastTrick = null; }
  const brk = s.definition.trick!.brokenSuit;
  if (brk && card.suit === brk && !s.brokenSuitPlayed) {
    s.brokenSuitPlayed = true;
    log(s, null, `${suitName(brk)} are broken.`);
  }
  s.trickPlays.push({ player: playerId, card });
  log(s, playerId, `${short(playerId)} played ${cardLabel(card)}.`);
  // Leading a trick is its own decision, distinct from following one — "you may not lead a
  // heart", "leading the ace pays a bonus". It had no hook until now.
  if (leadingThis) fireRules(s, 'trickLed', { playerId, targetCard: card });

  if (s.trickPlays.length < activeSeats(s).length) {
    s.turnIndex = nextIndex(s);
    return s;
  }
  resolveTrick(s, trickZone.id);
  return s;
}

// The trump auction: order up the turned card's suit, name a different one, or pass. When
// everyone passes twice the hand is dead and gets thrown in.
function applyAuctionMove(s: MatchState, playerId: string, move: Move): MatchState {
  const cfg = s.definition.trick!;
  const auction = cfg.auction!;

  if (move.actionId === 'dealerDiscard') {
    const hand = s.zones[`hand:${playerId}`];
    const i = hand.findIndex((c) => c.id === move.cardId);
    if (i < 0) return s;
    hand.splice(i, 1);
    s.discarding = null;
    log(s, playerId, `${short(playerId)} discards.`);
    beginTrickPlay(s);
    return s;
  }

  if (move.actionId === 'passBid') {
    s.auctionPasses += 1;
    log(s, playerId, `${short(playerId)} passes.`);
    if (s.auctionPasses < s.players.length) {
      s.turnIndex = nextIndex(s);
      return s;
    }
    // A full circle of passes: move to round 2, or throw the hand in.
    s.auctionPasses = 0;
    if (s.auctionRound === 1 && auction.rounds === 2) {
      s.auctionRound = 2;
      const down = topCard(s.zones[auction.upcardZone] || []);
      s.turnedDownSuit = (down?.suit as MatchState['turnedDownSuit']) ?? null;
      s.zones[auction.upcardZone] = [];       // the upcard is turned down
      s.turnIndex = ((s.dealerIndex + 1) % s.players.length + s.players.length) % s.players.length;
      log(s, null, 'Turned down — name any other suit.');
      return s;
    }
    s.auctionRound = 0;
    log(s, null, 'Nobody took it — the hand is thrown in.');
    endTrickRound(s);
    return s;
  }

  // orderUp / nameTrump
  s.trumpSuit = move.choice as MatchState['trumpSuit'];
  s.maker = playerId;
  s.alone = !!move.alone;
  s.auctionRound = 0;
  s.auctionPasses = 0;
  log(s, playerId, `${short(playerId)} makes ${suitName(move.choice!)} trump${move.alone ? ' — going alone' : ''}.`);

  if (s.alone) {
    const partner = partnerOf(s, playerId);
    if (partner) {
      s.sittingOut = partner;
      log(s, null, `${short(partner)} sits this hand out.`);
    }
  }

  // Ordering it up in round 1 hands the dealer the upcard, and they owe a discard.
  if (move.actionId === 'orderUp' && auction.dealerDiscards) {
    const up = s.zones[auction.upcardZone].pop();
    const dealer = s.players[s.dealerIndex];
    if (up) {
      s.zones[`hand:${dealer}`].push(up);
      log(s, null, `${short(dealer)} takes ${cardLabel(up)}.`);
      s.discarding = dealer;
      return s;
    }
  }
  s.zones[auction.upcardZone] = [];
  beginTrickPlay(s);
  return s;
}

// Trump is settled — the player left of the dealer leads, skipping anyone sitting out.
function beginTrickPlay(s: MatchState): void {
  const n = s.players.length;
  let i = ((s.dealerIndex + 1) % n + n) % n;
  for (let step = 0; step < n && s.players[i] === s.sittingOut; step++) i = (i + 1) % n;
  s.turnIndex = i;
}

function partnerOf(s: MatchState, playerId: string): string | null {
  if (!s.definition.trick?.partnerships || s.players.length !== 4) return null;
  const i = s.players.indexOf(playerId);
  return s.players[(i + 2) % 4];
}

// How many seats actually play this hand (one sits out when the maker goes alone).
function activeSeats(s: MatchState): string[] {
  return s.players.filter((p) => p !== s.sittingOut);
}

function nextIndex(s: MatchState): number {
  const n = s.players.length;
  let i = ((s.turnIndex + s.direction) % n + n) % n;
  for (let step = 0; step < n && s.players[i] === s.sittingOut; step++) {
    i = ((i + s.direction) % n + n) % n;
  }
  return i;
}

/**
 * What a card is worth in the trick currently on the table: trump beats the led suit, the led
 * suit beats a discard, and within a category it is plain rank (bowers included).
 *
 * Exported because the bots have to answer "would this card take it?" and the only correct
 * answer is the referee's own. A bot with its own private idea of what beats what is a bot
 * that mis-plays exactly where the rules are most interesting — bowers, trump, a void.
 */
export function trickValueOf(s: MatchState, card: Card): number {
  const trump = trumpOf(s);
  const suit = suitOf(s, card);
  const category = trump !== 'none' && suit === trump ? 2 : suit === s.lead ? 1 : 0;
  return category * 10000 + trickStrength(s, card);
}

function resolveTrick(s: MatchState, trickZoneId: string): void {
  const cfg = s.definition.trick!;
  const value = (c: Card) => trickValueOf(s, c);

  let winner = s.trickPlays[0];
  for (const play of s.trickPlays) if (value(play.card) > value(winner.card)) winner = play;
  s.tricksWon[winner.player] = (s.tricksWon[winner.player] ?? 0) + 1;

  // Worklist #65: "the engine knows why a trick went the way it did — who was void, what was
  // trump, what beat what. Replay throws all of it away and shows a list." trickValueOf's own
  // category (2 = trump, 1 = the suit led, 0 = a discard) already IS that reason; the ordinary
  // case — highest card of the suit led wins — needs no comment, so only the two genuinely
  // informative outcomes get one: the trick was taken by trump, or nobody at the table could
  // even follow the suit that was led.
  const winCategory = Math.floor(value(winner.card) / 10000);
  const trickReason = winCategory === 2 ? ' — won it with trump'
    : winCategory === 0 ? ' — nobody could follow suit'
    : '';

  // Hearts-style penalty points travel to the trick winner.
  if (cfg.scoreBy === 'penalty' && cfg.penaltyPoints) {
    let pts = 0;
    for (const { card } of s.trickPlays) {
      pts += cfg.penaltyPoints[card.rank] ?? 0;      // by rank
      pts += cfg.penaltyPoints[card.suit] ?? 0;      // by suit (e.g. every Heart)
      pts += cfg.penaltyPoints[card.suit + card.rank] ?? 0; // a specific card (e.g. "SQ")
    }
    s.scores[winner.player] = (s.scores[winner.player] ?? 0) + pts;
  }

  // Hold the finished trick for the table to show until somebody leads again.
  s.lastTrick = { plays: s.trickPlays.map((t) => ({ ...t })), winner: winner.player };
  s.zones[trickZoneId] = [];
  s.trickPlays = [];
  s.lead = null;
  s.turnIndex = s.players.indexOf(winner.player); // winner leads the next trick
  log(s, null, `${short(winner.player)} takes the trick (${s.tricksWon[winner.player]})${trickReason}.`);
  s.ply += 1;
  fireRules(s, 'trickWon', { playerId: winner.player, targetCard: winner.card });

  if (settleContractEarlyIfDecided(s)) return;

  // Round ends when every hand still in play is empty.
  if (activeSeats(s).every((p) => (s.zones[`hand:${p}`] || []).length === 0)) endTrickRound(s);
}

/**
 * `numericAuction.concedeWhenDecided`: once no remaining trick can change which side wins the
 * contract, stop dealing out cards nobody's fate depends on and score it now. Returns true if it
 * ended the hand.
 */
function settleContractEarlyIfDecided(s: MatchState): boolean {
  const cfg = s.definition.trick?.numericAuction;
  if (!cfg?.concedeWhenDecided || !s.highBid) return false;

  const remaining = Math.max(0, ...s.players.map((p) => (s.zones[`hand:${p}`] || []).length));
  if (remaining === 0) return false; // the ordinary hands-empty check above already covers this

  const teams = trickTeams(s);
  const declaring = teams.find((t) => t.includes(s.highBid!.player)) ?? [s.highBid!.player];
  const defending = teams.filter((t) => t !== declaring).flat();
  const need = s.highBid.level + cfg.book;
  const declaringTricks = declaring.reduce((a, p) => a + (s.tricksWon[p] ?? 0), 0);

  let winner: string[] | null = null;
  if (declaringTricks >= need) winner = declaring;                    // already made, whatever's left
  else if (declaringTricks + remaining < need) winner = defending;    // already out of reach

  if (!winner) return false;
  // It does not matter which teammate's tally absorbs the rest — scoreContract sums by side.
  s.tricksWon[winner[0]] = (s.tricksWon[winner[0]] ?? 0) + remaining;
  log(s, null, winner === declaring
    ? `${short(s.highBid.player)}'s contract is unbeatable now — the rest of the hand is conceded.`
    : `${short(s.highBid.player)} can no longer reach the contract — the defence takes the rest of the hand.`);
  endTrickRound(s);
  return true;
}

// ---------- the contract auction (Bridge-style) ----------
//
// What makes this different from every other auction the engine already has is that a bid is
// two things at once — a number and a strain — and it has to beat the last one on both, level
// first. That turns the auction into a negotiation, and it turns the result into a promise:
// the winning side has said how many tricks they will take, and the hand is scored on whether
// they were right rather than on how many they happened to win.
//
// Deliberately not the whole of Bridge: no doubles, no vulnerability, no rubber, and no dummy.
// The declarer plays their own cards.

// Item 16 of the audit pass: when a hand is thrown in with no bid at all, nobody actually won
// it — but `s.winner` still has to name somebody. Picking seat 0 every time meant the same seat
// "won" every stalemate; a seeded shuffle spreads it fairly instead, the same way tie-breaks
// elsewhere in the engine do (see the seededShuffle calls throughout this file).
function fairRandomPlayer(s: MatchState): string {
  const { result, rngState } = seededShuffle(s.players, s.rngState);
  s.rngState = rngState;
  return result[0];
}

/** A bid's place in the order. Higher is stronger; strains are ranked by their config order. */
function bidRank(cfg: NumericAuctionConfig, level: number, strain: Strain): number {
  const i = cfg.strains.indexOf(strain);
  return level * 100 + (i < 0 ? 0 : i);
}

function contractBidMoves(state: MatchState): Move[] {
  const cfg = state.definition.trick!.numericAuction!;
  const n = state.players.length;

  // A level-only auction: nobody names a strain until they've actually won the right to, so a
  // bid is just a number to beat, and there's nothing else to rank it against.
  if (cfg.chooseTrumpAfter) {
    if (cfg.dealerMustBid && !state.highBid && state.auctionPasses === n - 1
      && state.players[state.turnIndex] === state.players[state.dealerIndex]) {
      return [{ actionId: 'contractBid', level: cfg.dealerMustBid }];
    }
    const moves: Move[] = [];
    const floorLevel = state.highBid ? state.highBid.level : cfg.minLevel - 1;
    for (let level = Math.max(cfg.minLevel, floorLevel + 1); level <= cfg.maxLevel; level++) {
      moves.push({ actionId: 'contractBid', level });
    }
    moves.push({ actionId: 'passBid' });
    return moves;
  }

  // Stick the dealer: everybody else has passed and nobody has bid yet, so this is the
  // dealer's last chance — if the game forces a floor here, passing is not one of the options
  // and the only decision left is which suit becomes trump at that fixed level.
  if (cfg.dealerMustBid && !state.highBid && state.auctionPasses === n - 1
    && state.players[state.turnIndex] === state.players[state.dealerIndex]) {
    return cfg.strains.map((strain) => ({ actionId: 'contractBid', level: cfg.dealerMustBid, strain }));
  }

  const moves: Move[] = [];
  const floor = state.highBid ? bidRank(cfg, state.highBid.level, state.highBid.strain!) : -1;
  for (let level = cfg.minLevel; level <= cfg.maxLevel; level++) {
    for (const strain of cfg.strains) {
      if (bidRank(cfg, level, strain) > floor) {
        moves.push({ actionId: 'contractBid', level, strain });
      }
    }
  }
  // Passing is always allowed. A hand where everybody passes is thrown in, which is a real
  // outcome in the game rather than a deadlock to be prevented.
  moves.push({ actionId: 'passBid' });
  return moves;
}

function applyContractBid(s: MatchState, playerId: string, move: Move): MatchState {
  const cfg = s.definition.trick!.numericAuction!;
  const legal = contractBidMoves(s);
  const ok = legal.some((m) => m.actionId === move.actionId
    && m.level === move.level && m.strain === move.strain);
  if (!ok) return s;

  const n = s.players.length;
  const closeAfter = cfg.passesToClose ?? (n - 1);

  if (move.actionId === 'passBid') {
    s.auctionPasses += 1;
    log(s, playerId, `${short(playerId)} passes.`);
    // Everybody passed with nothing on the table: the hand is thrown in.
    if (!s.highBid && s.auctionPasses >= n) {
      log(s, null, 'Passed out — no contract. The hand is thrown in.');
      s.auctionRound = 0;
      s.phase = 'roundOver';
      for (const p of s.players) s.scores[p] = 0;
      s.winner = fairRandomPlayer(s);
      finalizeMatchProgress(s);
      return s;
    }
    if (s.highBid && s.auctionPasses >= closeAfter) return settleContract(s);
  } else if (cfg.chooseTrumpAfter) {
    s.highBid = { player: playerId, level: move.level! };
    s.auctionPasses = 0;
    log(s, playerId, `${short(playerId)} bids ${move.level}.`);
  } else {
    s.highBid = { player: playerId, level: move.level!, strain: move.strain as Strain };
    s.auctionPasses = 0;
    log(s, playerId, `${short(playerId)} bids ${move.level}${strainLabel(move.strain as Strain)}.`);
  }

  s.turnIndex = ((s.turnIndex + s.direction) % n + n) % n;
  return s;
}

function strainLabel(strain: Strain): string {
  return strain === 'NT' ? 'NT' : (SUIT_GLYPH[strain] ?? strain);
}

const SUIT_GLYPH: Record<string, string> = { C: '\u2663', D: '\u2666', H: '\u2665', S: '\u2660' };

/**
 * The auction is over. Ordinarily the high bid already names its strain and that becomes trump
 * immediately; with `chooseTrumpAfter`, the bid is still just a number, and the winner is now
 * asked — trick play does not begin until they answer (see `resolveChoice`'s
 * `purpose === 'contractTrump'` branch, which finishes what this function starts here).
 */
function settleContract(s: MatchState): MatchState {
  const bid = s.highBid!;
  s.auctionRound = 0;
  s.auctionPasses = 0;
  s.maker = bid.player;
  const cfg = s.definition.trick!.numericAuction!;
  if (cfg.chooseTrumpAfter) {
    log(s, null, `${short(bid.player)} won the bid at ${bid.level} — naming trump.`);
    s.pendingChoice = { type: 'suit', player: bid.player, setState: '__contractTrump', purpose: 'contractTrump' };
    return s;
  }
  // No-trump is exactly that: the suit stays null and the engine's ordinary high-card-of-the-
  // led-suit rule decides every trick.
  s.trumpSuit = bid.strain === 'NT' ? null : (bid.strain as Suit);
  const need = bid.level + cfg.book;
  log(s, null, `${short(bid.player)} plays ${bid.level}${strainLabel(bid.strain!)} — ${need} tricks to make it.`);
  // The lead is to the declarer's left, as it is in the real game.
  s.turnIndex = (s.players.indexOf(bid.player) + 1) % s.players.length;
  return s;
}

/**
 * Score a contract. The declaring side is paid for what it promised and for anything extra;
 * falling short pays the other side instead. Partnerships share a contract, as they share a
 * hand — which is why this reads teams rather than players.
 */
export function scoreContract(s: MatchState): void {
  const cfg = s.definition.trick!.numericAuction!;
  const bid = s.highBid;
  const teams = trickTeams(s);
  if (!bid) {
    for (const p of s.players) s.scores[p] = 0;
    s.winner = fairRandomPlayer(s);
    s.roundOutcome = null;
    return;
  }
  const declaring = teams.find((t) => t.includes(bid.player)) ?? [bid.player];
  const defending = teams.filter((t) => t !== declaring).flat();
  let declarerPts = 0;
  let defenderPts = 0;
  s.roundOutcome = null;

  /*
    Some games are not won by taking a number of TRICKS.

    Skat's declarer needs 61 of the 120 points in the pack, which might be four fat tricks or
    eight thin ones — the count of tricks says almost nothing about who won. Those points have
    already been accumulating into `scores` through the same per-card table Hearts uses; this
    settles the contract against them instead.
  */
  if (cfg.makeOnCardPoints) {
    const target = cfg.makeOnCardPoints;
    const got = declaring.reduce((a, p) => a + (s.scores[p] ?? 0), 0);
    if (got >= target) {
      declarerPts = bid.level;
      log(s, null, `${short(bid.player)} took ${got} of the card points — made ${bid.level}.`);
    } else {
      // Going down costs the declarer what the bid was worth, twice over, which is the whole
      // reason bidding high in Skat is a risk rather than free.
      declarerPts = -2 * bid.level;
      defenderPts = bid.level;
      log(s, null, `${short(bid.player)} took only ${got} of ${target} — down ${-declarerPts}.`);
    }
    for (const p of declaring) s.scores[p] = declarerPts;
    for (const p of defending) s.scores[p] = defenderPts;
    s.winner = declarerPts >= defenderPts ? declaring[0] : (defending[0] ?? declaring[0]);
    return;
  }

  const need = bid.level + cfg.book;
  const took = declaring.reduce((a, p) => a + (s.tricksWon[p] ?? 0), 0);
  if (took >= need) {
    declarerPts = bid.level * cfg.trickValue + (took - need) * cfg.overtrickValue;
    if (cfg.slamBonus && bid.level === cfg.maxLevel) { declarerPts += cfg.slamBonus; s.roundOutcome = 'slam'; }
    log(s, null, `${short(bid.player)} made ${bid.level}${strainLabel(bid.strain!)} with ${took} tricks — ${declarerPts}.`);
  } else if (cfg.defendersScoreOwnTricks) {
    defenderPts = defending.reduce((a, p) => a + (s.tricksWon[p] ?? 0), 0);
    log(s, null, `${short(bid.player)} fell short of ${need} — the defence takes the hand with ${defenderPts}.`);
  } else {
    defenderPts = (need - took) * cfg.undertrickValue;
    log(s, null, `${short(bid.player)} went down ${need - took} — defenders take ${defenderPts}.`);
  }
  for (const p of declaring) s.scores[p] = declarerPts;
  for (const p of defending) s.scores[p] = defenderPts;
  s.winner = declarerPts >= defenderPts ? declaring[0] : (defending[0] ?? declaring[0]);
}

export function trickTeams(s: MatchState): string[][] {
  // One against the rest. Whoever won the auction is a side of one and everybody else is the
  // other side — which is a partnership that only exists for the length of a hand.
  if (s.definition.trick?.soloDeclarer) {
    const declarer = s.highBid?.player ?? s.maker;
    if (declarer) return [[declarer], s.players.filter((p) => p !== declarer)];
  }
  if (s.definition.trick?.partnerships && s.players.length === 4) {
    return [[s.players[0], s.players[2]], [s.players[1], s.players[3]]];
  }
  return s.players.map((p) => [p]);
}

function endTrickRound(s: MatchState): void {
  const cfg = s.definition.trick!;
  s.phase = 'roundOver';

  // A contract was promised; score against it rather than against tricks alone.
  if (cfg.numericAuction) {
    scoreContract(s);
    finalizeMatchProgress(s);
    return;
  }

  // Euchre: only the making team can score by making it; setting them is worth more.
  if (cfg.euchreScoring) {
    const teams = trickTeams(s);
    const makerTeam = teams.find((t) => t.includes(s.maker ?? '')) ?? teams[0];
    const defenders = teams.find((t) => t !== makerTeam) ?? teams[1] ?? [];
    const made = makerTeam.reduce((a, p) => a + (s.tricksWon[p] ?? 0), 0);
    const total = Object.values(s.tricksWon).reduce((a, b) => a + b, 0);

    let makerPts = 0;
    let defPts = 0;
    if (total === 0) {
      log(s, null, 'Hand thrown in — no score.');            // nobody named trump
    } else if (made * 2 > total) {
      makerPts = made === total ? (s.alone ? 4 : 2) : 1;
      log(s, null, `${s.maker ? short(s.maker) : 'Makers'} made it — ${makerPts} point${makerPts === 1 ? '' : 's'}.`);
    } else {
      defPts = 2;
      log(s, null, `Euchred — defenders take 2.`);
    }
    for (const p of makerTeam) s.scores[p] = makerPts;
    for (const p of defenders) s.scores[p] = defPts;
    s.winner = makerPts >= defPts ? makerTeam[0] : defenders[0];
    finalizeMatchProgress(s);
    return;
  }

  // Spades-style bid scoring (with partnerships and nil).
  if (cfg.bidding) {
    const teams = trickTeams(s);
    let winner = s.players[0];
    let bestScore = -Infinity;
    for (const team of teams) {
      const teamBid = team.reduce((a, p) => a + (s.bids[p] ?? 0), 0);
      const teamTricks = team.reduce((a, p) => a + (s.tricksWon[p] ?? 0), 0);
      let score = teamTricks >= teamBid ? teamBid * 10 + (teamTricks - teamBid) : -teamBid * 10;
      // Nil bids score individually: +100 made, -100 failed.
      for (const p of team) if ((s.bids[p] ?? -1) === 0) score += (s.tricksWon[p] ?? 0) === 0 ? 100 : -100;
      for (const p of team) s.scores[p] = score;
      if (score > bestScore) { bestScore = score; winner = team[0]; }
    }
    s.winner = winner;
    log(s, null, `Round over — ${short(winner)}${cfg.partnerships ? "'s team" : ''} wins (${bestScore}).`);
    finalizeMatchProgress(s);
    return;
  }

  let winner = s.players[0];
  if (cfg.scoreBy === 'penalty') {
    // Shooting the moon: sweep every penalty point and the score inverts — you take nothing
    // and the rest of the table takes the whole pot.
    if (cfg.shootTheMoon) {
      const pot = s.players.reduce((a, p) => a + (s.scores[p] ?? 0), 0);
      const shooter = pot > 0 ? s.players.find((p) => (s.scores[p] ?? 0) === pot) : undefined;
      s.shotMoon = shooter ?? null;
      if (shooter) {
        for (const p of s.players) s.scores[p] = p === shooter ? 0 : pot;
        log(s, shooter, `${short(shooter)} SHOT THE MOON — everyone else takes ${pot}.`);
      }
    }
    let best = Infinity;
    for (const p of s.players) { const v = s.scores[p] ?? 0; if (v < best) { best = v; winner = p; } }
  } else {
    const most = cfg.scoreBy === 'mostTricks';
    let best = most ? -Infinity : Infinity;
    for (const p of s.players) {
      const v = s.tricksWon[p] ?? 0;
      s.scores[p] = v;
      if (most ? v > best : v < best) { best = v; winner = p; }
    }
  }
  s.winner = winner;
  log(s, null, `Round over — ${short(winner)} wins.`);
  finalizeMatchProgress(s);
}

// ---------- climbing family (President / Big Two) ----------

function climbRank(def: MatchState['definition'], rank: string): number {
  const i = def.climb!.order.indexOf(rank as never);
  return i < 0 ? -1 : i;
}

// Every group of `size` matching-rank cards currently in a player's hand.
function climbGroups(hand: Card[], size: number): { rank: string; cards: string[] }[] {
  const byRank: Record<string, Card[]> = {};
  for (const c of hand) (byRank[c.rank] ??= []).push(c);
  const out: { rank: string; cards: string[] }[] = [];
  for (const [rank, cs] of Object.entries(byRank)) {
    if (cs.length >= size) out.push({ rank, cards: cs.slice(0, size).map((c) => c.id) });
  }
  return out;
}

// Bomb moves are available to EVERY player, in or out of turn, whenever they hold enough of
// a rank — this is what lets actingPlayers() surface interrupts.
function climbBombMoves(state: MatchState, playerId: string): Move[] {
  const cfg = state.definition.climb;
  if (!cfg?.bombSize || state.finished.includes(playerId) || state.climbBombDeclined[playerId]) return [];
  const hand = state.zones[`hand:${playerId}`] || [];
  return climbGroups(hand, cfg.bombSize).map((g) => ({ actionId: 'climbBomb', cards: g.cards }));
}

function climbLegalMoves(state: MatchState, playerId: string): Move[] {
  if (state.finished.includes(playerId)) return [];
  const bombs = climbBombMoves(state, playerId);
  if (state.players[state.turnIndex] !== playerId) {
    // Out of turn: a bomb can interrupt, or the player can decline and let play continue.
    return bombs.length > 0 ? [...bombs, { actionId: 'climbNoBomb' }] : [];
  }

  const def = state.definition;
  const cfg = def.climb!;
  const hand = state.zones[`hand:${playerId}`] || [];
  const moves: Move[] = [...bombs];

  if (state.climbShape === 0) {
    // Leading a fresh pile: play any single, or (if combos are on) any pair/triple. No passing.
    for (const c of hand) moves.push({ actionId: 'climbPlay', cards: [c.id] });
    if (cfg.combos) {
      for (const size of [2, 3]) for (const g of climbGroups(hand, size)) moves.push({ actionId: 'climbPlay', cards: g.cards });
    }
    return moves;
  }

  // Must match the shape already on the pile, and beat its rank.
  for (const g of climbGroups(hand, state.climbShape)) {
    if (climbRank(def, g.rank) > climbRank(def, state.climbTopRank!)) moves.push({ actionId: 'climbPlay', cards: g.cards });
  }
  moves.push({ actionId: 'climbPass' });
  return moves;
}

function activeCount(s: MatchState): number {
  return s.players.filter((p) => !s.finished.includes(p)).length;
}

function nextActiveIndex(s: MatchState): number {
  const n = s.players.length;
  let i = s.turnIndex;
  for (let step = 0; step < n; step++) {
    i = ((i + s.direction) % n + n) % n;
    if (!s.finished.includes(s.players[i])) return i;
  }
  return s.turnIndex;
}

function applyClimbMove(s: MatchState, playerId: string, move: Move): MatchState {
  const legal = climbLegalMoves(s, playerId);
  const chosen = legal.find((m) => m.actionId === move.actionId && sameCards(m.cards, move.cards));
  if (!chosen) return s;
  if (move.actionId === 'climbNoBomb') { s.climbBombDeclined[playerId] = true; return s; }
  const def = s.definition;
  const discardZone = def.zones.find((z) => z.visibility === 'top-public')!;

  if (move.actionId === 'climbPass') {
    s.passStreak += 1;
    log(s, playerId, `${short(playerId)} passes.`);
    // Everyone still in except the last player has passed → the pile clears.
    if (s.passStreak >= activeCount(s) - 1 && s.lastPlayer) {
      s.zones[discardZone.id] = [];
      s.passStreak = 0;
      s.climbShape = 0;
      s.climbTopRank = null;
      s.climbBombDeclined = {};
      log(s, null, `Pile cleared — ${short(s.lastPlayer)} leads.`);
      const li = s.players.indexOf(s.lastPlayer);
      s.turnIndex = s.finished.includes(s.lastPlayer) ? nextFromIndex(s, li) : li;
      return s;
    }
    s.turnIndex = nextActiveIndex(s);
    return s;
  }

  // climbPlay or climbBomb: play a group of matching-rank cards.
  const hand = s.zones[`hand:${playerId}`];
  const ids = new Set(move.cards);
  const group = hand.filter((c) => ids.has(c.id));
  s.zones[`hand:${playerId}`] = hand.filter((c) => !ids.has(c.id));
  s.zones[discardZone.id].push(...group);
  s.lastPlayer = playerId;
  s.passStreak = 0;
  s.climbShape = group.length;
  s.climbTopRank = group[0]?.rank ?? null;
  s.climbBombDeclined = {};

  if (move.actionId === 'climbBomb') {
    log(s, playerId, `${short(playerId)} BOMBS with ${group.length}×${group[0]?.rank}!`);
    // A bomb steals the lead outright — it doesn't need to be this player's turn.
    s.turnIndex = s.players.indexOf(playerId);
  } else {
    log(s, playerId, `${short(playerId)} played ${group.map(cardLabel).join(' ')}.`);
  }

  const newHand = s.zones[`hand:${playerId}`];
  if (newHand.length === 0 && !s.finished.includes(playerId)) {
    s.finished.push(playerId);
    log(s, null, `${short(playerId)} is out (#${s.finished.length}).`);
  }
  if (activeCount(s) <= 1) { endClimbRound(s); return s; }
  s.turnIndex = nextActiveIndex(s);
  return s;
}

function nextFromIndex(s: MatchState, from: number): number {
  const n = s.players.length;
  let i = from;
  for (let step = 0; step < n; step++) {
    i = ((i + s.direction) % n + n) % n;
    if (!s.finished.includes(s.players[i])) return i;
  }
  return from;
}

function endClimbRound(s: MatchState): void {
  s.phase = 'roundOver';
  // Whoever still holds cards finishes last.
  for (const p of s.players) if (!s.finished.includes(p)) s.finished.push(p);
  s.players.forEach((p, i) => { s.scores[p] = s.finished.indexOf(p) + 1; void i; }); // 1 = President
  s.winner = s.finished[0] ?? s.players[0];
  log(s, null, `Round over — ${short(s.winner)} is President.`);
  finalizeMatchProgress(s);
}

// ---------- fishing family (Go Fish) ----------

function oceanZoneId(def: MatchState['definition']): string {
  return def.zones.find((z) => z.shared && z.type === 'pile' && z.visibility === 'none')!.id;
}

// Legal fishing moves for a player, ignoring whose turn it is.
function fishMovesFor(state: MatchState, playerId: string): Move[] {
  const hand = state.zones[`hand:${playerId}`] || [];
  const ocean = state.zones[oceanZoneId(state.definition)] || [];
  if (hand.length === 0) return ocean.length > 0 ? [{ actionId: 'fishDraw' }] : [];
  const ranks = Array.from(new Set(hand.map((c) => c.rank)));
  const targets = state.players.filter((p) => p !== playerId && (state.zones[`hand:${p}`] || []).length > 0);
  const moves: Move[] = [];
  for (const rank of ranks) for (const t of targets) moves.push({ actionId: 'ask', target: t, rank });
  if (moves.length === 0 && ocean.length > 0) moves.push({ actionId: 'fishDraw' });
  return moves;
}

function fishLegalMoves(state: MatchState, playerId: string): Move[] {
  if (state.players[state.turnIndex] !== playerId) return [];
  return fishMovesFor(state, playerId);
}

function checkBooks(state: MatchState, playerId: string): void {
  const size = state.definition.fish!.bookSize;
  const hand = state.zones[`hand:${playerId}`];
  let changed = true;
  while (changed) {
    changed = false;
    const counts: Record<string, number> = {};
    for (const c of hand) counts[c.rank] = (counts[c.rank] ?? 0) + 1;
    for (const [rank, n] of Object.entries(counts)) {
      if (n >= size) {
        for (let i = hand.length - 1; i >= 0; i--) if (hand[i].rank === rank) hand.splice(i, 1);
        state.booksWon[playerId] = (state.booksWon[playerId] ?? 0) + 1;
        log(state, null, `${short(playerId)} completes a book of ${rank}s.`);
        changed = true;
        break;
      }
    }
  }
}

function totalBooks(state: MatchState): number {
  return Object.values(state.booksWon).reduce((a, b) => a + b, 0);
}

function nextFishTurn(s: MatchState): void {
  const n = s.players.length;
  let i = s.turnIndex;
  for (let step = 0; step < n; step++) {
    i = ((i + s.direction) % n + n) % n;
    if (fishMovesFor(s, s.players[i]).length > 0) { s.turnIndex = i; return; }
  }
  endFishRound(s); // nobody can act
}

function applyFishMove(s: MatchState, playerId: string, move: Move): MatchState {
  const legal = fishLegalMoves(s, playerId);
  const ok = legal.find((m) => m.actionId === move.actionId && m.target === move.target && m.rank === move.rank);
  if (!ok) return s;
  const def = s.definition;
  const oceanId = oceanZoneId(def);
  const hand = s.zones[`hand:${playerId}`];

  if (move.actionId === 'fishDraw') {
    const card = s.zones[oceanId].pop();
    if (card) { hand.push(card); log(s, playerId, `${short(playerId)} draws from the ocean.`); checkBooks(s, playerId); s.stallCount = 0; }
    if (fishMovesFor(s, playerId).length === 0) nextFishTurn(s);
    finishFishTurnChecks(s);
    return s;
  }

  // ask
  const target = move.target!;
  const rank = move.rank!;
  const theirHand = s.zones[`hand:${target}`];
  const got = theirHand.filter((c) => c.rank === rank);
  if (got.length > 0) {
    s.zones[`hand:${target}`] = theirHand.filter((c) => c.rank !== rank);
    hand.push(...got);
    log(s, playerId, `${short(playerId)} asks ${short(target)} for ${rank}s — gets ${got.length}.`);
    checkBooks(s, playerId);
    s.stallCount = 0;
    if (fishMovesFor(s, playerId).length === 0) nextFishTurn(s); // else same player goes again
  } else {
    log(s, playerId, `${short(playerId)} asks ${short(target)} for ${rank}s — Go Fish!`);
    const card = s.zones[oceanId].pop();
    if (card) {
      hand.push(card);
      checkBooks(s, playerId);
      s.stallCount = 0;
      if (card.rank === rank) log(s, playerId, `${short(playerId)} fished the ${rank} — goes again.`);
      else nextFishTurn(s);
    } else {
      s.stallCount += 1; // pure pass: no cards changed hands and the ocean is empty
      nextFishTurn(s);
    }
  }
  finishFishTurnChecks(s);
  return s;
}

function finishFishTurnChecks(s: MatchState): void {
  if (s.phase === 'roundOver') return;
  const bookGoal = 13 - (s.definition.deck.excludeRanks?.length ?? 0);
  if (totalBooks(s) >= bookGoal) { endFishRound(s); return; }
  // No progress for a full lap (ocean empty, ranks split so no ask can succeed) → end.
  if (s.stallCount >= s.players.length) { endFishRound(s); return; }
  if (fishMovesFor(s, s.players[s.turnIndex]).length === 0) nextFishTurn(s);
}

function endFishRound(s: MatchState): void {
  if (s.phase === 'roundOver') return;
  s.phase = 'roundOver';
  let best = s.players[0];
  let bestN = -Infinity;
  for (const p of s.players) {
    s.scores[p] = s.booksWon[p] ?? 0;
    if (s.scores[p] > bestN) { bestN = s.scores[p]; best = p; }
  }
  s.winner = best;
  log(s, null, `Round over — ${short(best)} wins with ${bestN} books.`);
  finalizeMatchProgress(s);
}

// ---------- solitaire / patience family ----------
//
// Zone ids are synthesised from the config: tab0..tabN, found0..foundN, free0..freeN, plus
// `stock` and `waste`. A definition never lists them, so a nine-column variant is a number
// change rather than a rewrite.

export const solZones = {
  tab: (i: number) => `tab${i}`,
  found: (i: number) => `found${i}`,
  free: (i: number) => `free${i}`,
  stock: 'stock',
  waste: 'waste',
  reserve: 'reserve',
};

function solRankIndex(s: MatchState, rank: string): number {
  return s.definition.deck.rankOrder.indexOf(rank as never);
}

function isRed(c: Card): boolean { return c.suit === 'H' || c.suit === 'D'; }

// May `card` be stacked directly onto `onto` in a tableau column?
function solCanStack(s: MatchState, card: Card, onto: Card): boolean {
  const cfg = s.definition.solitaire!;
  const len = s.definition.deck.rankOrder.length;
  // A game whose foundations wrap has a tableau that wraps too — a king goes on an ace, because
  // in Canfield the sequence is a circle rather than a line.
  // Golf accepts a card one rank either side, which no descending rule can express.
  if (cfg.build === 'up-or-down') {
    const gap = Math.abs(solRankIndex(s, card.rank) - solRankIndex(s, onto.rank));
    // With a wrapping order the two ends of the pack are neighbours too, so the distance the
    // long way round counts as one as well: a king takes an ace and an ace takes a king.
    return gap === 1 || (!!cfg.wrap && gap === len - 1);
  }
  const below = cfg.foundationStart === 'dealt'
    ? (solRankIndex(s, onto.rank) - 1 + len) % len
    : solRankIndex(s, onto.rank) - 1;
  if (solRankIndex(s, card.rank) !== below) return false;
  switch (cfg.build) {
    case 'alt-color': return isRed(card) !== isRed(onto);
    case 'same-suit': return card.suit === onto.suit;
    case 'any-suit': return card.suit !== onto.suit;
    default: return true;                       // 'down-any' — rank alone (Spider)
  }
}

// Is the run starting at `from` in this column liftable as one unit?
function solRunOk(s: MatchState, col: Card[], from: number): boolean {
  const cfg = s.definition.solitaire!;
  if (from >= col.length - 1) return true;      // a single card is always a run of one
  if (cfg.moveRun === 'single') return false;
  // Yukon: whatever is on top comes along, ordered or not. Everything must be face up, or you
  // would be moving cards you cannot see.
  if (cfg.moveRun === 'any') return col.slice(from).every((c) => s.faceUp[c.id]);
  for (let i = from; i < col.length - 1; i++) {
    const a = col[i], b = col[i + 1];
    if (solRankIndex(s, b.rank) !== solRankIndex(s, a.rank) - 1) return false;
    if (cfg.moveRun === 'same-suit' && a.suit !== b.suit) return false;
    if (cfg.moveRun === 'built' && !solCanStack(s, b, a)) return false;
  }
  return true;
}

// How many cards can be shifted at once: one, plus a free cell each, doubled per empty column.
function solMoveCapacity(s: MatchState, toEmptyColumn: boolean): number {
  const cfg = s.definition.solitaire!;
  if (cfg.freeCells === 0) return Infinity;     // no cells means no supermove limit to enforce
  let free = 0;
  for (let i = 0; i < cfg.freeCells; i++) if ((s.zones[solZones.free(i)] || []).length === 0) free++;
  let emptyCols = 0;
  for (let i = 0; i < cfg.columns; i++) if ((s.zones[solZones.tab(i)] || []).length === 0) emptyCols++;
  if (toEmptyColumn && emptyCols > 0) emptyCols--;
  return (free + 1) * Math.pow(2, emptyCols);
}

function solCanDropOnColumn(s: MatchState, card: Card, colId: string): boolean {
  const cfg = s.definition.solitaire!;
  const col = s.zones[colId] || [];
  if (col.length === 0) {
    if (cfg.empty === 'none') return false;
    if (cfg.empty === 'king') return solRankIndex(s, card.rank) === s.definition.deck.rankOrder.length - 1;
    return true;
  }
  const top = col[col.length - 1];
  if (!s.faceUp[top.id]) return false;
  return solCanStack(s, card, top);
}

function solCanDropOnFoundation(s: MatchState, card: Card, fId: string): boolean {
  if (s.definition.solitaire!.foundationMode !== 'place') return false;
  const f = s.zones[fId] || [];
  const order = s.definition.deck.rankOrder;
  // With a dealt base the sequence wraps: …K, A, 2… so "one higher" is modular, and an empty
  // foundation wants the base rank rather than an ace.
  const wraps = s.definition.solitaire!.foundationStart === 'dealt';
  if (f.length === 0) {
    const want = wraps && s.foundationBase ? order.indexOf(s.foundationBase as never) : 0;
    return solRankIndex(s, card.rank) === want;
  }
  const top = f[f.length - 1];
  if (card.suit !== top.suit) return false;
  const next = wraps
    ? (solRankIndex(s, top.rank) + 1) % order.length
    : solRankIndex(s, top.rank) + 1;
  return solRankIndex(s, card.rank) === next;
}

// Spider: a complete king-to-ace run of one suit sitting on a column leaves the board.
function solHarvestRuns(s: MatchState): void {
  const cfg = s.definition.solitaire!;
  if (cfg.foundationMode !== 'auto-run') return;
  const len = s.definition.deck.rankOrder.length;
  for (let i = 0; i < cfg.columns; i++) {
    const col = s.zones[solZones.tab(i)];
    if (!col || col.length < len) continue;
    const run = col.slice(col.length - len);
    const ok = run.every((c, k) => s.faceUp[c.id] && c.suit === run[0].suit
      && solRankIndex(s, c.rank) === len - 1 - k);
    if (!ok) continue;
    s.zones[solZones.tab(i)] = col.slice(0, col.length - len);
    const slot = Array.from({ length: cfg.foundations }, (_, k) => solZones.found(k))
      .find((id) => (s.zones[id] || []).length === 0);
    if (slot) s.zones[slot] = run;
    const newTop = s.zones[solZones.tab(i)].slice(-1)[0];
    if (newTop) s.faceUp[newTop.id] = true;
    log(s, null, `A complete ${run[0].suit === 'H' ? '♥' : run[0].suit === 'D' ? '♦' : run[0].suit === 'C' ? '♣' : '♠'} run is cleared.`);
  }
}

function solTopFaceUpRun(s: MatchState, colId: string): number {
  const col = s.zones[colId] || [];
  for (let i = 0; i < col.length; i++) {
    if (!s.faceUp[col[i].id]) continue;
    if (solRunOk(s, col, i)) return i;
  }
  return col.length;
}

function solitaireLegalMoves(state: MatchState): Move[] {
  const cfg = state.definition.solitaire!;
  const moves: Move[] = [];
  const cols = Array.from({ length: cfg.columns }, (_, i) => solZones.tab(i));
  const founds = Array.from({ length: cfg.foundations }, (_, i) => solZones.found(i));
  const cells = Array.from({ length: cfg.freeCells }, (_, i) => solZones.free(i));

  // Every movable card, with where it came from.
  const sources: { id: string; card: Card; run: Card[]; from: string }[] = [];
  for (const colId of cols) {
    const col = state.zones[colId] || [];
    const start = solTopFaceUpRun(state, colId);
    for (let i = start; i < col.length; i++) {
      if (!state.faceUp[col[i].id] || !solRunOk(state, col, i)) continue;
      sources.push({ id: col[i].id, card: col[i], run: col.slice(i), from: colId });
    }
  }
  for (const cellId of cells) {
    const c = (state.zones[cellId] || [])[0];
    if (c) sources.push({ id: c.id, card: c, run: [c], from: cellId });
  }
  if (cfg.stock === 'waste') {
    const w = state.zones[solZones.waste] || [];
    const top = w[w.length - 1];
    if (top) sources.push({ id: top.id, card: top, run: [top], from: solZones.waste });
  }
  // The reserve offers exactly one card — its top — which is what makes it a reserve rather
  // than a thirteenth column. Everything under it waits.
  if (cfg.reserve) {
    const r = state.zones[solZones.reserve] || [];
    const top = r[r.length - 1];
    if (top) sources.push({ id: top.id, card: top, run: [top], from: solZones.reserve });
  }

  for (const src of sources) {
    /*
      In a game played onto the waste, the waste is the ONLY destination.

      The tableau there is a board to be cleared, not a board to be built on — Golf has no
      column-to-column move at all. Offering one let a card be shuffled sideways for as long as
      the ranks happened to line up, which is both the wrong game and an endless one: cards that
      never leave the tableau can be passed back and forth forever.
    */
    for (const colId of cfg.wasteIsTarget ? [] : cols) {
      if (colId === src.from) continue;
      const empty = (state.zones[colId] || []).length === 0;
      if (src.run.length > solMoveCapacity(state, empty)) continue;
      // Shuffling a whole column into an empty one achieves nothing.
      if (empty && src.from.startsWith('tab') && (state.zones[src.from] || []).length === src.run.length) continue;
      if (solCanDropOnColumn(state, src.card, colId)) {
        moves.push({ actionId: 'solMove', cardId: src.id, from: src.from, to: colId });
      }
    }
    // Golf: a single card may go onto the waste when it fits the card showing there.
    if (cfg.wasteIsTarget && src.run.length === 1 && src.from !== solZones.waste) {
      const w = state.zones[solZones.waste] || [];
      const top = w[w.length - 1];
      if (top && solCanStack(state, src.card, top)) {
        moves.push({ actionId: 'solMove', cardId: src.id, from: src.from, to: solZones.waste });
      }
    }
    if (src.run.length === 1) {
      for (const fId of founds) {
        if (solCanDropOnFoundation(state, src.card, fId)) {
          moves.push({ actionId: 'solMove', cardId: src.id, from: src.from, to: fId });
          break;                                  // one empty foundation is the same as any other
        }
      }
      for (const cellId of cells) {
        if (src.from === cellId || (state.zones[cellId] || []).length > 0) continue;
        moves.push({ actionId: 'solMove', cardId: src.id, from: src.from, to: cellId });
        break;
      }
    }
  }

  if (cfg.stock === 'waste') {
    if ((state.zones[solZones.stock] || []).length > 0) moves.push({ actionId: 'solDraw' });
    else if ((state.zones[solZones.waste] || []).length > 0
      && (state.redealsLeft > 0 || state.redealsLeft < 0)) moves.push({ actionId: 'solRedeal' });
  }
  if (cfg.stock === 'deal-row' && (state.zones[solZones.stock] || []).length > 0) {
    // Spider refuses to deal onto an empty column.
    if (cols.every((c) => (state.zones[c] || []).length > 0)) moves.push({ actionId: 'solDeal' });
  }
  return moves;
}

function applySolitaireMove(s: MatchState, move: Move): MatchState {
  const cfg = s.definition.solitaire!;
  const legal = solitaireLegalMoves(s);
  const ok = legal.find((m) => m.actionId === move.actionId && m.cardId === move.cardId
    && m.from === move.from && m.to === move.to);
  if (!ok) return s;

  if (move.actionId === 'solDraw') {
    const stock = s.zones[solZones.stock];
    for (let i = 0; i < Math.max(1, cfg.stockTurn) && stock.length; i++) {
      const c = stock.pop()!;
      s.faceUp[c.id] = true;
      s.zones[solZones.waste].push(c);
    }
    s.moveCount++;
    return s;
  }

  if (move.actionId === 'solRedeal') {
    const waste = s.zones[solZones.waste];
    s.zones[solZones.stock] = waste.slice().reverse();
    for (const c of s.zones[solZones.stock]) s.faceUp[c.id] = false;
    s.zones[solZones.waste] = [];
    if (s.redealsLeft > 0) s.redealsLeft--;
    s.moveCount++;
    log(s, null, 'Stock turned over.');
    return s;
  }

  if (move.actionId === 'solDeal') {
    for (let i = 0; i < cfg.columns; i++) {
      const c = s.zones[solZones.stock].pop();
      if (!c) break;
      s.faceUp[c.id] = true;
      s.zones[solZones.tab(i)].push(c);
    }
    s.moveCount++;
    solHarvestRuns(s);
    checkSolitaireEnd(s);
    return s;
  }

  // solMove
  const from = s.zones[move.from!];
  const idx = from.findIndex((c) => c.id === move.cardId);
  if (idx < 0) return s;
  const run = from.splice(idx);
  s.zones[move.to!].push(...run);
  for (const c of run) s.faceUp[c.id] = true;

  // Turning over whatever the lifted run was covering is automatic.
  if (move.from!.startsWith('tab')) {
    const newTop = from[from.length - 1];
    if (newTop && !s.faceUp[newTop.id]) s.faceUp[newTop.id] = true;
  }
  s.moveCount++;
  solHarvestRuns(s);
  checkSolitaireEnd(s);
  return s;
}

// The board as the player sees it: columns with their face-down depth, foundations, cells,
// the stock count, and every legal move so the UI can highlight without re-deriving the rules.
function solitaireView(s: MatchState): Partial<RedactedState> {
  const cfg = s.definition.solitaire!;
  const hidden = (c: Card) => ({ ...c, rank: '?' as Card['rank'], suit: '?' as Card['suit'] });
  return {
    tableau: Array.from({ length: cfg.columns }, (_, i) => {
      const col = s.zones[solZones.tab(i)] || [];
      const faceDown = col.filter((c) => !s.faceUp[c.id]).length;
      return { id: solZones.tab(i), cards: col.map((c) => (s.faceUp[c.id] ? c : hidden(c))), faceDown };
    }),
    foundations: Array.from({ length: cfg.foundations }, (_, i) => ({
      id: solZones.found(i), cards: (s.zones[solZones.found(i)] || []).slice(),
    })),
    freeCells: Array.from({ length: cfg.freeCells }, (_, i) => ({
      id: solZones.free(i), card: (s.zones[solZones.free(i)] || [])[0] ?? null,
    })),
    // Only meaningful where free cells make a supermove limit exist at all — Klondike and
    // Spider have none, so solMoveCapacity is always Infinity for them and not worth exposing.
    moveCapacity: cfg.freeCells > 0 ? solMoveCapacity(s, false) : undefined,
    stockCount: (s.zones[solZones.stock] || []).length,
    wasteCards: (s.zones[solZones.waste] || []).slice(-3),
    reserve: cfg.reserve ? (s.zones[solZones.reserve] || []).slice() : undefined,
    foundationBase: cfg.foundationStart === 'dealt' ? s.foundationBase : undefined,
    redealsLeft: s.redealsLeft,
    moveCount: s.moveCount,
    solMoves: s.phase === 'playing' ? solitaireLegalMoves(s) : [],
  };
}

function checkSolitaireEnd(s: MatchState): void {
  const cfg = s.definition.solitaire!;
  const len = s.definition.deck.rankOrder.length;
  /*
    A game that plays onto the waste is won by emptying the board, not by filling foundations.
    Golf has nowhere to build up to — the cards go onto one pile and the question is only
    whether you clear the columns before the stock runs out — so counting foundation cards
    would mean it could never be won at all.
  */
  if (cfg.wasteIsTarget) {
    const cleared = Array.from({ length: cfg.columns }, (_, i) => s.zones[solZones.tab(i)] || [])
      .every((col) => col.length === 0);
    if (cleared) {
      s.phase = 'roundOver';
      s.winner = s.players[0];
      s.scores[s.players[0]] = s.moveCount;
      log(s, null, `Cleared the board in ${s.moveCount} moves.`);
    }
    return;
  }
  const need = cfg.foundations * len;
  let placed = 0;
  for (let i = 0; i < cfg.foundations; i++) placed += (s.zones[solZones.found(i)] || []).length;
  if (placed >= need) {
    s.phase = 'roundOver';
    s.winner = s.players[0];
    s.scores[s.players[0]] = s.moveCount;
    log(s, null, `Solved in ${s.moveCount} moves.`);
    return;
  }
  if (solitaireLegalMoves(s).length === 0) {
    s.phase = 'roundOver';
    s.winner = null;
    s.scores[s.players[0]] = s.moveCount;
    log(s, null, 'No moves left — the game is blocked.');
  }
}

// ---------- rummy / melding family ----------

function rummyZones(def: MatchState['definition']) {
  return {
    stock: def.zones.find((z) => z.shared && z.type === 'pile' && z.visibility === 'none')!.id,
    discard: def.zones.find((z) => z.visibility === 'top-public')!.id,
    melds: def.zones.find((z) => z.shared && z.visibility === 'all')?.id,
  };
}

// Every set (same rank) and run (consecutive same suit) currently layable from a hand.
/**
 * How many wild cards one meld may absorb, and whether wilds are in play at all.
 *
 * A meld made entirely of wilds is not a meld, so the search always requires at least one
 * natural card. Two is the ceiling: past that the arrangement search grows faster than the
 * game gets more interesting.
 */
function wildRule(state: MatchState): { on: boolean; max: number } {
  const cfg = state.definition.rummy!;
  if (!cfg.wilds) return { on: false, max: 0 };
  return { on: true, max: Math.max(1, Math.min(2, Math.round(cfg.maxWildsPerMeld ?? 1))) };
}

function isWildCard(state: MatchState, card: Card): boolean {
  return cardTags(state.definition, card).includes('wild');
}

function findMelds(state: MatchState, hand: Card[]): { cards: string[]; label: string }[] {
  const cfg = state.definition.rummy!;
  const order = state.definition.deck.rankOrder;
  const out: { cards: string[]; label: string }[] = [];
  const wild = wildRule(state);
  // Wilds are never counted as naturals: three jokers are three fillers, not a set of jokers.
  const wilds = wild.on ? hand.filter((c) => isWildCard(state, c)) : [];
  const natural = wild.on ? hand.filter((c) => !isWildCard(state, c)) : hand;
  const wildLabel = (n: number) => (n > 0 ? `+${n}★` : '');

  // sets: 3+ of a rank, with wilds standing in for what's missing
  const byRank: Record<string, Card[]> = {};
  for (const c of natural) (byRank[c.rank] ??= []).push(c);
  for (const [rank, cs] of Object.entries(byRank)) {
    if (cs.length >= cfg.setMin) { out.push({ cards: cs.map((c) => c.id), label: `${cs.length}×${rank}` }); continue; }
    const need = cfg.setMin - cs.length;
    if (wild.on && cs.length >= 1 && need <= Math.min(wild.max, wilds.length)) {
      const fill = wilds.slice(0, need);
      out.push({ cards: [...cs, ...fill].map((c) => c.id), label: `${cfg.setMin}×${rank}${wildLabel(need)}` });
    }
  }

  // runs: consecutive same-suit sequences, wilds filling single gaps — Canasta and Hand & Foot
  // turn this off, since their melds are rank-groups only.
  if (cfg.allowRuns !== false) {
    for (const suit of ['C', 'D', 'H', 'S']) {
      const cs = natural.filter((c) => c.suit === suit).sort((a, b) => order.indexOf(a.rank as never) - order.indexOf(b.rank as never));
      let i = 0;
      while (i < cs.length) {
        let j = i + 1;
        while (j < cs.length && order.indexOf(cs[j].rank as never) === order.indexOf(cs[j - 1].rank as never) + 1) j++;
        const run = cs.slice(i, j);
        if (run.length >= cfg.runMin) out.push({ cards: run.map((c) => c.id), label: `${run[0].rank}–${run[run.length - 1].rank}${suitSym(suit)}` });
        i = j > i + 1 ? j : i + 1;
      }
      if (wild.on && wilds.length > 0 && cs.length > 0) {
        for (const m of wildRuns(state, cs, wilds, suit)) out.push(m);
      }
    }
  }
  // Two different spans can want the same cards — 5,6,[gap] and [gap],5,6 are one meld to a
  // player, and offering it twice would put the same button on the table twice.
  const seen = new Set<string>();
  return out.filter((m) => {
    const key = m.cards.slice().sort().join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Runs in one suit that need wilds to be whole. Spans are tried longest-first. */
function wildRuns(state: MatchState, suited: Card[], wilds: Card[], suit: string):
  { cards: string[]; label: string }[] {
  const cfg = state.definition.rummy!;
  const order = state.definition.deck.rankOrder;
  const { max } = wildRule(state);
  const budget = Math.min(max, wilds.length);
  const at = new Map<number, Card>();
  for (const c of suited) at.set(order.indexOf(c.rank as never), c);
  const out: { cards: string[]; label: string }[] = [];

  for (let a = 0; a < order.length; a++) {
    for (let b = order.length - 1; b - a + 1 >= cfg.runMin; b--) {
      let have = 0;
      let gaps = 0;
      for (let k = a; k <= b; k++) (at.has(k) ? have++ : gaps++);
      if (gaps === 0 || gaps > budget || have === 0) continue;
      const cards = [...Array.from({ length: b - a + 1 }, (_, k) => at.get(a + k)).filter((c): c is Card => !!c),
        ...wilds.slice(0, gaps)];
      out.push({ cards: cards.map((c) => c.id), label: `${order[a]}–${order[b]}${suitSym(suit)}+${gaps}★` });
    }
  }
  return out;
}

// Standard deadwood values: ace 1, face cards 10, everything else its pip count.
function deadwoodValue(card: Card): number {
  if (card.rank === 'A') return 1;
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10;
  const n = parseInt(card.rank, 10);
  return Number.isFinite(n) ? n : 0;
}

// Every meld that can be formed from a hand, as a bitmask over hand positions.
function meldMasks(state: MatchState, hand: Card[]): number[] {
  const cfg = state.definition.rummy!;
  const order = state.definition.deck.rankOrder;
  const masks: number[] = [];
  const wild = wildRule(state);
  const isW = (i: number) => wild.on && isWildCard(state, hand[i]);

  /**
   * Every way to pick up to `max` wilds out of the hand, as masks. The arrangement search needs
   * these enumerated rather than "the first N wilds": two melds each wanting a filler must be
   * able to take a different one, or the search would wrongly rule the pair out as overlapping.
   */
  const wildIdx = hand.map((_, i) => i).filter(isW);
  const wildSubsets: { mask: number; size: number }[] = [{ mask: 0, size: 0 }];
  for (let sub = 1; sub < 1 << wildIdx.length; sub++) {
    let m = 0;
    let cnt = 0;
    for (let b = 0; b < wildIdx.length; b++) if (sub & (1 << b)) { m |= 1 << wildIdx[b]; cnt++; }
    if (cnt <= wild.max) wildSubsets.push({ mask: m, size: cnt });
  }
  const fillers = (need: number) => wildSubsets.filter((w) => w.size === need);

  const byRank = new Map<string, number[]>();
  hand.forEach((c, i) => {
    if (isW(i)) return;   // a wild is a filler, never a natural member of its own rank
    const list = byRank.get(c.rank) ?? [];
    list.push(i);
    byRank.set(c.rank, list);
  });
  for (const idxs of byRank.values()) {
    for (let sub = 1; sub < 1 << idxs.length; sub++) {
      let count = 0;
      let mask = 0;
      for (let b = 0; b < idxs.length; b++) if (sub & (1 << b)) { mask |= 1 << idxs[b]; count++; }
      if (count >= cfg.setMin) { masks.push(mask); continue; }
      if (!wild.on) continue;
      for (const w of fillers(cfg.setMin - count)) masks.push(mask | w.mask);
    }
  }

  if (cfg.allowRuns !== false) {
    for (const suit of ['C', 'D', 'H', 'S']) {
      const cs = hand.map((c, i) => ({ c, i })).filter((x) => x.c.suit === suit && !isW(x.i))
        .sort((a, b) => order.indexOf(a.c.rank as never) - order.indexOf(b.c.rank as never));
      for (let i = 0; i < cs.length; i++) {
        let mask = 1 << cs[i].i;
        for (let j = i + 1; j < cs.length; j++) {
          if (order.indexOf(cs[j].c.rank as never) !== order.indexOf(cs[j - 1].c.rank as never) + 1) break;
          mask |= 1 << cs[j].i;
          if (j - i + 1 >= cfg.runMin) masks.push(mask);
        }
      }
      if (!wild.on || wildIdx.length === 0 || cs.length === 0) continue;
      // Gapped runs: every span of the rank order this suit partly covers, with wilds for the rest.
      const at = new Map<number, number>();
      for (const x of cs) at.set(order.indexOf(x.c.rank as never), x.i);
      for (let a = 0; a < order.length; a++) {
        for (let b = a + cfg.runMin - 1; b < order.length; b++) {
          let mask = 0;
          let gaps = 0;
          for (let k = a; k <= b; k++) {
            const idx = at.get(k);
            if (idx === undefined) gaps++; else mask |= 1 << idx;
          }
          if (gaps === 0 || gaps > wild.max || mask === 0) continue;
          for (const w of fillers(gaps)) masks.push(mask | w.mask);
        }
      }
    }
  }
  return masks;
}

// The arrangement of a hand that leaves the fewest points unmatched. Gin scoring lives or dies
// on this being optimal rather than greedy — a card can belong to a set OR a run, not both.
function bestArrangement(state: MatchState, hand: Card[]): { deadwood: number; melds: Card[][]; spare: Card[] } {
  const n = hand.length;
  const masks = meldMasks(state, hand);
  const memo = new Map<number, { deadwood: number; melds: number[] }>();

  const solve = (used: number): { deadwood: number; melds: number[] } => {
    const hit = memo.get(used);
    if (hit) return hit;
    let first = -1;
    for (let i = 0; i < n; i++) if (!(used & (1 << i))) { first = i; break; }
    if (first < 0) return { deadwood: 0, melds: [] };

    // Leave this card unmatched.
    const skip = solve(used | (1 << first));
    let best = { deadwood: skip.deadwood + deadwoodValue(hand[first]), melds: skip.melds };

    // Or spend it in a meld.
    for (const m of masks) {
      if (!(m & (1 << first)) || (m & used)) continue;
      const rest = solve(used | m);
      if (rest.deadwood < best.deadwood) best = { deadwood: rest.deadwood, melds: [m, ...rest.melds] };
    }
    memo.set(used, best);
    return best;
  };

  const r = solve(0);
  const usedMask = r.melds.reduce((a, m) => a | m, 0);
  return {
    deadwood: r.deadwood,
    melds: r.melds.map((m) => hand.filter((_, i) => m & (1 << i))),
    spare: hand.filter((_, i) => !(usedMask & (1 << i))),
  };
}

// What a hand's unmatched cards are worth under its best arrangement. Exported because a gin
// bot's whole job is minimizing it.
export function handDeadwood(state: MatchState, hand: Card[]): number {
  return bestArrangement(state, hand).deadwood;
}

// A card extends a meld if adding it still leaves a legal set or run.
function extendsMeld(state: MatchState, meld: Card[], card: Card): boolean {
  const cfg = state.definition.rummy!;
  const order = state.definition.deck.rankOrder;
  if (meld.length === 0) return false;
  const wild = wildRule(state);
  // Wilds already sitting in the meld are placeholders — they say nothing about its shape, and
  // a fresh wild can extend anything that still has room for one.
  const core = wild.on ? meld.filter((c) => !isWildCard(state, c)) : meld;
  if (core.length === 0) return false;
  if (wild.on && isWildCard(state, card)) return meld.length - core.length < wild.max;
  const isSet = core.every((c) => c.rank === core[0].rank);
  if (isSet) return card.rank === core[0].rank && meld.length + 1 <= 4;
  if (!core.every((c) => c.suit === core[0].suit) || card.suit !== core[0].suit) return false;
  const idx = core.map((c) => order.indexOf(c.rank as never)).sort((a, b) => a - b);
  const ci = order.indexOf(card.rank as never);
  void cfg;
  // A wild inside the run stretches the span it occupies, so the ends move out by that many.
  const pad = meld.length - core.length;
  return ci >= idx[0] - 1 - pad && ci <= idx[idx.length - 1] + 1 + pad
    && (ci === idx[0] - 1 || ci === idx[idx.length - 1] + 1 || !idx.includes(ci));
}

// After a knock, the defender's spare cards may be absorbed into the knocker's melds, cutting
// their deadwood. Resolved greedily but repeatedly, so chains (…9,10,J then Q then K) all land.
function layOffDeadwood(state: MatchState, melds: Card[][], spare: Card[]): number {
  const pool = spare.slice();
  const target = melds.map((m) => m.slice());
  let moved = true;
  while (moved) {
    moved = false;
    for (let i = 0; i < pool.length; i++) {
      for (const m of target) {
        if (extendsMeld(state, m, pool[i])) {
          m.push(pool[i]);
          pool.splice(i, 1);
          moved = true;
          break;
        }
      }
      if (moved) break;
    }
  }
  return pool.reduce((a, c) => a + deadwoodValue(c), 0);
}

function rummyLegalMoves(state: MatchState, playerId: string): Move[] {
  if (state.players[state.turnIndex] !== playerId) return [];
  const z = rummyZones(state.definition);
  const hand = state.zones[`hand:${playerId}`] || [];
  if (state.rummyPhase === 'draw') {
    const moves: Move[] = [{ actionId: 'drawStock' }];
    if ((state.zones[z.discard] || []).length > 0) moves.push({ actionId: 'drawDiscard' });
    return moves;
  }
  const cfg = state.definition.rummy!;
  // Gin: melds stay concealed. The only choices are which card to throw, and whether throwing
  // it ends the hand.
  if (cfg.knock !== undefined) {
    const moves: Move[] = [];
    for (const c of hand) {
      moves.push({ actionId: 'rummyDiscard', cardId: c.id });
      const rest = hand.filter((x) => x.id !== c.id);
      if (bestArrangement(state, rest).deadwood <= cfg.knock) moves.push({ actionId: 'knock', cardId: c.id });
    }
    return moves;
  }

  // play phase: lay any meld, extend one already down, or discard to end the turn
  const moves: Move[] = findMelds(state, hand).map((m) => ({ actionId: 'meld', cards: m.cards }));
  if (cfg.layOff) {
    for (const m of layOffTargets(state, hand)) moves.push({ actionId: 'layOff', cardId: m.cardId, choice: m.meldKey });
  }
  for (const c of hand) moves.push({ actionId: 'rummyDiscard', cardId: c.id });
  return moves;
}

// Melds already on the table, grouped back out of the shared flat pile so cards can be added to
// them. The pile itself carries no separators, so this reads state.rummyMeldSizes — the length
// of each group, in order, updated wherever a meld is laid or laid off onto — rather than
// guessing boundaries back out of the cards themselves, which is genuinely ambiguous whenever one
// group happens to end in the same suit the next one starts with.
function tableMelds(state: MatchState): Card[][] {
  const z = rummyZones(state.definition);
  if (!z.melds) return [];
  const cards = state.zones[z.melds] || [];
  const out: Card[][] = [];
  let i = 0;
  for (const size of state.rummyMeldSizes) {
    out.push(cards.slice(i, i + size));
    i += size;
  }
  return out;
}

function layOffTargets(state: MatchState, hand: Card[]): { cardId: string; meldKey: string }[] {
  const out: { cardId: string; meldKey: string }[] = [];
  const melds = tableMelds(state);
  melds.forEach((m, i) => {
    for (const c of hand) if (extendsMeld(state, m, c)) out.push({ cardId: c.id, meldKey: String(i) });
  });
  return out;
}

function applyRummyMove(s: MatchState, playerId: string, move: Move): MatchState {
  const legal = rummyLegalMoves(s, playerId);
  const ok = legal.find((m) => m.actionId === move.actionId && m.cardId === move.cardId
    && m.choice === move.choice && sameCards(m.cards, move.cards));
  if (!ok) return s;
  const z = rummyZones(s.definition);
  const hand = s.zones[`hand:${playerId}`];

  if (move.actionId === 'drawStock') {
    // Gin does not recycle the discard — running the stock out washes the hand out.
    if (s.definition.rummy!.knock !== undefined && (s.zones[z.stock] || []).length === 0) {
      s.phase = 'roundOver';
      for (const p of s.players) s.scores[p] = 0;
      s.winner = null;
      log(s, null, 'Stock exhausted — the hand is a wash.');
      finalizeMatchProgress(s);
      return s;
    }
    if ((s.zones[z.stock] || []).length === 0) {
      // refill the stock from the discard pile
      const disc = s.zones[z.discard];
      if (disc.length > 1) {
        const keep = disc.pop()!;
        const { result, rngState } = seededShuffle(disc, s.rngState);
        s.rngState = rngState;
        s.zones[z.stock] = result;
        s.zones[z.discard] = [keep];
        log(s, null, 'Stock refilled from the discard.');
      }
    }
    const card = s.zones[z.stock].pop();
    if (card) hand.push(card);
    s.rummyPhase = 'play';
    log(s, playerId, `${short(playerId)} draws from the stock.`);
    return s;
  }
  if (move.actionId === 'drawDiscard') {
    const card = s.zones[z.discard].pop();
    if (card) hand.push(card);
    s.rummyPhase = 'play';
    log(s, playerId, `${short(playerId)} takes the discard.`);
    return s;
  }
  if (move.actionId === 'knock') {
    const idx = hand.findIndex((c) => c.id === move.cardId);
    const [thrown] = hand.splice(idx, 1);
    s.zones[z.discard].push(thrown);
    log(s, playerId, `${short(playerId)} knocks, throwing ${cardLabel(thrown)}.`);
    endGinRound(s, playerId);
    return s;
  }

  if (move.actionId === 'layOff') {
    const meldIdx = parseInt(move.choice ?? '', 10);
    const melds = tableMelds(s);
    const meld = melds[meldIdx];
    const i = hand.findIndex((c) => c.id === move.cardId);
    if (!meld || i < 0) return s;
    const [card] = hand.splice(i, 1);
    // Rebuild the shared pile with the card inserted into its meld, and grow that meld's tracked
    // size to match — rummyMeldSizes is what lets tableMelds() find this same group again next
    // time, rather than having to guess its boundaries back out of the flat card list.
    melds[meldIdx] = [...meld, card];
    if (z.melds) s.zones[z.melds] = melds.flat();
    s.rummyMeldSizes[meldIdx] += 1;
    s.stallCount = 0;
    log(s, playerId, `${short(playerId)} lays ${cardLabel(card)} onto a meld.`);
    if (s.zones[`hand:${playerId}`].length === 0) endRummyRound(s, playerId);
    return s;
  }

  if (move.actionId === 'meld') {
    const ids = new Set(move.cards);
    const melded = hand.filter((c) => ids.has(c.id));
    s.zones[`hand:${playerId}`] = hand.filter((c) => !ids.has(c.id));
    if (z.melds) s.zones[z.melds].push(...melded);
    s.rummyMeldSizes.push(melded.length);
    s.stallCount = 0;
    log(s, playerId, `${short(playerId)} melds ${melded.map(cardLabel).join(' ')}.`);
    fireRules(s, 'meldLaid', { playerId, targetCard: melded[0] });
    if (s.zones[`hand:${playerId}`].length === 0) endRummyRound(s, playerId);
    return s;
  }
  // rummyDiscard
  const idx = hand.findIndex((c) => c.id === move.cardId);
  const card = hand[idx];
  hand.splice(idx, 1);
  s.zones[z.discard].push(card);
  log(s, playerId, `${short(playerId)} discards ${cardLabel(card)}.`);
  if (hand.length === 0) { endRummyRound(s, playerId); return s; }
  s.stallCount += 1;
  s.rummyPhase = 'draw';
  s.turnIndex = ((s.turnIndex + s.direction) % s.players.length + s.players.length) % s.players.length;
  // A knocking game never melds mid-hand, so "nobody has melded lately" means nothing there —
  // it ends on a knock or when the stock runs out.
  if (s.definition.rummy!.knock === undefined && s.stallCount >= 4 * s.players.length) {
    endRummyRound(s, null); // nobody melding → end by fewest cards
  }
  return s;
}

// Knocking scores the gap between the two players' unmatched cards. Going gin pays a bonus;
// failing to beat the defender hands them the hand instead ("undercut").
function endGinRound(s: MatchState, knocker: string): void {
  const cfg = s.definition.rummy!;
  s.phase = 'roundOver';

  const mine = bestArrangement(s, s.zones[`hand:${knocker}`] || []);
  const defender = s.players.find((p) => p !== knocker) ?? knocker;
  const theirs = bestArrangement(s, s.zones[`hand:${defender}`] || []);

  // A gin hand cannot be laid off against.
  const theirDeadwood = cfg.layOff && mine.deadwood > 0
    ? layOffDeadwood(s, mine.melds, theirs.spare)
    : theirs.deadwood;

  for (const p of s.players) s.scores[p] = 0;
  if (mine.deadwood === 0) {
    s.scores[knocker] = theirDeadwood + (cfg.ginBonus ?? 0);
    s.winner = knocker;
    s.roundOutcome = 'gin';
    log(s, knocker, `GIN — ${short(knocker)} scores ${s.scores[knocker]}.`);
  } else if (theirDeadwood < mine.deadwood) {
    s.scores[defender] = mine.deadwood - theirDeadwood + (cfg.undercutBonus ?? 0);
    s.winner = defender;
    s.roundOutcome = 'undercut';
    log(s, defender, `Undercut! ${short(defender)} scores ${s.scores[defender]} (${theirDeadwood} v ${mine.deadwood}).`);
  } else if (theirDeadwood === mine.deadwood) {
    s.scores[defender] = cfg.undercutBonus ?? 0;
    s.winner = defender;
    s.roundOutcome = 'undercut';
    log(s, defender, `Undercut on a tie — ${short(defender)} scores ${s.scores[defender]}.`);
  } else {
    s.scores[knocker] = theirDeadwood - mine.deadwood;
    s.winner = knocker;
    s.roundOutcome = 'knock';
    log(s, knocker, `${short(knocker)} scores ${s.scores[knocker]} (${mine.deadwood} v ${theirDeadwood}).`);
  }
  finalizeMatchProgress(s);
}

function endRummyRound(s: MatchState, winner: string | null): void {
  s.phase = 'roundOver';
  if (!winner) {
    let best = s.players[0]; let bestN = Infinity;
    for (const p of s.players) { const n = (s.zones[`hand:${p}`] || []).length; if (n < bestN) { bestN = n; best = p; } }
    winner = best;
  }
  /*
    What a hand of cards is worth at the end of a round.

    A bare count of cards is the right answer for a game that never said otherwise — it is what
    Rummy has always used, and it is why Rummy plays to 30 rather than 100. But a game that
    supplies a points table means it: Canasta's jokers are worth fifty apiece and its deuces
    twenty, which is the whole reason they are both wonderful to meld and painful to be caught
    holding. That table used to be read by nothing at all, so such a game scored a flat card
    count and its target was unreachable.
  */
  const priced = Object.keys(s.definition.scoring.cardPoints ?? {}).length > 0;
  for (const p of s.players) {
    const hand = s.zones[`hand:${p}`] || [];
    s.scores[p] = priced
      ? hand.reduce((total, c) => total + cardPoints(s.definition.scoring, c), 0)
      : hand.length;   // fewer left = better
  }
  s.winner = winner;
  log(s, null, `Round over — ${short(winner)} goes out.`);
  finalizeMatchProgress(s);
}

function sameCards(a?: string[], b?: string[]): boolean {
  if (!a && !b) return true;
  if (!a || !b || a.length !== b.length) return false;
  const sa = [...a].sort(); const sb = [...b].sort();
  return sa.every((x, i) => x === sb[i]);
}

function suitSym(s: string): string {
  return { C: '♣', D: '♦', H: '♥', S: '♠' }[s] || '';
}

// ---------- comparison family (War) ----------

function warStrength(def: MatchState['definition'], rank: string): number {
  const base = def.deck.rankOrder.indexOf(rank as never);
  return def.war!.aceHigh && rank === 'A' ? 100 : base;
}

function applyWarMove(s: MatchState, playerId: string, move: Move): MatchState {
  // Every other family's apply function checks phase itself rather than relying only on the
  // caller — matchService does gate on phase before ever reaching here, but the engine is
  // documented as the referee, not something that only stays correct because callers behave.
  if (s.phase !== 'playing' || move.actionId !== 'warFlip' || s.players[s.turnIndex] !== playerId) return s;
  const [a, b] = s.players;
  const handA = s.zones[`hand:${a}`];
  const handB = s.zones[`hand:${b}`];
  const pot: Card[] = [];

  let guard = 0;
  while (guard++ < 20) {
    const ca = handA.shift();
    const cb = handB.shift();
    if (!ca || !cb) { if (ca) pot.push(ca); if (cb) pot.push(cb); break; }
    pot.push(ca, cb);
    // What the table shows, as a copy. The real cards are on their way into the winner's hand
    // a few lines below, and a card cannot be in two places at once — see MatchState.lastBattle.
    s.lastBattle = [{ card: { ...ca } }, { card: { ...cb } }];
    const sa = warStrength(s.definition, ca.rank);
    const sb = warStrength(s.definition, cb.rank);
    if (sa !== sb) {
      const winnerHand = sa > sb ? handA : handB;
      winnerHand.push(...shuffleForWar(s, pot));
      log(s, null, `${short(sa > sb ? a : b)} wins ${ca.rank} vs ${cb.rank}.`);
      break;
    }
    // tie → war: 3 face-down each, then flip again
    s.warsCount += 1;
    log(s, null, `War! ${ca.rank} ties ${cb.rank}.`);
    for (let k = 0; k < 3; k++) { const x = handA.shift(); const y = handB.shift(); if (x) pot.push(x); if (y) pot.push(y); }
    if (handA.length === 0 || handB.length === 0) {
      const winnerHand = handA.length >= handB.length ? handA : handB;
      winnerHand.push(...shuffleForWar(s, pot));
      break;
    }
  }

  if (handA.length === 0 || handB.length === 0) { endWarRound(s); return s; }
  s.stallCount += 1;
  if (s.stallCount >= s.definition.war!.roundCap) { endWarRound(s); return s; }
  return s;
}

function shuffleForWar(s: MatchState, cards: Card[]): Card[] {
  const { result, rngState } = seededShuffle(cards, s.rngState);
  s.rngState = rngState;
  return result;
}

function endWarRound(s: MatchState): void {
  s.phase = 'roundOver';
  let best = s.players[0]; let bestN = -1;
  for (const p of s.players) { const n = (s.zones[`hand:${p}`] || []).length; s.scores[p] = n; if (n > bestN) { bestN = n; best = p; } }
  s.winner = best;
  log(s, null, `Game over — ${short(best)} wins with ${bestN} cards.`);
  finalizeMatchProgress(s);
}


// ---------- bluff family (Cheat / "I Doubt It") ----------
//
// Every claim plays one same-actual-rank group from your hand — 1 to 4 cards — face down,
// under a claimed rank you choose freely (which may or may not match). That claim stays open
// to challenge, by anyone but you, until you make your NEXT claim; making a new claim without
// challenging the last one lets it stand forever. A challenge reveals the disputed cards: if
// the claim was true, the challenger takes the whole center pile; if it was a lie, the
// claimant does. First to empty their hand wins.

function bluffCenterZone(def: GameDefinition): string {
  return def.zones.find((z) => z.shared && z.type === 'pile')!.id;
}

function bluffChallengeMoves(state: MatchState, playerId: string): Move[] {
  if (!state.pendingClaim || state.pendingClaim.player === playerId) return [];
  return [{ actionId: 'bluffChallenge' }];
}

function bluffClaimMoves(state: MatchState, playerId: string): Move[] {
  const cfg = state.definition.bluff!;
  const hand = state.zones[`hand:${playerId}`] || [];
  if (hand.length === 0) return [];
  const ranks = cfg.claimableRanks ?? state.definition.deck.rankOrder;
  const moves: Move[] = [];
  for (const size of [1, 2, 3, 4]) {
    for (const g of climbGroups(hand, size)) {
      for (const claimedRank of ranks) moves.push({ actionId: 'bluffClaim', cards: g.cards, claimedRank });
    }
  }
  return moves;
}

function bluffLegalMoves(state: MatchState, playerId: string): Move[] {
  const challenge = bluffChallengeMoves(state, playerId);
  if (state.players[state.turnIndex] !== playerId) return challenge;
  // On your own turn you may challenge the standing claim (if any) OR simply make your own —
  // playing your own claim, without challenging, is exactly what lets the previous one stand.
  return [...challenge, ...bluffClaimMoves(state, playerId)];
}

function applyBluffMove(s: MatchState, playerId: string, move: Move): MatchState {
  const def = s.definition;
  const center = bluffCenterZone(def);

  if (move.actionId === 'bluffChallenge') {
    if (bluffChallengeMoves(s, playerId).length === 0) return s;
    const claim = s.pendingClaim!;
    const pile = s.zones[center] || [];
    const disputed = pile.filter((c) => claim.cardIds.includes(c.id));
    const claimWasTrue = disputed.length === claim.count && disputed.every((c) => c.rank === claim.claimedRank);
    const loser = claimWasTrue ? playerId : claim.player;
    // The cards themselves, not just the verdict — the reveal is the moment the log line
    // can't carry, and the pile they're sitting in is about to be swept into the loser's hand.
    s.lastReveal = { claimant: claim.player, challenger: playerId, claimedRank: claim.claimedRank, cards: disputed.map((c) => ({ ...c })), wasTrue: claimWasTrue, ply: s.ply };
    if (!claimWasTrue) {
      s.bluffCaught[claim.player] = (s.bluffCaught[claim.player] ?? 0) + 1;
      s.bluffCalled[playerId] = (s.bluffCalled[playerId] ?? 0) + 1;
    }
    log(s, playerId, claimWasTrue
      ? `${short(playerId)} called it — but ${short(claim.player)} was telling the truth about the ${claim.claimedRank}s. ${short(playerId)} takes the pile (${pile.length}).`
      : `${short(playerId)} called it — ${short(claim.player)} was lying about the ${claim.claimedRank}s. ${short(claim.player)} takes the pile (${pile.length}).`);
    const loserHand = s.zones[`hand:${loser}`] || (s.zones[`hand:${loser}`] = []);
    loserHand.push(...pile);
    s.zones[center] = [];
    s.pendingClaim = null;
    // Whoever just picked up the pile leads next — set directly, not via advanceAndCheck,
    // which would step turnIndex one further and skip right past them.
    s.turnIndex = s.players.indexOf(loser);
    bluffCheckWin(s);
    return s;
  }

  if (move.actionId !== 'bluffClaim' || s.players[s.turnIndex] !== playerId) return s;
  const legal = bluffClaimMoves(s, playerId);
  const chosen = legal.find((m) => m.actionId === 'bluffClaim'
    && m.claimedRank === move.claimedRank
    && m.cards?.length === move.cards?.length
    && m.cards?.every((id) => move.cards?.includes(id)));
  if (!chosen) return s;

  const hand = s.zones[`hand:${playerId}`] || [];
  const moved: Card[] = [];
  for (const id of move.cards!) {
    const i = hand.findIndex((c) => c.id === id);
    if (i >= 0) moved.push(...hand.splice(i, 1));
  }
  s.zones[center] = [...(s.zones[center] || []), ...moved];
  // Making this claim is what lets any PREVIOUS claim stand unchallenged forever — nothing
  // extra to do for that; it simply stops being named anywhere once this one replaces it.
  s.pendingClaim = { player: playerId, count: moved.length, claimedRank: move.claimedRank!, cardIds: moved.map((c) => c.id) };
  log(s, playerId, `${short(playerId)} plays ${moved.length} card${moved.length === 1 ? '' : 's'} face down, claiming ${move.claimedRank}${moved.length > 1 ? 's' : ''}.`);
  advanceAndCheck(s);
  bluffCheckWin(s);
  return s;
}

// A player wins the instant they hold zero cards AND no claim of theirs is still open to
// challenge — which covers going out safely (the claim later gets superseded or survives a
// challenge) as well as the ordinary case of being caught out by nobody at all. Checked after
// every claim and every challenge resolves, so it fires at the first moment it becomes true
// however it happens to become true.
function bluffCheckWin(s: MatchState): boolean {
  if (s.phase !== 'playing') return false;
  const out = s.players.find((p) =>
    (s.zones[`hand:${p}`] || []).length === 0 && s.pendingClaim?.player !== p);
  if (!out) return false;
  s.phase = 'roundOver';
  s.winner = out;
  for (const p of s.players) s.scores[p] = p === out ? 1 : 0;
  log(s, null, `Game over — ${short(out)} is out of cards and in the clear.`);
  finalizeMatchProgress(s);
  return true;
}

// ---------- reflex family (Slapjack / Snap) ----------
//
// Whoever's turn it is flips their top card face-up onto the shared pile; turn then advances
// normally, like a metronome. Separately, ANY player may slap whenever the top of the pile (or,
// for `slapMatch`, the top two cards) satisfies the trigger — this is the same "several players
// can act; the engine takes whichever move actually arrives" shape climb's bomb already uses,
// just without a turn requirement on either side. A correct slap wins the whole pile into the
// slapper's hand; there is no penalty for a slap offered when it would not have been valid,
// because the engine never offers one — `legalMoves` only lists a slap while it is genuine.

function reflexPileZone(def: GameDefinition): string {
  return def.zones.find((z) => z.shared && z.visibility === 'all')!.id;
}

function reflexSlapValid(state: MatchState): boolean {
  const cfg = state.definition.reflex!;
  const pile = state.zones[reflexPileZone(state.definition)] || [];
  const top = pile[pile.length - 1];
  if (!top) return false;
  if (cfg.slapRanks.includes(top.rank)) return true;
  if (cfg.slapMatch && pile.length >= 2 && pile[pile.length - 2].rank === top.rank) return true;
  return false;
}

// Still in the game: has not been eliminated. A player can reach zero cards in hand and stay
// here — they can still win a slap and get the whole pile back — so this is deliberately not
// the same set as "has cards to flip".
function reflexActive(state: MatchState): string[] {
  return state.players.filter((p) => !state.reflexOut.includes(p));
}

// Whose turn it is to FLIP, walking forward from turnIndex (which indexes the raw seat list,
// the same convention climb's nextActiveIndex uses) and skipping active players who currently
// hold no cards — they cannot flip, and simply waiting on them without ever moving past them
// is a deadlock, not a turn. Returns null only when nobody at all can flip right now.
function reflexNextFlipper(state: MatchState, from: number): string | null {
  const n = state.players.length;
  for (let step = 0; step < n; step++) {
    const i = (from + step) % n;
    const p = state.players[i];
    if (state.reflexOut.includes(p)) continue;
    if ((state.zones[`hand:${p}`] || []).length > 0) return p;
  }
  return null;
}

function reflexLegalMoves(state: MatchState, playerId: string): Move[] {
  if (state.reflexOut.includes(playerId)) return [];
  const moves: Move[] = [];
  if (reflexSlapValid(state)) moves.push({ actionId: 'reflexSlap' });
  if (reflexNextFlipper(state, state.turnIndex) === playerId) moves.push({ actionId: 'reflexFlip' });
  return moves;
}

function applyReflexMove(s: MatchState, playerId: string, move: Move): MatchState {
  const def = s.definition;
  const pile = reflexPileZone(def);

  if (move.actionId === 'reflexSlap') {
    if (!reflexSlapValid(s) || s.reflexOut.includes(playerId)) return s;
    const won = s.zones[pile] || [];
    log(s, playerId, `${short(playerId)} slaps! Takes ${won.length} card${won.length === 1 ? '' : 's'}.`);
    const hand = s.zones[`hand:${playerId}`] || (s.zones[`hand:${playerId}`] = []);
    hand.unshift(...won);
    s.zones[pile] = [];
    reflexCheckEnd(s);
    return s;
  }

  if (move.actionId !== 'reflexFlip' || reflexNextFlipper(s, s.turnIndex) !== playerId) return s;
  const hand = s.zones[`hand:${playerId}`] || [];
  const card = hand.shift();
  if (!card) return s;
  s.zones[pile] = [...(s.zones[pile] || []), card];
  log(s, playerId, `${short(playerId)} flips ${cardLabel(card)}.`);
  s.turnIndex = s.players.indexOf(playerId);
  s.stallCount += 1; // doubles as the flip counter here, the same way War reuses it for its own cap

  // Each flip can trigger at most one slap in reply, so total moves run to roughly double
  // this — keep real headroom under the simulator's own 4000-move safety cap.
  const cap = def.reflex!.flipCap ?? 1500;
  if (s.stallCount >= cap) {
    const winner = s.players.reduce((best, p) =>
      (s.zones[`hand:${p}`] || []).length > (s.zones[`hand:${best}`] || []).length ? p : best, s.players[0]);
    s.phase = 'roundOver';
    s.winner = winner;
    for (const p of s.players) s.scores[p] = p === winner ? 1 : 0;
    log(s, null, `Game over — ${cap} flips in, ${short(winner)} is holding the most cards.`);
    finalizeMatchProgress(s);
    return s;
  }

  if (reflexCheckEnd(s)) return s;
  const next = reflexNextFlipper(s, s.turnIndex + 1);
  if (next) s.turnIndex = s.players.indexOf(next);
  return s;
}

function reflexCheckEnd(s: MatchState): boolean {
  // A player with zero cards and nothing left to slap for is out; re-check everyone now that
  // the pile just changed hands (a slap) or might have just run dry (defensive; a flip never
  // empties the pile on its own).
  const pileEmpty = (s.zones[reflexPileZone(s.definition)] || []).length === 0;
  if (pileEmpty) {
    for (const p of s.players) {
      if (!s.reflexOut.includes(p) && (s.zones[`hand:${p}`] || []).length === 0) {
        s.reflexOut.push(p);
        log(s, null, `${short(p)} is out of cards.`);
      }
    }
  }
  const remaining = reflexActive(s);
  if (remaining.length > 1) {
    // A non-empty pile that nobody can flip toward and nobody can slap right now is a dead
    // table — everyone still "active" ran out of cards without the pile ever being slapped
    // empty, so `pileEmpty` above never fires and nothing else would ever end this hand.
    if (reflexNextFlipper(s, s.turnIndex) === null && !reflexSlapValid(s)) {
      s.phase = 'roundOver';
      const winner = s.players.reduce((best, p) =>
        (s.zones[`hand:${p}`] || []).length > (s.zones[`hand:${best}`] || []).length ? p : best, s.players[0]);
      s.winner = winner;
      for (const p of s.players) s.scores[p] = p === winner ? 1 : 0;
      log(s, null, `Game over — nobody can flip or slap what's left. ${short(winner)} holds the most cards.`);
      finalizeMatchProgress(s);
      return true;
    }
    return false;
  }
  s.phase = 'roundOver';
  const winner = remaining[0] ?? s.players.reduce((best, p) =>
    (s.zones[`hand:${p}`] || []).length > (s.zones[`hand:${best}`] || []).length ? p : best, s.players[0]);
  s.winner = winner;
  for (const p of s.players) s.scores[p] = p === winner ? 1 : 0;
  log(s, null, `Game over — ${short(winner)} is the last one holding cards.`);
  finalizeMatchProgress(s);
  return true;
}

// ---------- poker family (single-round showdown, ante/blinds, no side pots) ----------
//
// A fixed deal, one betting round, then a showdown — deliberately not the full game. No
// streets, no draw phase, no side pots: a player who cannot cover the current bet may only
// fold. Real, working stakes (chips move, a pot is won and lost) rather than the "no wagering"
// scoring-only showdown the classic template already shipped.

function pokerActiveIds(s: MatchState): string[] {
  return s.players.filter((p) => !s.folded[p]);
}

function pokerToCall(s: MatchState, playerId: string): number {
  return Math.max(0, s.currentBet - (s.committed[playerId] ?? 0));
}

function pokerLegalMoves(state: MatchState, playerId: string): Move[] {
  if (state.folded[playerId] || state.pokerPhase !== 'bet') return [];
  if (state.players[state.turnIndex] !== playerId) return [];
  const toCall = pokerToCall(state, playerId);
  const stack = state.chips[playerId] ?? 0;
  const moves: Move[] = [];
  if (toCall === 0) moves.push({ actionId: 'pokerCheck' });
  else if (stack >= toCall) moves.push({ actionId: 'pokerCall' });
  if (stack > toCall) {
    const cfg = state.definition.poker!;
    const minTo = state.currentBet + cfg.minRaise;
    if (stack >= minTo - (state.committed[playerId] ?? 0)) {
      moves.push({ actionId: state.currentBet === 0 ? 'pokerBet' : 'pokerRaise', amount: minTo });
      // A shove is always offered too, so an author-testing bot can go all-in without needing
      // the exact minimum-raise increment.
      if (stack + (state.committed[playerId] ?? 0) > minTo) {
        moves.push({ actionId: state.currentBet === 0 ? 'pokerBet' : 'pokerRaise', amount: stack + (state.committed[playerId] ?? 0) });
      }
    }
  }
  moves.push({ actionId: 'pokerFold' });
  return moves;
}

function pokerAdvance(s: MatchState): void {
  const active = pokerActiveIds(s);
  if (active.length <= 1) { pokerEndHand(s); return; }
  const n = s.players.length;
  let i = s.turnIndex;
  for (let step = 0; step < n; step++) {
    i = (i + 1) % n;
    const p = s.players[i];
    if (s.folded[p]) continue;
    if (!s.actedThisRound[p] || (s.committed[p] ?? 0) < s.currentBet) { s.turnIndex = i; return; }
  }
  pokerShowdown(s);
}

function applyPokerMove(s: MatchState, playerId: string, move: Move): MatchState {
  const legal = pokerLegalMoves(s, playerId);
  const chosen = legal.find((m) => m.actionId === move.actionId
    && (move.actionId !== 'pokerBet' && move.actionId !== 'pokerRaise' || m.amount === move.amount));
  if (!chosen) return s;

  const commit = (to: number) => {
    const already = s.committed[playerId] ?? 0;
    const add = Math.min(to, already + (s.chips[playerId] ?? 0)) - already;
    s.chips[playerId] = (s.chips[playerId] ?? 0) - add;
    s.committed[playerId] = already + add;
    s.pot += add;
  };

  if (move.actionId === 'pokerFold') {
    s.folded[playerId] = true;
    log(s, playerId, `${short(playerId)} folds.`);
  } else if (move.actionId === 'pokerCheck') {
    s.actedThisRound[playerId] = true;
    log(s, playerId, `${short(playerId)} checks.`);
  } else if (move.actionId === 'pokerCall') {
    commit(s.currentBet);
    s.actedThisRound[playerId] = true;
    log(s, playerId, `${short(playerId)} calls.`);
  } else if (move.actionId === 'pokerBet' || move.actionId === 'pokerRaise') {
    commit(move.amount!);
    s.currentBet = Math.max(s.currentBet, s.committed[playerId] ?? 0);
    // A new bet reopens the round for everyone else.
    for (const p of s.players) s.actedThisRound[p] = false;
    s.actedThisRound[playerId] = true;
    log(s, playerId, `${short(playerId)} ${move.actionId === 'pokerBet' ? 'bets' : 'raises to'} ${s.currentBet}.`);
  }

  if (s.phase !== 'playing') return s;
  pokerAdvance(s);
  return s;
}

const HAND_CATEGORY = ['high', 'pair', 'twoPair', 'trips', 'straight', 'flush', 'fullHouse', 'quads', 'straightFlush'] as const;

/** A simple, honest hand ranking — enough to settle a showdown, not a full 52-card evaluator. */
function pokerHandStrength(def: GameDefinition, cards: Card[]): { score: number; label: string } {
  const order = def.deck.rankOrder;
  const ranks = cards.map((c) => order.indexOf(c.rank)).sort((a, b) => b - a);
  const counts: Record<number, number> = {};
  for (const r of ranks) counts[r] = (counts[r] ?? 0) + 1;
  const groups = Object.entries(counts).map(([r, n]) => ({ r: Number(r), n }))
    .sort((a, b) => b.n - a.n || b.r - a.r);
  const isFlush = cards.length >= 5 && cards.every((c) => c.suit === cards[0].suit);
  const uniq = [...new Set(ranks)].sort((a, b) => a - b);
  let isStraight = false; let straightHigh = -1;
  for (let i = 0; i + 4 < uniq.length + 1 && uniq.length >= 5; i++) {
    if (uniq[i + 4] - uniq[i] === 4) { isStraight = true; straightHigh = uniq[i + 4]; }
  }
  let cat = 0; // index into HAND_CATEGORY
  if (isStraight && isFlush) cat = 8;
  else if (groups[0]?.n === 4) cat = 7;
  else if (groups[0]?.n === 3 && groups[1]?.n >= 2) cat = 6;
  else if (isFlush) cat = 5;
  else if (isStraight) cat = 4;
  else if (groups[0]?.n === 3) cat = 3;
  else if (groups[0]?.n === 2 && groups[1]?.n === 2) cat = 2;
  else if (groups[0]?.n === 2) cat = 1;
  const tiebreak = cat === 4 || cat === 8 ? [straightHigh] : groups.map((g) => g.r).concat(ranks).slice(0, 5);
  const score = cat * 1e10 + tiebreak.reduce((acc, v, i) => acc + v * Math.pow(15, 4 - i), 0);
  return { score, label: HAND_CATEGORY[cat] };
}

function pokerShowdown(s: MatchState): void {
  s.pokerPhase = 'showdown';
  const active = pokerActiveIds(s);
  let winner = active[0];
  let best = -1;
  for (const p of active) {
    const { score } = pokerHandStrength(s.definition, s.zones[`hand:${p}`] || []);
    if (score > best) { best = score; winner = p; }
  }
  pokerAwardPot(s, winner, active.length > 1);
}

function pokerAwardPot(s: MatchState, winner: string, wasShowdown: boolean): void {
  s.pokerWasShowdown = wasShowdown;
  s.chips[winner] = (s.chips[winner] ?? 0) + s.pot;
  log(s, null, wasShowdown
    ? `${short(winner)} wins the showdown and takes the pot (${s.pot}).`
    : `Everyone else folded — ${short(winner)} takes the pot (${s.pot}).`);
  pokerEndHand(s, winner);
}

function pokerEndHand(s: MatchState, forcedWinner?: string): void {
  if (s.phase === 'roundOver') return;
  if (forcedWinner === undefined) { pokerShowdown(s); return; }
  s.phase = 'roundOver';
  s.winner = forcedWinner;
  for (const p of s.players) s.scores[p] = s.chips[p] ?? 0;
  finalizeMatchProgress(s);
}

// ---------- pit family (open-market trading, no turn order) ----------
//
// Nobody waits their turn. Any player holding cards may post an offer — give N of one suit,
// want N of another — and any OTHER player holding the wanted commodity may accept it, which
// swaps the cards immediately. First to hold `cornerSize` cards of one suit "corners the
// market" and wins. Every player is always in `actingPlayers()`, the same way a simultaneous
// pass is: there is no turn to wait for.

function pitLegalMoves(state: MatchState, playerId: string): Move[] {
  if (state.phase !== 'playing') return [];
  const hand = state.zones[`hand:${playerId}`] || [];
  const bySuit: Record<string, number> = {};
  for (const c of hand) bySuit[c.suit] = (bySuit[c.suit] ?? 0) + 1;
  const moves: Move[] = [];
  const suits: Suit[] = ['C', 'D', 'H', 'S'];
  for (const give of suits) {
    if ((bySuit[give] ?? 0) === 0) continue;
    for (const want of suits) {
      if (want === give) continue;
      for (const count of [1, 2, 3]) {
        if (count <= (bySuit[give] ?? 0)) moves.push({ actionId: 'pitOffer', give, want, cards: [String(count)] });
      }
    }
  }
  for (const offer of state.market) {
    if (offer.player === playerId) { moves.push({ actionId: 'pitCancel', offerId: offer.id }); continue; }
    if ((bySuit[offer.want] ?? 0) >= offer.count) moves.push({ actionId: 'pitAccept', offerId: offer.id });
  }
  return moves;
}

function applyPitMove(s: MatchState, playerId: string, move: Move): MatchState {
  const hand = s.zones[`hand:${playerId}`] || (s.zones[`hand:${playerId}`] = []);

  // No turn order here either, and no natural stalemate detection — two players could in
  // principle keep re-offering and cancelling forever without anyone ever cornering the market.
  // A hard cap, the same shape as war's roundCap and swap's turnCap.
  const cap = s.definition.pit!.roundCap ?? 3000;
  s.stallCount += 1;
  if (s.stallCount >= cap) {
    s.phase = 'roundOver';
    // Nobody cornered the market, so score by whoever came closest — most of any one suit —
    // fairly random among ties rather than by seat order.
    const mostOfOneSuit = (p: string): number => {
      const bySuit: Record<string, number> = {};
      for (const c of s.zones[`hand:${p}`] || []) bySuit[c.suit] = (bySuit[c.suit] ?? 0) + 1;
      return Math.max(0, ...Object.values(bySuit));
    };
    const best = Math.max(...s.players.map(mostOfOneSuit));
    const leaders = s.players.filter((p) => mostOfOneSuit(p) === best);
    const { result, rngState } = seededShuffle(leaders, s.rngState);
    s.rngState = rngState;
    const winner = result[0];
    s.winner = winner;
    for (const q of s.players) s.scores[q] = q === winner ? 1 : 0;
    log(s, null, `Nobody cornered the market in time — ${short(winner)} was closest.`);
    finalizeMatchProgress(s);
    return s;
  }

  if (move.actionId === 'pitOffer') {
    const count = Number(move.cards?.[0] ?? 0);
    const give = move.give as Suit; const want = move.want as Suit;
    const have = hand.filter((c) => c.suit === give).length;
    if (!count || have < count || give === want) return s;
    const id = s.nextOfferId++;
    s.market.push({ id, player: playerId, give, count, want });
    log(s, playerId, `${short(playerId)} offers ${suitCount(count, give)} for ${suitWord(want)}.`);
    return s;
  }

  if (move.actionId === 'pitCancel') {
    const before = s.market.length;
    s.market = s.market.filter((o) => !(o.id === move.offerId && o.player === playerId));
    if (s.market.length < before) log(s, playerId, `${short(playerId)} withdraws an offer.`);
    return s;
  }

  if (move.actionId === 'pitAccept') {
    const offer = s.market.find((o) => o.id === move.offerId);
    if (!offer || offer.player === playerId) return s;
    const mine = hand.filter((c) => c.suit === offer.want);
    const theirHand = s.zones[`hand:${offer.player}`] || [];
    const theirs = theirHand.filter((c) => c.suit === offer.give);
    if (mine.length < offer.count || theirs.length < offer.count) { s.market = s.market.filter((o) => o.id !== offer.id); return s; }
    const give = mine.slice(0, offer.count);
    const get = theirs.slice(0, offer.count);
    s.zones[`hand:${playerId}`] = hand.filter((c) => !give.includes(c)).concat(get);
    s.zones[`hand:${offer.player}`] = theirHand.filter((c) => !get.includes(c)).concat(give);
    s.market = s.market.filter((o) => o.id !== offer.id);
    s.tradesCompleted[playerId] = (s.tradesCompleted[playerId] ?? 0) + 1;
    s.tradesCompleted[offer.player] = (s.tradesCompleted[offer.player] ?? 0) + 1;
    log(s, playerId, `${short(playerId)} trades ${suitCount(offer.count, offer.want)} with ${short(offer.player)} for ${suitWord(offer.give)}.`);
    if (pitCheckWin(s)) return s;
    return s;
  }

  return s;
}

/**
 * How many of one suit actually corners the market at this table.
 *
 * The whole deck goes out however many people sit down, so at eight seats a hand is six cards
 * and a corner of seven was simply unreachable — that game could never end. The target is
 * therefore capped at the size of the smallest hand.
 *
 * Hand sizes never change in Pit — a trade swaps equal counts — so this is stable for the whole
 * game and can be quoted to the player up front.
 */
export function pitCorner(s: MatchState): number {
  const smallestHand = Math.min(...s.players.map((p) => (s.zones[`hand:${p}`] || []).length));
  // Never the whole hand. At seven and eight seats a hand is six or seven cards, and a target
  // equal to it means cornering requires dumping every last odd card — including the suit
  // nobody at the table is collecting. Those cards have no buyer, so the market locks solid
  // with everyone one card short. Leaving one slot spare is the difference between a game that
  // always ends and one that sometimes cannot.
  return Math.max(2, Math.min(s.definition.pit!.cornerSize, smallestHand - 1));
}

/** Is anyone already holding a corner? Used to reject a deal, before any move has been made. */
function pitDealtCorner(s: MatchState): boolean {
  const target = pitCorner(s);
  return s.players.some((p) => {
    const bySuit: Record<string, number> = {};
    for (const c of s.zones[`hand:${p}`] || []) bySuit[c.suit] = (bySuit[c.suit] ?? 0) + 1;
    return Object.values(bySuit).some((n) => n >= target);
  });
}

function pitCheckWin(s: MatchState): boolean {
  const target = pitCorner(s);
  for (const p of s.players) {
    const bySuit: Record<string, number> = {};
    for (const c of s.zones[`hand:${p}`] || []) bySuit[c.suit] = (bySuit[c.suit] ?? 0) + 1;
    if (Object.values(bySuit).some((n) => n >= target)) {
      s.phase = 'roundOver';
      s.winner = p;
      for (const q of s.players) s.scores[q] = q === p ? 1 : 0;
      log(s, null, `Game over — ${short(p)} corners the market.`);
      finalizeMatchProgress(s);
      return true;
    }
  }
  return false;
}

// ---------- the kent family (partnership signalling, no turn order) ----------
//
// Kent — also played as Kemps, Canes or Signal. Everybody holds four cards and four more sit
// face up in the middle. There is no turn order at all: any player may swap one of their cards
// for one of the pool's whenever they like, and the pool is thrown in and re-dealt when it has
// been picked over. Collect four of a kind and you have it — but saying so is exactly what you
// must not do. You signal, and your PARTNER has to be the one who calls it.
//
// The signal is the whole game, and it is the part that does not survive being digitised
// literally: across a table it is a raised eyebrow, and a raised eyebrow is not a move. Here
// signalling puts a tell on your seat that every player can see for a few moves. Your partner
// calling it wins the round; an opponent calling it off first hands the letter to you. What is
// being raced is therefore the same thing that is raced at a real table — who is watching.
//
// The tell lapses after a number of MOVES, not milliseconds. The engine has no clock and must
// not grow one: a rule that depends on wall time cannot be replayed from a seed and a list of
// moves, and being able to do that is the one property every rule in here has to keep.


// ---------- swap family (Dutch) ----------
//
// The first family where two people looking at the same card see different things. Everything
// else is hidden by zone; this is hidden per person, and `state.seen` is the record of who has
// looked at what.

export const swapZones = { grid: (p: string) => `grid:${p}` };

function swapGrid(s: MatchState, p: string): Card[] {
  return (s.zones[swapZones.grid(p)] ||= []);
}

/** Has this player been shown this card? */
export function hasSeen(s: MatchState, viewer: string, cardId: string): boolean {
  return (s.seen[viewer] || []).includes(cardId);
}

function markSeen(s: MatchState, viewer: string, cardId: string): void {
  const list = (s.seen[viewer] ||= []);
  if (!list.includes(cardId)) list.push(cardId);
}

/** Forget a card that has left the table, so `seen` does not grow for the whole match. */
function forget(s: MatchState, cardId: string): void {
  for (const p of Object.keys(s.seen)) s.seen[p] = s.seen[p].filter((id) => id !== cardId);
}

function powerOf(cfg: NonNullable<GameDefinition['swap']>, rank: string): 'peekSelf' | 'peekOther' | 'blindSwap' | null {
  if ((cfg.peekSelfRanks ?? []).includes(rank as never)) return 'peekSelf';
  if ((cfg.peekOtherRanks ?? []).includes(rank as never)) return 'peekOther';
  if ((cfg.blindSwapRanks ?? []).includes(rank as never)) return 'blindSwap';
  return null;
}

function swapLegalMoves(state: MatchState, playerId: string): Move[] {
  if (state.phase !== 'playing') return [];
  if (state.players[state.turnIndex] !== playerId) return [];
  const moves: Move[] = [];

  // A power that has been thrown and now has to be aimed.
  const power = state.pendingPower;
  if (power) {
    if (power.player !== playerId) return [];
    const mine = swapGrid(state, playerId);
    if (power.kind === 'peekSelf') {
      for (let i = 0; i < mine.length; i++) moves.push({ actionId: 'swapPeekSelf', slot: i });
      return moves;
    }
    if (power.kind === 'peekOther') {
      for (const p of state.players) {
        if (p === playerId) continue;
        const g = swapGrid(state, p);
        for (let i = 0; i < g.length; i++) moves.push({ actionId: 'swapPeekOther', target: p, slot: i });
      }
      return moves;
    }
    // blindSwap: one of mine for one of theirs, neither of us looking.
    for (let i = 0; i < mine.length; i++) {
      for (const p of state.players) {
        if (p === playerId) continue;
        const g = swapGrid(state, p);
        for (let j = 0; j < g.length; j++) {
          moves.push({ actionId: 'swapBlind', slot: i, target: p, targetSlot: j });
        }
      }
    }
    return moves;
  }

  const held = state.held;
  if (held && held.player === playerId) {
    // Put it in your row, throwing out whatever was there.
    for (let i = 0; i < swapGrid(state, playerId).length; i++) {
      moves.push({ actionId: 'swapPlace', slot: i });
    }
    // Or throw it away — but only a card off the stock, because taking the discard and putting
    // it straight back would be a turn that changed nothing and could be repeated for ever.
    if (held.from === 'stock') moves.push({ actionId: 'swapThrow' });
    return moves;
  }

  const draw = state.zones['draw'] || [];
  const discard = state.zones['discard'] || [];
  if (draw.length > 0 || discard.length > 1) moves.push({ actionId: 'swapDrawStock' });
  if (discard.length > 0) moves.push({ actionId: 'swapTakeDiscard' });
  // Calling is a claim that you are lowest, and it costs you if you are not.
  if (!state.caller) moves.push({ actionId: 'swapCall' });
  return moves;
}

function applySwapMove(s: MatchState, playerId: string, move: Move): MatchState {
  const cfg = s.definition.swap!;
  const grid = swapGrid(s, playerId);
  const discard = (s.zones['discard'] ||= []);

  if (move.actionId === 'swapDrawStock') {
    const draw = (s.zones['draw'] ||= []);
    if (draw.length === 0) {
      // The stock is gone. Everything thrown away except the top card is shuffled and becomes
      // the stock again, the way it is at a real table.
      const top = discard.pop();
      const back = discard.splice(0);
      for (const c of back) { forget(s, c.id); s.faceUp[c.id] = false; }
      const { result, rngState } = seededShuffle(back, s.rngState);
      s.rngState = rngState;
      draw.push(...result);
      if (top) discard.push(top);
    }
    const c = draw.pop();
    if (!c) return s;
    s.held = { player: playerId, card: c, from: 'stock' };
    // You looked at it; nobody else did.
    markSeen(s, playerId, c.id);
    log(s, playerId, `${short(playerId)} draws.`);
    return s;
  }

  if (move.actionId === 'swapTakeDiscard') {
    const c = discard.pop();
    if (!c) return s;
    s.held = { player: playerId, card: c, from: 'discard' };
    // Taken face up, so the whole table saw it.
    for (const p of s.players) markSeen(s, p, c.id);
    log(s, playerId, `${short(playerId)} takes ${cardLabel(c)} from the pile.`);
    return s;
  }

  if (move.actionId === 'swapPlace') {
    const held = s.held;
    if (!held || held.player !== playerId) return s;
    const i = move.slot ?? 0;
    if (i < 0 || i >= grid.length) return s;
    const out = grid[i];
    grid[i] = held.card;
    s.held = null;
    // Whatever you put in, you know. Whatever comes out, everybody now knows — and forgetting
    // it keeps `seen` from growing for the whole match.
    markSeen(s, playerId, held.card.id);
    forget(s, out.id);
    s.faceUp[out.id] = true;
    s.faceUp[held.card.id] = false;
    discard.push(out);
    log(s, playerId, `${short(playerId)} swaps one out — ${cardLabel(out)}.`);
    return swapEndTurn(s, playerId);
  }

  if (move.actionId === 'swapThrow') {
    const held = s.held;
    if (!held || held.player !== playerId) return s;
    s.held = null;
    forget(s, held.card.id);
    s.faceUp[held.card.id] = true;
    discard.push(held.card);
    const power = powerOf(cfg, held.card.rank);
    log(s, playerId, `${short(playerId)} throws ${cardLabel(held.card)}.`);
    if (power) {
      // A card with a power is worth throwing for the power alone, which is what makes the
      // small cards interesting rather than merely small.
      s.pendingPower = { player: playerId, kind: power };
      return s;
    }
    return swapEndTurn(s, playerId);
  }

  if (move.actionId === 'swapPeekSelf') {
    const c = grid[move.slot ?? 0];
    if (c) { markSeen(s, playerId, c.id); log(s, playerId, `${short(playerId)} looks at one of their own.`); }
    s.pendingPower = null;
    return swapEndTurn(s, playerId);
  }

  if (move.actionId === 'swapPeekOther') {
    const g = swapGrid(s, move.target ?? '');
    const c = g[move.slot ?? 0];
    if (c) { markSeen(s, playerId, c.id); log(s, playerId, `${short(playerId)} looks at one of ${short(move.target ?? '')}'s.`); }
    s.pendingPower = null;
    return swapEndTurn(s, playerId);
  }

  if (move.actionId === 'swapBlind') {
    const theirs = swapGrid(s, move.target ?? '');
    const i = move.slot ?? 0;
    const j = move.targetSlot ?? 0;
    if (grid[i] && theirs[j]) {
      const a = grid[i];
      const b = theirs[j];
      grid[i] = b;
      theirs[j] = a;
      // Neither of you looked, so what either of you knew about those two cards is now wrong —
      // and being wrong about your own row is the funniest thing in the game.
      forget(s, a.id);
      forget(s, b.id);
      log(s, playerId, `${short(playerId)} trades one of theirs with ${short(move.target ?? '')}, sight unseen.`);
    }
    s.pendingPower = null;
    return swapEndTurn(s, playerId);
  }

  if (move.actionId === 'swapCall') {
    s.caller = playerId;
    // Everybody else gets exactly one more turn, and then the cards come over.
    s.callTurnsLeft = s.players.length - 1;
    log(s, playerId, `${short(playerId)} calls ${cfg.callName}! One turn each, then cards down.`);
    return swapEndTurn(s, playerId);
  }

  return s;
}

/** Total of what a player is actually holding, whether or not they know it. */
function swapTotal(s: MatchState, p: string): number {
  return swapGrid(s, p).reduce((a, c) => a + (cardPoints(s.definition.scoring, c) ?? 0), 0);
}

function swapEndTurn(s: MatchState, playerId: string): MatchState {
  void playerId;
  if (s.caller) {
    s.callTurnsLeft -= 1;
    if (s.callTurnsLeft <= 0) return endSwapRound(s);
  }
  s.swapTurns += 1;
  const cap = s.definition.swap!.turnCap ?? 60;
  if (s.swapTurns >= cap) {
    log(s, null, `Nobody called after ${cap} turns — cards down.`);
    return endSwapRound(s);
  }
  advanceTurn(s);
  return s;
}

function endSwapRound(s: MatchState): MatchState {
  const cfg = s.definition.swap!;
  s.phase = 'roundOver';
  for (const p of s.players) {
    for (const c of swapGrid(s, p)) s.faceUp[c.id] = true;
    s.scores[p] = swapTotal(s, p);
  }
  let best = s.players[0];
  for (const p of s.players) if (s.scores[p] < s.scores[best]) best = p;

  /*
    The call has to be worth being right about.

    Calling when you are lowest is the whole skill; calling when you are not has to cost, or the
    correct play is to call on turn one every time and the game disappears. A caller who is not
    lowest takes the penalty and the round goes to whoever actually was.
  */
  const caller = s.caller;
  if (caller && s.scores[caller] > s.scores[best]) {
    s.scores[caller] += cfg.callPenalty;
    log(s, null, `${short(caller)} called ${cfg.callName} and was not lowest — ${cfg.callPenalty} against.`);
  }
  for (const p of s.players) if (s.scores[p] < s.scores[best]) best = p;
  s.winner = best;
  log(s, null, `Cards down. ${short(best)} is lowest on ${s.scores[best]}.`);
  finalizeMatchProgress(s);
  return s;
}

// ---------- maid family (Old Maid) ----------
//
// The one family here where a turn touches someone else's hand rather than a pile. Nobody
// chooses which card changes hands — the drawer names a POSITION in the target's fan, sight
// unseen, exactly as blind to them as it is to the person being drawn from.

/** Pull every same-rank pair out of a hand, into the void, until none remain. */
function maidDiscardPairs(s: MatchState, playerId: string): void {
  const hand = s.zones[`hand:${playerId}`] || (s.zones[`hand:${playerId}`] = []);
  const voidPile = (s.zones['void'] ||= []);
  for (;;) {
    const byRank = new Map<string, number>();
    let pairAt = -1;
    for (let i = 0; i < hand.length; i++) {
      const seen = byRank.get(hand[i].rank);
      if (seen !== undefined) { pairAt = i; byRank.set(hand[i].rank, seen); break; }
      byRank.set(hand[i].rank, i);
    }
    if (pairAt < 0) break;
    const rank = hand[pairAt].rank;
    const partner = hand.findIndex((c) => c.rank === rank);
    const [a, b] = [pairAt, partner].sort((x, y) => y - x);
    const cardA = hand.splice(a, 1)[0];
    const cardB = hand.splice(b, 1)[0];
    voidPile.push(cardA, cardB);
    log(s, playerId, `${short(playerId)} pairs off ${cardLabel(cardA)}.`);
  }
}

/** The next player still holding cards, walking forward from `from` — the one you draw from. */
function maidNextHolder(s: MatchState, from: number): string | null {
  const n = s.players.length;
  for (let step = 1; step <= n; step++) {
    const p = s.players[(from + step) % n];
    if ((s.zones[`hand:${p}`] || []).length > 0) return p;
  }
  return null;
}

function maidLegalMoves(state: MatchState, playerId: string): Move[] {
  if (state.phase !== 'playing') return [];
  if (state.players[state.turnIndex] !== playerId) return [];
  const target = maidNextHolder(state, state.turnIndex);
  if (!target) return [];
  const hand = state.zones[`hand:${target}`] || [];
  return hand.map((_, i) => ({ actionId: 'maidDraw', target, slot: i }));
}

function applyMaidMove(s: MatchState, playerId: string, move: Move): MatchState {
  if (move.actionId !== 'maidDraw') return s;
  const target = move.target ?? '';
  // Re-checked here, not just at legalMoves() time, the same way every sibling family
  // re-validates inside its own apply* — a draw can only ever be from the one hand next in
  // rotation, never a named hand of the caller's choosing.
  if (target !== maidNextHolder(s, s.turnIndex)) return s;
  const targetHand = s.zones[`hand:${target}`] || [];
  const i = move.slot ?? 0;
  if (i < 0 || i >= targetHand.length) return s;
  const card = targetHand.splice(i, 1)[0];
  const hand = (s.zones[`hand:${playerId}`] ||= []);
  hand.push(card);
  log(s, playerId, `${short(playerId)} draws blind from ${short(target)}.`);
  maidDiscardPairs(s, playerId);

  // Everyone but one player empty-handed: whoever is left is holding the card that could never
  // pair, and that is the whole loss condition — nothing else about how they played mattered.
  const holders = s.players.filter((p) => (s.zones[`hand:${p}`] || []).length > 0);
  if (holders.length <= 1) {
    s.phase = 'roundOver';
    const loser = holders[0] ?? playerId;
    for (const p of s.players) s.scores[p] = p === loser ? 1 : 0;
    // Everyone but the loser tied for not losing — there is no second place in Old Maid, only
    // one player who is it and everyone who is not. `s.winner` still has to name somebody, and
    // naming the same seat every time (whoever happens to sort first) would make that seat look
    // like it was winning the GAME rather than merely not holding one unlucky card at the end.
    // Picked fairly at random from the safe group instead of by array position.
    const safe = s.players.filter((p) => p !== loser);
    const { result, rngState } = seededShuffle(safe, s.rngState);
    s.rngState = rngState;
    s.winner = result[0] ?? s.players[0];
    log(s, null, `${short(loser)} is left holding it.`);
    finalizeMatchProgress(s);
    return s;
  }
  /*
    Emptying your hand is safe for good, not just until the next card lands on you.

    `advanceTurn` moves one seat at a time regardless of what is in anybody's hand, which is
    right for every other family — a shedding player who goes out is DONE for the hand, they do
    not draw again. Old Maid is the same idea from the other side: once you have nothing left,
    you have nothing left to hold the odd card with, and the turn has no reason to ever come
    back to you. Skipping straight to the next actual holder is not an optimisation, it is the
    rule — without it an emptied hand could draw its way back into risk, which is a different
    and much longer game than the one being dealt.
  */
  const next = maidNextHolder(s, s.turnIndex);
  if (next) s.turnIndex = s.players.indexOf(next);
  return s;
}

// ---------- layout family (Kings Corner) ----------
//
// A shared tableau. Everybody builds on the same piles, so a card you cannot use is a card you
// are handing to the next player, and the pile you free is one anybody may fill.

export const layoutZones = { pile: (i: number) => `lay:${i}` };

/** The corners are the last `cornerPiles` of them, which is what makes them corners. */
function layoutIsCorner(def: MatchState['definition'], i: number): boolean {
  return i >= def.layout!.piles;
}

/** Every pile in the middle, in order: the cross first, then the corners. */
export function layoutPileIds(def: MatchState['definition']): string[] {
  const cfg = def.layout!;
  return Array.from({ length: cfg.piles + cfg.cornerPiles }, (_, i) => layoutZones.pile(i));
}

/**
 * May this card sit on that pile?
 *
 * Two questions, really. An empty corner asks for one rank and nothing else. An empty ordinary
 * pile asks for nothing at all. A pile with something on it wants the next card down, in the
 * shape the game builds in.
 */
function layoutAccepts(s: MatchState, pileIndex: number, card: Card): boolean {
  const cfg = s.definition.layout!;
  const pile = s.zones[layoutZones.pile(pileIndex)] || [];
  if (pile.length === 0) {
    return layoutIsCorner(s.definition, pileIndex) ? card.rank === cfg.cornerRank : true;
  }
  const top = pile[pile.length - 1];
  const order = s.definition.deck.rankOrder as readonly string[];
  // One rank below the top card. Kings are the ceiling, so nothing goes on them but a queen.
  if (order.indexOf(card.rank) !== order.indexOf(top.rank) - 1) return false;
  if (cfg.build === 'alt-color') return cardColor(card) !== cardColor(top) && cardColor(card) !== 'none';
  if (cfg.build === 'same-suit') return card.suit === top.suit;
  return true;
}

function layoutLegalMoves(state: MatchState, playerId: string): Move[] {
  if (state.phase !== 'playing') return [];
  if (state.players[state.turnIndex] !== playerId) return [];
  const cfg = state.definition.layout!;
  const moves: Move[] = [];
  const hand = state.zones[`hand:${playerId}`] || [];
  const draw = state.zones['draw'] || [];
  const n = cfg.piles + cfg.cornerPiles;

  // One card, taken before anything else — so the choice you make is made with it in hand.
  if (state.layoutDrew !== playerId && draw.length > 0) return [{ actionId: 'layoutDraw' }];

  for (const c of hand) {
    for (let i = 0; i < n; i++) {
      if (layoutAccepts(state, i, c)) moves.push({ actionId: 'layoutPlay', cardId: c.id, to: layoutZones.pile(i) });
    }
  }

  if (cfg.movePiles) {
    for (let from = 0; from < n; from++) {
      const src = state.zones[layoutZones.pile(from)] || [];
      if (src.length === 0) continue;
      for (let to = 0; to < n; to++) {
        if (to === from) continue;
        // A whole pile moves on the strength of its BOTTOM card, which is the one that has to
        // land somewhere legal — everything above it is already in order behind it.
        const dest = state.zones[layoutZones.pile(to)] || [];
        // Dropping a pile into an empty ordinary space just moves the problem, so it is only a
        // move when the destination has something to continue.
        if (dest.length === 0) continue;
        if (layoutAccepts(state, to, src[0])) {
          moves.push({ actionId: 'layoutMove', from: layoutZones.pile(from), to: layoutZones.pile(to) });
        }
      }
    }
  }

  // Stopping is always allowed: you may be holding a card you would rather not give away.
  moves.push({ actionId: 'layoutDone' });
  return moves;
}

function applyLayoutMove(s: MatchState, playerId: string, move: Move): MatchState {
  const hand = s.zones[`hand:${playerId}`] || (s.zones[`hand:${playerId}`] = []);

  if (move.actionId === 'layoutDraw') {
    const draw = s.zones['draw'] || [];
    const c = draw.pop();
    if (c) { hand.push(c); s.faceUp[c.id] = true; }
    s.layoutDrew = playerId;
    log(s, playerId, `${short(playerId)} draws.`);
    return s;
  }

  if (move.actionId === 'layoutPlay') {
    const i = hand.findIndex((c) => c.id === move.cardId);
    if (i < 0) return s;
    const card = hand[i];
    // Re-checked here, not just at legalMoves() time — every sibling family (trick, climb, fish,
    // rummy, bluff, reflex, poker) re-validates inside its own apply* the same way, so a build-
    // order violation can't reach the board even if something bypasses the legal-moves gate.
    const pileIndex = Number((move.to ?? '').split(':')[1]);
    if (!Number.isInteger(pileIndex) || !layoutAccepts(s, pileIndex, card)) return s;
    const pile = (s.zones[move.to ?? ''] ||= []);
    hand.splice(i, 1);
    pile.push(card);
    s.faceUp[card.id] = true;
    s.layoutIdle = 0;
    log(s, playerId, `${short(playerId)} plays ${cardLabel(card)}.`);
    if (hand.length === 0) {
      s.phase = 'roundOver';
      s.winner = playerId;
      if (!s.finished.includes(playerId)) s.finished.push(playerId);
      s.players.forEach((p) => { s.scores[p] = (s.zones[`hand:${p}`] || []).length; });
      log(s, null, `${short(playerId)} is out — round over.`);
      finalizeMatchProgress(s);
    }
    return s;
  }

  if (move.actionId === 'layoutMove') {
    const src = s.zones[move.from ?? ''] || [];
    const dest = (s.zones[move.to ?? ''] ||= []);
    if (src.length === 0) return s;
    const destIndex = Number((move.to ?? '').split(':')[1]);
    if (!Number.isInteger(destIndex) || dest.length === 0 || !layoutAccepts(s, destIndex, src[0])) return s;
    dest.push(...src.splice(0, src.length));
    s.layoutIdle = 0;
    log(s, playerId, `${short(playerId)} moves a pile across.`);
    return s;
  }

  // layoutDone
  s.layoutIdle += 1;
  s.layoutDrew = null;
  /*
    Nobody has played a card for a whole time round the table.

    With the stock gone, stopping is the only move anybody has, so the turn would go round for
    ever. When it has been all the way round with nothing played, the round is over and the
    smallest hand wins — which is how it ends at a real table too, once everyone has looked at
    the layout and shrugged.
  */
  if (s.layoutIdle >= s.players.length && (s.zones['draw'] || []).length === 0) {
    s.phase = 'roundOver';
    let best = s.players[0];
    for (const p of s.players) {
      if ((s.zones[`hand:${p}`] || []).length < (s.zones[`hand:${best}`] || []).length) best = p;
    }
    s.winner = best;
    s.players.forEach((p) => { s.scores[p] = (s.zones[`hand:${p}`] || []).length; });
    log(s, null, `Nobody can move — ${short(best)} is left holding the fewest.`);
    finalizeMatchProgress(s);
    return s;
  }
  advanceTurn(s);
  log(s, playerId, `${short(playerId)} is done.`);
  return s;
}

export const kentZones = { pool: 'kent:pool' };

/** Partners sit opposite, so pairs are the odd seats against the even ones. */
// Partners sit opposite — seat i and seat i+n/2, not "the even seats vs the odd seats", which
// only happen to be the same split at 4 players. At 6, seat parity groups {0,2,4} against
// {1,3,5}, three players a side rather than three genuine two-person partnerships {0,3},{1,4},
// {2,5}; opposite-seat pairing is the one formula that gives real partners at both table sizes.
export function kentTeamOf(s: MatchState, playerId: string): string {
  const n = s.players.length;
  const half = n / 2;
  const i = s.players.indexOf(playerId);
  return String.fromCharCode(65 + Math.min(i, (i + half) % n));
}

function kentPool(s: MatchState): Card[] {
  return (s.zones[kentZones.pool] ||= []);
}

/** Four of a kind — the hand you are trying to build, and the only reason to signal. */
export function kentHasFour(s: MatchState, playerId: string): boolean {
  const hand = s.zones[`hand:${playerId}`] || [];
  // A whole hand of one rank. Asking only that every card matches would let a hand of two
  // count, which is not four of a kind and is not what anybody is signalling about.
  if (hand.length !== s.definition.kent!.handSize) return false;
  return hand.every((c) => c.rank === hand[0].rank);
}

/** Is the tell still up? It lapses on its own, so nobody has to remember to take it down. */
function kentTellLive(s: MatchState): boolean {
  if (!s.kentTell) return false;
  if (s.ply - s.kentTell.ply > s.definition.kent!.tellPlies) { s.kentTell = null; return false; }
  return true;
}

function kentLegalMoves(state: MatchState, playerId: string): Move[] {
  if (state.phase !== 'playing') return [];
  const moves: Move[] = [];
  const hand = state.zones[`hand:${playerId}`] || [];
  const pool = state.zones[kentZones.pool] || [];
  const tell = state.kentTell;
  const tellUp = !!tell && state.ply - tell.ply <= state.definition.kent!.tellPlies;

  if (tellUp && tell) {
    if (tell.player !== playerId) {
      const partners = kentTeamOf(state, tell.player) === kentTeamOf(state, playerId);
      moves.push(partners ? { actionId: 'kentCall' } : { actionId: 'kentStop' });
    }
    // Looking away is a move.
    //
    // A tell lapses after a few MOVES, and moves are the only clock the engine has — so if
    // every seat that could call simply declined to act, nothing would advance and the tell
    // would hang there for ever. This is the seat that saw nothing: it costs the round
    // nothing and it lets the moment pass, which is exactly what it is.
    moves.push({ actionId: 'kentWait' });
    return moves;
  }

  if (kentHasFour(state, playerId)) moves.push({ actionId: 'kentSignal' });
  for (const mine of hand) {
    for (const theirs of pool) moves.push({ actionId: 'kentSwap', cardId: mine.id, poolId: theirs.id });
  }
  // Nobody wants what is on the table: throw it in and turn four more.
  if (pool.length > 0
    && (state.zones['draw'] || []).length + (state.zones['discard'] || []).length >= pool.length) {
    moves.push({ actionId: 'kentRefresh' });
  }
  return moves;
}

function applyKentMove(s: MatchState, playerId: string, move: Move): MatchState {
  const cfg = s.definition.kent!;
  const hand = s.zones[`hand:${playerId}`] || (s.zones[`hand:${playerId}`] = []);
  const pool = kentPool(s);

  // There is no turn order here to force a stalemate through — war has roundCap, swap has
  // turnCap, reflex has flipCap; Kent had nothing, so a stubborn or hostile client that only
  // ever swaps and refreshes without ever signalling could keep a round open forever.
  const cap = cfg.roundCap ?? 3000;
  s.stallCount += 1;
  if (s.stallCount >= cap) {
    // Nobody signalled and nobody was caught, so no letter is owed to anyone — the "winner"
    // recorded is a fair random pick among the partnerships rather than always the same seat.
    const teams = [...new Set(s.players.map((p) => kentTeamOf(s, p)))];
    const { result, rngState } = seededShuffle(teams, s.rngState);
    s.rngState = rngState;
    const winners = result[0];
    const caller = s.players.find((p) => kentTeamOf(s, p) === winners) ?? playerId;
    log(s, null, 'Nobody signalled in time — the round is thrown in.');
    kentEndRound(s, winners, null, caller);
    return s;
  }

  if (move.actionId === 'kentSwap') {
    if (kentTellLive(s)) return s;
    const mine = hand.findIndex((c) => c.id === move.cardId);
    const theirs = pool.findIndex((c) => c.id === move.poolId);
    if (mine < 0 || theirs < 0) return s;
    const given = hand[mine];
    const taken = pool[theirs];
    hand[mine] = taken;
    pool[theirs] = given;
    log(s, playerId, `${short(playerId)} swaps a card with the table.`);
    return s;
  }

  if (move.actionId === 'kentRefresh') {
    if (kentTellLive(s)) return s;
    const draw = s.zones['draw'] || (s.zones['draw'] = []);
    const spent = pool.splice(0, pool.length);
    (s.zones['discard'] ||= []).push(...spent);
    // The deck comes round again. Sixteen cards are in hands and four on the table, so a fifty-
    // two card deck is spent after eight turnovers — and a table nobody can turn over is a
    // table where the four you need may simply not be in play, which is not a game, it is a
    // wait. What has been thrown in is shuffled and dealt again, the way it is at a real table.
    if (draw.length < cfg.poolSize) {
      const back = (s.zones['discard'] || []).splice(0);
      const { result, rngState } = seededShuffle(back, s.rngState);
      s.rngState = rngState;
      draw.push(...result);
    }
    for (let i = 0; i < cfg.poolSize; i++) { const c = draw.pop(); if (c) pool.push(c); }
    log(s, playerId, `${short(playerId)} turns the table over — ${cfg.poolSize} new cards.`);
    return s;
  }

  if (move.actionId === 'kentSignal') {
    if (kentTellLive(s) || !kentHasFour(s, playerId)) return s;
    s.kentTell = { player: playerId, ply: s.ply };
    log(s, playerId, `${short(playerId)} signals.`);
    return s;
  }

  if (move.actionId === 'kentWait') return s;   // the ply it costs is the whole point

  if (move.actionId === 'kentCall' || move.actionId === 'kentStop') {
    if (!kentTellLive(s) || !s.kentTell) return s;
    const teller = s.kentTell.player;
    if (teller === playerId) return s;
    const sameTeam = kentTeamOf(s, teller) === kentTeamOf(s, playerId);
    // Whoever spotted it wins the round, whichever side of the table they are on: a partner
    // calling it takes it for their pair, an opponent calling it off takes it for theirs.
    const winners = kentTeamOf(s, playerId);
    const teams = [...new Set(s.players.map((p) => kentTeamOf(s, p)))];
    /*
      "The other team" only means one specific thing when there are exactly two. At 6 players
      there are three partnerships, and an opponent calling off a signal unambiguously costs the
      TELLER's own team a letter regardless of how many teams are at the table — but a partner
      correctly confirming their own team's signal doesn't say anything about either of the
      OTHER two pairs, so there is no honest way to pick one of them to punish for a round they
      were not even part of. Two-team tables keep the original always-somebody-loses scoring
      (unchanged from what shipped and was measured); a confirmed signal at a 3-pair table wins
      the round for that pair without forcing a letter onto an uninvolved third pair.
    */
    const losers = teams.length <= 2
      ? teams.find((t) => t !== winners) ?? winners
      : (sameTeam ? null : kentTeamOf(s, teller));
    log(s, playerId, sameTeam
      ? `${short(playerId)} calls Kent — ${short(teller)} had four ${kentFourRank(s, teller)}s.`
      : `${short(playerId)} calls it off — ${short(teller)} was signalling.`);
    kentEndRound(s, winners, losers, playerId);
    return s;
  }

  return s;
}

function kentFourRank(s: MatchState, playerId: string): string {
  const hand = s.zones[`hand:${playerId}`] || [];
  return hand[0]?.rank ?? '?';
}

/** A round is over: the losing pair takes a letter (if there is one this round), and a fresh
 *  hand goes out. `losers` is null only at a 3-pair table when a partner confirms their own
 *  team's signal — a genuine round win with no pair to blame it on. */
function kentEndRound(s: MatchState, winners: string, losers: string | null, caller: string): void {
  const cfg = s.definition.kent!;
  s.kentTell = null;
  s.phase = 'roundOver';
  for (const p of s.players) s.scores[p] = kentTeamOf(s, p) === winners ? 1 : 0;
  // The round belongs to whoever spotted it. Naming whichever partner happens to sit first
  // made every game in the self-play report look as though seats three and four never won one.
  s.winner = caller;
  if (losers) {
    s.kentLetters[losers] = (s.kentLetters[losers] ?? 0) + 1;
    const spelt = cfg.letters.slice(0, s.kentLetters[losers]);
    log(s, null, `Pair ${losers} takes a letter — ${spelt.split('').join('-')}.`);
  } else {
    log(s, null, `Pair ${winners} wins the round.`);
  }
  finalizeMatchProgress(s);
}

// ---------- the set family (spotting combinations on a shared board) ----------
//
// The odd one out. No turns, no hands, no pile: a board of cards is face up and everyone is
// looking at the same thing, so "whose go is it" has no meaning. Whoever names a valid
// combination first gets it, and the board is refilled.
//
// Validity is one rule applied to every property: the chosen cards must be all-the-same or
// all-different in each. That is why the deck had to be built from properties — with ranks and
// suits there is nothing to be all-different about.

export const setZones = { board: 'set:board', deck: 'set:deck' };

/** All-same or all-different, for every property. The whole game. */
export function isValidSet(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  const names = Object.keys(cards[0].attrs ?? {});
  if (names.length === 0) return false;
  for (const name of names) {
    const seen = new Set(cards.map((c) => c.attrs?.[name]));
    if (seen.size !== 1 && seen.size !== cards.length) return false;
  }
  return true;
}

/** Every combination of the given size that is valid. Used to know when the board is dead. */
function findSets(board: Card[], size: number): Card[][] {
  const out: Card[][] = [];
  const walk = (start: number, picked: Card[]) => {
    if (picked.length === size) {
      if (isValidSet(picked)) out.push(picked.slice());
      return;
    }
    for (let i = start; i < board.length; i++) walk(i + 1, [...picked, board[i]]);
  };
  walk(0, []);
  return out;
}

function setLegalMoves(state: MatchState): Move[] {
  if (state.phase !== 'playing') return [];
  const cfg = state.definition.set!;
  const board = state.zones[setZones.board] ?? [];
  // Everybody may call at any moment, so every valid combination on the board is a legal move
  // for every player. This is what makes the family turn-free rather than simultaneous-turn.
  const moves: Move[] = findSets(board, cfg.size).map((cards) => ({
    actionId: 'callSet',
    cards: cards.map((c) => c.id),
  }));
  if (moves.length > 0) moves.push({ actionId: 'setPass' });
  return moves;
}

/** Top the board back up to its size, as far as the deck allows. */
function refillSetBoard(s: MatchState): void {
  const cfg = s.definition.set!;
  const board = s.zones[setZones.board] ?? (s.zones[setZones.board] = []);
  const deck = s.zones[setZones.deck] ?? (s.zones[setZones.deck] = []);
  while (board.length < cfg.boardSize && deck.length > 0) board.push(deck.pop()!);

  // A board with nothing on it is a stuck game, so deal more until there is something to find.
  // With the deck empty and no combination left, the game is over — which is how a real one ends.
  while (findSets(board, cfg.size).length === 0 && deck.length > 0) {
    for (let i = 0; i < cfg.size && deck.length > 0; i++) board.push(deck.pop()!);
  }
}

function applySetMove(s: MatchState, playerId: string, move: Move): MatchState {
  // A player who cannot see one yet says so. Nothing changes — it exists so a bot that has not
  // spotted anything has something legal to do rather than being forced to call at random.
  if (move.actionId === 'setPass') return s;
  if (move.actionId !== 'callSet' || !move.cards) return s;
  const cfg = s.definition.set!;
  const board = s.zones[setZones.board] ?? [];
  const picked = move.cards.map((id) => board.find((c) => c.id === id)).filter((c): c is Card => !!c);
  if (picked.length !== cfg.size) return s;

  if (!isValidSet(picked)) {
    // Calling wrongly costs something, or there would be no reason not to call constantly.
    s.scores[playerId] = (s.scores[playerId] ?? 0) - cfg.penalty;
    log(s, playerId, `${short(playerId)} called a set that was not one (-${cfg.penalty}).`);
    return s;
  }

  s.zones[setZones.board] = board.filter((c) => !move.cards!.includes(c.id));
  s.scores[playerId] = (s.scores[playerId] ?? 0) + cfg.score;
  log(s, playerId, `${short(playerId)} spots a set (+${cfg.score}).`);
  refillSetBoard(s);
  setCheckEnd(s);
  return s;
}

/** Over when nothing is left to find and there is nothing left to deal. */
function setCheckEnd(s: MatchState): boolean {
  if (s.phase !== 'playing') return false;
  const cfg = s.definition.set!;
  const board = s.zones[setZones.board] ?? [];
  const deck = s.zones[setZones.deck] ?? [];
  if (deck.length > 0 || findSets(board, cfg.size).length > 0) return false;
  s.phase = 'roundOver';
  let best = s.players[0];
  for (const p of s.players) if ((s.scores[p] ?? 0) > (s.scores[best] ?? 0)) best = p;
  s.winner = best;
  log(s, null, `No sets left — ${short(best)} wins with ${s.scores[best] ?? 0}.`);
  finalizeMatchProgress(s);
  return true;
}

// ---------- redaction (hidden information) ----------

export function redact(state: MatchState, viewer: string): RedactedState {
  const def = state.definition;
  const zones: Record<string, RedactedZone> = {};

  for (const z of def.zones) {
    if (z.perPlayer) {
      // Represent the viewer's own per-player zone under its base id.
      const key = `${z.id}:${viewer}`;
      const cards = state.zones[key] || [];
      zones[z.id] = {
        id: z.id,
        visibility: z.visibility,
        cards: z.visibility === 'owner' || z.visibility === 'all' ? cards.slice() : [],
        count: cards.length,
        faceDown: z.faceDown,
      };
    } else {
      const cards = state.zones[z.id] || [];
      let visible: Card[] = [];
      if (z.visibility === 'all') visible = cards.slice();
      else if (z.visibility === 'top-public') visible = cards.length ? [cards[cards.length - 1]] : [];
      zones[z.id] = {
        id: z.id,
        visibility: z.visibility,
        cards: visible,
        count: cards.length,
        faceDown: z.faceDown,
      };
    }
  }

  return {
    gameName: def.meta.name,
    you: viewer,
    players: state.players.map((p, i) => ({
      id: p,
      handCount: (state.zones[`hand:${p}`] || []).length,
      isTurn: i === state.turnIndex && state.phase === 'playing',
    })),
    direction: state.direction,
    zones,
    hand: (state.zones[`hand:${viewer}`] || []).slice(),
    // Shared vars are table talk — "hearts are broken" is something everyone can see. A var
    // scoped to a player is that player's own, and handing every seat's private counters to
    // every client would leak whatever an author put in them.
    vars: Object.fromEntries(Object.entries(state.vars).filter(([k]) => {
      const sep = k.indexOf(':');
      if (sep < 0) return true;
      const owner = k.slice(0, sep);
      return !state.players.includes(owner) || owner === viewer;
    })),
    phase: state.phase,
    winner: state.winner,
    isYourTurn:
      state.phase === 'playing' &&
      (state.pendingChoice
        ? state.pendingChoice.player === viewer
        : state.discarding
        ? state.discarding === viewer
        : state.passDirection
        ? !(viewer in state.passChoices)
        : state.sittingOut === viewer
        ? false
        // These four don't share the trick/climb/rummy notion of "whose turn" — each has its
        // own legality (an open-market trade, a claim to challenge, a slap, a bet) — so ask the
        // family directly rather than compare against `turnIndex`, which for reflex indexes the
        // active-player subset, not the raw seat list, and would name the wrong seat outright.
        : state.definition.bluff ? bluffLegalMoves(state, viewer).length > 0
        : state.definition.reflex ? reflexLegalMoves(state, viewer).length > 0
        : state.definition.poker ? pokerLegalMoves(state, viewer).length > 0
        : state.definition.kent ? kentLegalMoves(state, viewer).length > 0
        : state.definition.pit ? pitLegalMoves(state, viewer).length > 0
        : state.players[state.turnIndex] === viewer || climbBombMoves(state, viewer).length > 0),
    pendingChoice: state.pendingChoice,
    scores: { ...state.scores },
    log: state.log.slice(-40),
    mode: state.definition.solitaire ? 'solitaire' : state.definition.trick ? 'trick' : state.definition.climb ? 'climb' : state.definition.fish ? 'fish' : state.definition.rummy ? 'rummy' : state.definition.war ? 'war'
      : state.definition.bluff ? 'bluff' : state.definition.reflex ? 'reflex' : state.definition.poker ? 'poker' : state.definition.pit ? 'pit' : state.definition.kent ? 'kent' : state.definition.set ? 'set' : state.definition.layout ? 'layout' : state.definition.swap ? 'swap' : state.definition.maid ? 'maid' : 'shedding',
    ...(state.definition.solitaire ? solitaireView(state) : {}),
    layoutPiles: state.definition.layout
      ? layoutPileIds(state.definition).map((id, i) => ({
        id,
        cards: (state.zones[id] || []).slice(),
        // Only a shut corner is waiting for a rank; everything else takes what it is given.
        opensOn: i >= state.definition.layout!.piles ? state.definition.layout!.cornerRank : null,
      }))
      : undefined,
    layoutDrawn: state.definition.layout ? state.layoutDrew === viewer : undefined,
    /*
      Every row on the table, told to ONE person.

      A slot holds a card where this viewer has been shown it and null where they have not —
      and that is true of their own row as much as anybody's. The whole game is that your four
      are as hidden from you as everyone else's, apart from the ones you have looked at, so
      there is deliberately no special case here for the viewer's own cards.
    */
    grids: state.definition.swap
      ? state.players.map((p) => ({
        player: p,
        slots: (state.zones[swapZones.grid(p)] || []).map(
          (c) => (state.phase !== 'playing' || hasSeen(state, viewer, c.id) ? c : null),
        ),
      }))
      : undefined,
    held: state.definition.swap && state.held?.player === viewer ? state.held.card : undefined,
    heldFrom: state.definition.swap && state.held?.player === viewer ? state.held.from : undefined,
    power: state.definition.swap && state.pendingPower?.player === viewer
      ? state.pendingPower.kind : undefined,
    caller: state.definition.swap ? state.caller : undefined,
    battle: state.definition.war ? (state.lastBattle ?? []).map((b) => b.card) : undefined,
    warsCount: state.definition.war ? state.warsCount : undefined,
    shotMoon: state.definition.trick?.shootTheMoon ? (state.shotMoon ?? null) : undefined,
    roundOutcome: (state.definition.rummy?.knock !== undefined || state.definition.trick?.numericAuction)
      ? (state.roundOutcome ?? null) : undefined,
    rummyPhase: state.definition.rummy ? state.rummyPhase : undefined,
    meldMoves: state.definition.rummy && state.definition.rummy.knock === undefined
      && state.players[state.turnIndex] === viewer && state.rummyPhase === 'play'
      ? findMelds(state, state.zones[`hand:${viewer}`] || []) : undefined,
    deadwood: state.definition.rummy?.knock !== undefined
      ? bestArrangement(state, state.zones[`hand:${viewer}`] || []).deadwood : undefined,
    trick: state.definition.trick ? state.trickPlays.map((t) => ({ ...t })) : undefined,
    // The trick just taken, so the table can show it being collected instead of blinking out.
    lastTrick: state.definition.trick && state.lastTrick
      ? { winner: state.lastTrick.winner, plays: state.lastTrick.plays.map((t) => ({ ...t })) }
      : undefined,
    lead: state.definition.trick ? state.lead : undefined,
    tricksWon: state.definition.trick ? { ...state.tricksWon } : undefined,
    finished: state.definition.climb ? state.finished.slice() : undefined,
    climbPile: state.definition.climb
      ? (() => {
          const dz = state.definition.zones.find((z) => z.visibility === 'top-public');
          const cards = dz ? state.zones[dz.id] || [] : [];
          return state.climbShape > 0 ? cards.slice(-state.climbShape) : [];
        })()
      : undefined,
    booksWon: state.definition.fish ? { ...state.booksWon } : undefined,
    oceanCount: state.definition.fish ? (state.zones[oceanZoneId(state.definition)] || []).length : undefined,
    bids: state.definition.trick?.bidding ? { ...state.bids } : undefined,
    bidding: state.definition.trick?.bidding ? state.bidding : undefined,
    teams: state.definition.trick?.partnerships ? trickTeams(state) : undefined,
    trumpSuit: state.definition.trick ? trumpOf(state) : undefined,
    auctionRound: state.definition.trick?.auction ? state.auctionRound : undefined,
    // The auction is public by definition — bids are spoken aloud. The contract that comes out
    // of it is the single most important fact at the table, so everyone sees it.
    contractAuction: state.definition.trick?.numericAuction ? state.auctionRound > 0 : undefined,
    contractTricks: state.definition.trick?.numericAuction && state.highBid
      ? state.highBid.level + state.definition.trick.numericAuction.book
      : undefined,
    upcard: state.definition.trick?.auction
      ? topCard(state.zones[state.definition.trick.auction.upcardZone] || []) ?? null : undefined,
    maker: state.definition.trick?.auction ? state.maker : undefined,
    alone: state.definition.trick?.auction ? state.alone : undefined,
    sittingOut: state.definition.trick?.auction ? state.sittingOut : undefined,
    dealer: state.definition.trick?.auction ? state.players[state.dealerIndex] : undefined,
    matchScores: { ...state.matchScores },
    handScores: state.handScores.map((r) => ({ ...r })),
    handNumber: state.handNumber,
    matchOver: state.matchOver,
    matchWinner: state.matchWinner,
    matchTarget: state.definition.scoring.target ?? null,
    matchBust: state.definition.scoring.bust ?? null,
    passDirection: state.passDirection,
    needsPassChoice: !!state.passDirection && !(viewer in state.passChoices),
    passWaitingOn: state.passDirection ? state.players.filter((p) => !(p in state.passChoices)).length : 0,
    passCount: state.passCount,
    passStaged: (state.passStaged[viewer] || []).slice(),
    brokenSuitPlayed: state.definition.trick?.brokenSuit ? state.brokenSuitPlayed : undefined,
    // bluff
    centerCount: state.definition.bluff ? (state.zones[bluffCenterZone(def)] || []).length : undefined,
    pendingClaim: state.definition.bluff
      ? (state.pendingClaim ? { player: state.pendingClaim.player, count: state.pendingClaim.count, claimedRank: state.pendingClaim.claimedRank } : null)
      : undefined,
    bluffCaught: state.definition.bluff ? { ...state.bluffCaught } : undefined,
    bluffCalled: state.definition.bluff ? { ...state.bluffCalled } : undefined,
    lastReveal: state.definition.bluff ? state.lastReveal : undefined,
    // reflex
    pileTop: state.definition.reflex ? (topCard(state.zones[reflexPileZone(def)] || []) ?? null) : undefined,
    slapValid: state.definition.reflex ? reflexSlapValid(state) : undefined,
    reflexOut: state.definition.reflex ? state.reflexOut.slice() : undefined,
    // poker
    chips: state.definition.poker ? { ...state.chips } : undefined,
    pot: state.definition.poker ? state.pot : undefined,
    currentBet: state.definition.poker ? state.currentBet : undefined,
    committed: state.definition.poker ? { ...state.committed } : undefined,
    folded: state.definition.poker ? { ...state.folded } : undefined,
    // Gated on an actual showdown, not merely "the hand is over" — a fold-winner never has to
    // show their cards, in this engine or at a real table.
    showdown: state.definition.poker && state.phase === 'roundOver' && state.pokerWasShowdown
      ? state.players.filter((p) => !state.folded[p]).map((p) => {
          const cards = state.zones[`hand:${p}`] || [];
          return { player: p, cards: cards.slice(), label: pokerHandStrength(def, cards).label };
        })
      : undefined,
    // pit
    market: state.definition.pit ? state.market.map((o) => ({ ...o })) : undefined,
    tradesCompleted: state.definition.pit ? { ...state.tradesCompleted } : undefined,
    cornerSize: state.definition.pit ? pitCorner(state) : undefined,
    // kent: the middle of the table is face up to everybody by definition, the tell is the
    // whole point of the game being visible, and the letters are written down in front of
    // everyone. Nothing here is a leak; the hands stay hidden as they always were.
    kentPool: state.definition.kent ? (state.zones[kentZones.pool] ?? []).map((c) => ({ ...c })) : undefined,
    kentTell: state.definition.kent
      ? (state.kentTell && state.ply - state.kentTell.ply <= state.definition.kent.tellPlies
          ? { player: state.kentTell.player } : null)
      : undefined,
    kentLetters: state.definition.kent ? { ...state.kentLetters } : undefined,
    kentWord: state.definition.kent ? state.definition.kent.letters : undefined,
    kentReady: state.definition.kent ? kentHasFour(state, viewer) : undefined,
    // set: the board is face up to everyone by definition, so there is nothing to hide. The
    // deck count is public too — knowing how much is left is part of the game, not a leak.
    setBoard: state.definition.set ? (state.zones['set:board'] ?? []).map((c) => ({ ...c })) : undefined,
    setDeckLeft: state.definition.set ? (state.zones['set:deck'] ?? []).length : undefined,
    setSize: state.definition.set ? state.definition.set.size : undefined,
    // The count alone, not which cards — a player still has to find them, but knows whether
    // it's worth looking (Set is famous for a board with genuinely zero on it).
    setsAvailable: state.definition.set ? findSets(state.zones['set:board'] ?? [], state.definition.set.size).length : undefined,
    // numeric (Bridge-style) auction
    highBid: state.definition.trick?.numericAuction ? state.highBid : undefined,
  };
}

// ---------- logging / labels ----------

function log(state: MatchState, player: string | null, text: string): void {
  state.log.push({ t: state.log.length, player, text });
}

function short(id: string): string {
  return id;
}

function suitWord(s: string): string {
  return { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades' }[s] || s;
}

/** "1 Diamond", "3 Diamonds" — a suit name is plural, and a count of one has to agree. */
function suitCount(n: number, s: string): string {
  const plural = suitWord(s);
  return `${n} ${n === 1 ? plural.replace(/s$/, '') : plural}`;
}

function suitName(s: string): string {
  return { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades' }[s] ?? s;
}

function cardLabel(c: Card): string {
  const sym = { C: '♣', D: '♦', H: '♥', S: '♠', JOKER: '★' }[c.suit] || '';
  return c.rank === 'JOKER' ? 'Joker' : `${c.rank}${sym}`;
}
