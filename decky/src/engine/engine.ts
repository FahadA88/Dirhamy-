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
  ActionDef, Card, Effect, GameDefinition, MatchState, Move, Predicate,
  RedactedState, RedactedZone, ScoringDef, Suit, TrickConfig, ZoneDef,
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
  carry?: { matchScores: Record<string, number>; handNumber: number },
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
    tricksWon: Object.fromEntries(players.map((p) => [p, 0])),
    bids: {},
    bidding: !!def.trick?.bidding,
    trumpSuit: def.trick?.auction ? null : (def.trick?.trump ?? null),
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
    vars: {},
    scores: Object.fromEntries(players.map((p) => [p, 0])),
    phase: 'playing',
    winner: null,
    pendingChoice: null,
    passDirection: null,
    passCount: 1,
    passChoices: {},
    passStaged: {},
    brokenSuitPlayed: false,
    log: [],
    matchScores: carry?.matchScores ?? Object.fromEntries(players.map((p) => [p, 0])),
    handNumber: carry?.handNumber ?? 1,
    matchOver: false,
    matchWinner: null,
  };

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
      for (let i = 0; i < step.countPerPlayer; i++) {
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
  if (def.trick?.auction) {
    // The deal rotates each hand, and bidding opens to the dealer's left.
    state.dealerIndex = ((carry?.handNumber ?? 1) - 1) % players.length;
    state.auctionRound = 1;
    state.turnIndex = (state.dealerIndex + 1) % players.length;
    const up = topCard(state.zones[def.trick.auction.upcardZone] || []);
    log(state, null, `${short(players[state.dealerIndex])} deals. ${up ? `${cardLabel(up)} is turned up.` : ''}`);
  } else if (def.trick && !state.passDirection && !state.bidding) {
    state.turnIndex = openingLeadSeat(state);
  }
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
  return false;
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

export function legalMoves(state: MatchState, playerId: string): Move[] {
  if (state.phase !== 'playing') return [];

  // A simultaneous pass overrides whose turn it is, in every family — each player who hasn't
  // finished choosing may pick a card to give away, regardless of the normal turn order.
  if (state.passDirection) {
    if (playerId in state.passChoices) return [];
    const staged = state.passStaged[playerId] || [];
    const hand = state.zones[`hand:${playerId}`] || [];
    return hand.filter((c) => !staged.includes(c.id)).map((c) => ({ actionId: 'choosePass', cardId: c.id }));
  }

  if (state.definition.trick) return trickLegalMoves(state, playerId);
  if (state.definition.climb) return climbLegalMoves(state, playerId);
  if (state.definition.fish) return fishLegalMoves(state, playerId);
  if (state.definition.rummy) return rummyLegalMoves(state, playerId);
  if (state.definition.war) return state.players[state.turnIndex] === playerId ? [{ actionId: 'warFlip' }] : [];

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
    finished: state.finished.slice(),
    booksWon: { ...state.booksWon },
    pendingChoice: state.pendingChoice ? { ...state.pendingChoice } : null,
    passChoices: Object.fromEntries(Object.entries(state.passChoices).map(([k, v]) => [k, v.slice()])),
    passStaged: Object.fromEntries(Object.entries(state.passStaged).map(([k, v]) => [k, v.slice()])),
    climbBombDeclined: { ...state.climbBombDeclined },
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
        state.vars[e.var] = resolveValue(e.value, ctx);
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

  if (def.trick) return applyTrickMove(s, playerId, move);
  if (def.climb) return applyClimbMove(s, playerId, move);
  if (def.fish) return applyFishMove(s, playerId, move);
  if (def.rummy) return applyRummyMove(s, playerId, move);
  if (def.war) return applyWarMove(s, playerId, move);

  // Resolve a pending suit choice.
  if (move.actionId === 'resolveChoice') {
    if (!s.pendingChoice || s.pendingChoice.player !== playerId) return s;
    s.vars[s.pendingChoice.setState] = move.choice!;
    log(s, playerId, `${short(playerId)} chose ${suitWord(move.choice!)}.`);
    s.pendingChoice = null;
    advanceAndCheck(s);
    return s;
  }

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
  } else if (move.actionId === 'drawCard') {
    log(s, playerId, `${short(playerId)} drew a card.`);
  }

  // Draw-pile-empty triggers (e.g. reshuffle).
  fireDrawPileTriggers(s);

  // If a choice is pending (e.g. wild suit) or a simultaneous pass just started, pause here —
  // turn does not advance until it resolves.
  if (s.pendingChoice) return s;
  if (s.passDirection) return s;

  advanceAndCheck(s);
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

// Who leads trick 1: the holder of the designated lead card (Hearts' 2♣), else seat 0.
function openingLeadSeat(s: MatchState): number {
  const lead = s.definition.trick?.leadCard;
  if (!lead) return 0;
  const i = s.players.findIndex((p) => (s.zones[`hand:${p}`] || []).some((c) => c.id === lead));
  return i >= 0 ? i : 0;
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
    endRound(s, 'stuck');
  }
}

function advanceTurn(s: MatchState): void {
  const n = s.players.length;
  const steps = 1 + s.skipCount;
  s.skipCount = 0;
  s.turnIndex = ((s.turnIndex + s.direction * steps) % n + n) % n;
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

function cardPoints(s: ScoringDef, card: Card): number {
  const cp = s.cardPoints || {};
  const byRank = cp[card.rank];
  if (byRank === 'rankValue') return rankValue(card.rank);
  if (typeof byRank === 'number') return byRank;
  if (cp.default === 'rankValue') return rankValue(card.rank);
  if (typeof cp.default === 'number') return cp.default;
  return 0;
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
  const current = state.players[state.turnIndex];
  if (state.definition.climb?.bombSize) {
    // A bomb can interrupt out of turn — anyone holding one is also "acting" right now.
    const bombers = state.players.filter((p) => p !== current && climbBombMoves(state, p).length > 0);
    if (bombers.length > 0) return [current, ...bombers];
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
    handNumber: state.handNumber + 1,
  });
}

// ---------- trick-taking family ----------

// Trump is normally fixed by the definition, but an auction game names it per hand.
function trumpOf(s: MatchState): Suit | 'none' {
  return s.definition.trick!.auction ? (s.trumpSuit ?? 'none') : s.definition.trick!.trump;
}

const SAME_COLOUR: Record<string, string> = { C: 'S', S: 'C', H: 'D', D: 'H' };

// The left bower is a trump card, not a card of its printed suit — for following suit AND for
// resolving the trick. Every suit comparison in this family goes through here.
function suitOf(s: MatchState, card: Card): string {
  const t = trumpOf(s);
  if (!s.definition.trick!.bowers || t === 'none') return card.suit;
  if (card.rank === 'J' && card.suit === SAME_COLOUR[t]) return t;
  return card.suit;
}

// Rank within a trick: right bower tops, then left bower, then the rest of the rank order.
function trickStrength(s: MatchState, card: Card): number {
  const cfg = s.definition.trick!;
  const t = trumpOf(s);
  if (cfg.bowers && t !== 'none' && card.rank === 'J') {
    if (card.suit === t) return 3000;
    if (card.suit === SAME_COLOUR[t]) return 2900;
  }
  const base = s.definition.deck.rankOrder.indexOf(card.rank as never);
  return cfg.aceHigh && card.rank === 'A' ? 1000 : base;
}

function trickLegalMoves(state: MatchState, playerId: string): Move[] {
  const cfgEarly = state.definition.trick!;

  // The dealer owes a discard after taking the upcard — nothing else can happen until they do.
  if (state.discarding) {
    if (state.discarding !== playerId) return [];
    return (state.zones[`hand:${playerId}`] || []).map((c) => ({ actionId: 'dealerDiscard', cardId: c.id }));
  }

  if (state.sittingOut === playerId) return [];   // partner is out while the maker plays alone
  if (state.players[state.turnIndex] !== playerId) return [];
  const def = state.definition;

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
  // Trump auction and the dealer's discard.
  if (s.discarding || s.auctionRound > 0) {
    const auctionMoves = trickLegalMoves(s, playerId);
    if (!auctionMoves.some((m) => m.actionId === move.actionId && m.choice === move.choice
      && !!m.alone === !!move.alone && m.cardId === move.cardId)) return s;
    return applyAuctionMove(s, playerId, move);
  }

  // Bidding phase.
  if (s.bidding) {
    if (move.actionId !== 'bid' || move.choice === undefined) return s;
    s.bids[playerId] = parseInt(move.choice, 10);
    log(s, playerId, `${short(playerId)} bids ${move.choice}${move.choice === '0' ? ' (nil)' : ''}.`);
    if (Object.keys(s.bids).length >= s.players.length) { s.bidding = false; s.turnIndex = 0; }
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
  if (s.trickPlays.length === 0) s.lead = suitOf(s, card) as MatchState['lead'];
  const brk = s.definition.trick!.brokenSuit;
  if (brk && card.suit === brk && !s.brokenSuitPlayed) {
    s.brokenSuitPlayed = true;
    log(s, null, `${suitName(brk)} are broken.`);
  }
  s.trickPlays.push({ player: playerId, card });
  log(s, playerId, `${short(playerId)} played ${cardLabel(card)}.`);

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

function resolveTrick(s: MatchState, trickZoneId: string): void {
  const cfg = s.definition.trick!;
  const trump = trumpOf(s);
  const category = (suit: string) => (trump !== 'none' && suit === trump ? 2 : suit === s.lead ? 1 : 0);
  const value = (c: Card) => category(suitOf(s, c)) * 10000 + trickStrength(s, c);

  let winner = s.trickPlays[0];
  for (const play of s.trickPlays) if (value(play.card) > value(winner.card)) winner = play;
  s.tricksWon[winner.player] = (s.tricksWon[winner.player] ?? 0) + 1;

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

  s.zones[trickZoneId] = [];
  s.trickPlays = [];
  s.lead = null;
  s.turnIndex = s.players.indexOf(winner.player); // winner leads the next trick
  log(s, null, `${short(winner.player)} takes the trick (${s.tricksWon[winner.player]}).`);

  // Round ends when every hand still in play is empty.
  if (activeSeats(s).every((p) => (s.zones[`hand:${p}`] || []).length === 0)) endTrickRound(s);
}

export function trickTeams(s: MatchState): string[][] {
  if (s.definition.trick?.partnerships && s.players.length === 4) {
    return [[s.players[0], s.players[2]], [s.players[1], s.players[3]]];
  }
  return s.players.map((p) => [p]);
}

function endTrickRound(s: MatchState): void {
  const cfg = s.definition.trick!;
  s.phase = 'roundOver';

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

// ---------- rummy / melding family ----------

function rummyZones(def: MatchState['definition']) {
  return {
    stock: def.zones.find((z) => z.shared && z.type === 'pile' && z.visibility === 'none')!.id,
    discard: def.zones.find((z) => z.visibility === 'top-public')!.id,
    melds: def.zones.find((z) => z.shared && z.visibility === 'all')?.id,
  };
}

// Every set (same rank) and run (consecutive same suit) currently layable from a hand.
function findMelds(state: MatchState, hand: Card[]): { cards: string[]; label: string }[] {
  const cfg = state.definition.rummy!;
  const order = state.definition.deck.rankOrder;
  const out: { cards: string[]; label: string }[] = [];

  // sets: 3+ of a rank
  const byRank: Record<string, Card[]> = {};
  for (const c of hand) (byRank[c.rank] ??= []).push(c);
  for (const [rank, cs] of Object.entries(byRank)) {
    if (cs.length >= cfg.setMin) out.push({ cards: cs.map((c) => c.id), label: `${cs.length}×${rank}` });
  }

  // runs: consecutive same-suit sequences
  for (const suit of ['C', 'D', 'H', 'S']) {
    const cs = hand.filter((c) => c.suit === suit).sort((a, b) => order.indexOf(a.rank as never) - order.indexOf(b.rank as never));
    let i = 0;
    while (i < cs.length) {
      let j = i + 1;
      while (j < cs.length && order.indexOf(cs[j].rank as never) === order.indexOf(cs[j - 1].rank as never) + 1) j++;
      const run = cs.slice(i, j);
      if (run.length >= cfg.runMin) out.push({ cards: run.map((c) => c.id), label: `${run[0].rank}–${run[run.length - 1].rank}${suitSym(suit)}` });
      i = j > i + 1 ? j : i + 1;
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

  const byRank = new Map<string, number[]>();
  hand.forEach((c, i) => {
    const list = byRank.get(c.rank) ?? [];
    list.push(i);
    byRank.set(c.rank, list);
  });
  for (const idxs of byRank.values()) {
    for (let sub = 1; sub < 1 << idxs.length; sub++) {
      let count = 0;
      let mask = 0;
      for (let b = 0; b < idxs.length; b++) if (sub & (1 << b)) { mask |= 1 << idxs[b]; count++; }
      if (count >= cfg.setMin) masks.push(mask);
    }
  }

  for (const suit of ['C', 'D', 'H', 'S']) {
    const cs = hand.map((c, i) => ({ c, i })).filter((x) => x.c.suit === suit)
      .sort((a, b) => order.indexOf(a.c.rank as never) - order.indexOf(b.c.rank as never));
    for (let i = 0; i < cs.length; i++) {
      let mask = 1 << cs[i].i;
      for (let j = i + 1; j < cs.length; j++) {
        if (order.indexOf(cs[j].c.rank as never) !== order.indexOf(cs[j - 1].c.rank as never) + 1) break;
        mask |= 1 << cs[j].i;
        if (j - i + 1 >= cfg.runMin) masks.push(mask);
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
  const isSet = meld.every((c) => c.rank === meld[0].rank);
  if (isSet) return card.rank === meld[0].rank && meld.length + 1 <= 4;
  if (!meld.every((c) => c.suit === meld[0].suit) || card.suit !== meld[0].suit) return false;
  const idx = meld.map((c) => order.indexOf(c.rank as never)).sort((a, b) => a - b);
  const ci = order.indexOf(card.rank as never);
  void cfg;
  return ci === idx[0] - 1 || ci === idx[idx.length - 1] + 1;
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

// Melds already on the table, grouped back out of the shared pile so cards can be added to them.
function tableMelds(state: MatchState): Card[][] {
  const z = rummyZones(state.definition);
  if (!z.melds) return [];
  const cards = state.zones[z.melds] || [];
  const cfg = state.definition.rummy!;
  const out: Card[][] = [];
  let cur: Card[] = [];
  for (const c of cards) {
    if (cur.length === 0) { cur = [c]; continue; }
    const sameSet = cur.every((x) => x.rank === c.rank);
    const sameRun = cur.every((x) => x.suit === c.suit);
    if (sameSet || sameRun) cur.push(c); else { out.push(cur); cur = [c]; }
  }
  if (cur.length) out.push(cur);
  return out.filter((m) => m.length >= Math.min(cfg.setMin, cfg.runMin));
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
  const ok = legal.find((m) => m.actionId === move.actionId && m.cardId === move.cardId && sameCards(m.cards, move.cards));
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
    const melds = tableMelds(s);
    const meld = melds[parseInt(move.choice ?? '', 10)];
    const i = hand.findIndex((c) => c.id === move.cardId);
    if (!meld || i < 0) return s;
    const [card] = hand.splice(i, 1);
    // Rebuild the shared pile with the card inserted into its meld, so groupings survive.
    const rebuilt: Card[] = [];
    for (const m of melds) {
      rebuilt.push(...m);
      if (m === meld) rebuilt.push(card);
    }
    if (z.melds) s.zones[z.melds] = rebuilt;
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
    s.stallCount = 0;
    log(s, playerId, `${short(playerId)} melds ${melded.map(cardLabel).join(' ')}.`);
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
    log(s, knocker, `GIN — ${short(knocker)} scores ${s.scores[knocker]}.`);
  } else if (theirDeadwood < mine.deadwood) {
    s.scores[defender] = mine.deadwood - theirDeadwood + (cfg.undercutBonus ?? 0);
    s.winner = defender;
    log(s, defender, `Undercut! ${short(defender)} scores ${s.scores[defender]} (${theirDeadwood} v ${mine.deadwood}).`);
  } else if (theirDeadwood === mine.deadwood) {
    s.scores[defender] = cfg.undercutBonus ?? 0;
    s.winner = defender;
    log(s, defender, `Undercut on a tie — ${short(defender)} scores ${s.scores[defender]}.`);
  } else {
    s.scores[knocker] = theirDeadwood - mine.deadwood;
    s.winner = knocker;
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
  for (const p of s.players) s.scores[p] = (s.zones[`hand:${p}`] || []).length; // fewer left = better
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
  if (move.actionId !== 'warFlip' || s.players[s.turnIndex] !== playerId) return s;
  const [a, b] = s.players;
  const battleZone = s.definition.zones.find((z) => z.shared && z.visibility === 'all')!.id;
  const handA = s.zones[`hand:${a}`];
  const handB = s.zones[`hand:${b}`];
  s.zones[battleZone] = [];
  const pot: Card[] = [];

  let guard = 0;
  while (guard++ < 20) {
    const ca = handA.shift();
    const cb = handB.shift();
    if (!ca || !cb) { if (ca) pot.push(ca); if (cb) pot.push(cb); break; }
    pot.push(ca, cb);
    s.zones[battleZone] = [ca, cb];
    const sa = warStrength(s.definition, ca.rank);
    const sb = warStrength(s.definition, cb.rank);
    if (sa !== sb) {
      const winnerHand = sa > sb ? handA : handB;
      winnerHand.push(...shuffleForWar(s, pot));
      log(s, null, `${short(sa > sb ? a : b)} wins ${ca.rank} vs ${cb.rank}.`);
      break;
    }
    // tie → war: 3 face-down each, then flip again
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
    zones,
    hand: (state.zones[`hand:${viewer}`] || []).slice(),
    vars: { ...state.vars },
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
        : state.players[state.turnIndex] === viewer || climbBombMoves(state, viewer).length > 0),
    pendingChoice: state.pendingChoice,
    scores: { ...state.scores },
    log: state.log.slice(-40),
    mode: state.definition.trick ? 'trick' : state.definition.climb ? 'climb' : state.definition.fish ? 'fish' : state.definition.rummy ? 'rummy' : state.definition.war ? 'war' : 'shedding',
    battle: state.definition.war ? (state.zones[state.definition.zones.find((z) => z.shared && z.visibility === 'all')!.id] || []).slice() : undefined,
    rummyPhase: state.definition.rummy ? state.rummyPhase : undefined,
    meldMoves: state.definition.rummy && state.definition.rummy.knock === undefined
      && state.players[state.turnIndex] === viewer && state.rummyPhase === 'play'
      ? findMelds(state, state.zones[`hand:${viewer}`] || []) : undefined,
    deadwood: state.definition.rummy?.knock !== undefined
      ? bestArrangement(state, state.zones[`hand:${viewer}`] || []).deadwood : undefined,
    trick: state.definition.trick ? state.trickPlays.map((t) => ({ ...t })) : undefined,
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
    upcard: state.definition.trick?.auction
      ? topCard(state.zones[state.definition.trick.auction.upcardZone] || []) ?? null : undefined,
    maker: state.definition.trick?.auction ? state.maker : undefined,
    alone: state.definition.trick?.auction ? state.alone : undefined,
    sittingOut: state.definition.trick?.auction ? state.sittingOut : undefined,
    dealer: state.definition.trick?.auction ? state.players[state.dealerIndex] : undefined,
    matchScores: { ...state.matchScores },
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

function suitName(s: string): string {
  return { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades' }[s] ?? s;
}

function cardLabel(c: Card): string {
  const sym = { C: '♣', D: '♦', H: '♥', S: '♠', JOKER: '★' }[c.suit] || '';
  return c.rank === 'JOKER' ? 'Joker' : `${c.rank}${sym}`;
}
